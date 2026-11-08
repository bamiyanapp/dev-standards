"use strict";

const fs = require("node:fs");
const { createFetchJson, NPM_REGISTRY_BASE } = require("./lib/http-fetch.js");

// issue #648（OSS依存更新の自動安全判定基盤 Phase 3）メンテナ/所有権異常の検知。
// サプライチェーン攻撃（event-stream事件等）の典型的な先行指標は、メンテナ交代・
// パッケージ所有権の移転である（#645「8-4」参照）。npm registryの各パッケージの
// 公開メタデータ（GET /{name}）には、バージョンごとの公開者情報（_npmUser）が
// 記録されている。旧バージョンと新バージョンで公開者（npmアカウント名）が異なる場合、
// 「メンテナが交代した可能性」として検知する
//
// 完全な暗号学的検証（npm registryの署名・provenance attestationの正当性検証）は
// 本モジュールのスコープ外とした。`npm audit signatures`はsigstoreのTUF
// （The Update Framework）リポジトリへの到達性を要求するが、このサンドボックス
// 環境・GitHub Actions実行環境双方での到達性が未確認であり、かつ出力が
// 機械可読な形で安定的に仕様化されていないため、パース結果の信頼性に懸念がある。
// 一方、公開者情報の変化は単純なJSONフィールド比較で検知でき、design docが
// 「典型的な先行指標」として最も明示的に名指ししている観点でもあるため、
// こちらを優先して実装する
//
// このモジュールは「registryレスポンスを解析する純粋関数」と「実際にHTTP
// リクエストを行うオーケストレーション関数」を分離する（dependency-vulnerability-info.js
// と同じ方針）。サンドボックス環境からnpm registry（registry.npmjs.org）への
// 到達性は確認済みだが、fetchJsonImplは差し替え可能にしてモックでテストする


// issue #1320。karuta#2054のレビューで、tslibのメンテナ変化
// （typescript-bot@microsoft.com → microsoft1es@microsoft.com）が実際には
// 同一組織内の公開パイプライン移行であり、実害が無いにもかかわらずHighへ
// 無条件エスカレーションされ、人間がnpm registryを都度手動確認する負荷が
// 生じていた。固定の「信頼ドメイン」ホワイトリストは、npm registryの
// _npmUser.emailが暗号学的に検証されていない（公開者の自己申告値）ため、
// リストに載ったドメインへの偽装でエスカレーション自体を回避できてしまう。
// 代わりに「新旧メンテナのメールドメインが一致しているか」を見る。
//
// ただしgmail.com等のフリーメール・パブリックメールプロバイダは誰でも
// 同一ドメインで新規アカウントを作成できるため、「ドメイン一致」が組織内の
// 継続性を保証しない。旧メンテナ・新メンテナ（実は攻撃者の別アカウント）が
// 共に同じフリーメールプロバイダを使っていた場合に判定を回避できてしまう
// 抜け道が生じる。既知のフリーメール・パブリックメールプロバイダのドメインを
// ブロックリスト化し、該当する場合はドメイン一致でも緩和対象外（真の意味での
// 「同一組織」とはみなさない）とする。このブロックリストはホワイトリストと
// 安全側の性質が異なる。リスト漏れ（未知のフリーメールプロバイダ）は
// 「誤って緩和してしまう」側に倒れるが、ホワイトリストのように「リストに
// 載ったドメインへの積極的な偽装」で回避される弱点は持たない
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "protonmail.com",
  "proton.me",
  "icloud.com",
  "aol.com",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "gmx.com",
  "163.com",
  "qq.com",
]);

function extractEmailDomain(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) return null;
  return email.split("@")[1].toLowerCase();
}

// oldEmail・newEmailのドメインが一致し、かつそのドメインがフリーメール
// ブロックリストに該当しない場合のみtrueを返す（「同一組織内の変化」とみなせる）
function isSameOrganizationDomain(oldEmail, newEmail) {
  const oldDomain = extractEmailDomain(oldEmail);
  const newDomain = extractEmailDomain(newEmail);
  if (!oldDomain || !newDomain) return false;
  if (oldDomain !== newDomain) return false;
  return !FREE_EMAIL_DOMAINS.has(oldDomain);
}

// registryの"GET /{name}"レスポンスから、oldVersion・newVersionそれぞれの公開者
// （_npmUser.name/email）を抽出し、異なっていれば異常として返す。いずれかの
// バージョンの公開者情報が取得できない場合（削除されたバージョン等）は
// 判定不能としてnullを返す。sameOrganizationDomainは、新旧メールドメインが
// 一致し、かつフリーメールブロックリストに該当しない場合にtrueとなる
// （dependency-risk-classifier.js側でHighからMediumへの緩和判定に使う）
function detectMaintainerChange(packageJson, oldVersion, newVersion) {
  const versions = packageJson?.versions ?? {};
  const oldUser = versions[oldVersion]?._npmUser ?? null;
  const newUser = versions[newVersion]?._npmUser ?? null;
  const oldPublisher = oldUser?.name ?? null;
  const newPublisher = newUser?.name ?? null;
  if (!oldPublisher || !newPublisher) return null;
  if (oldPublisher === newPublisher) return null;
  return {
    oldPublisher,
    newPublisher,
    sameOrganizationDomain: isSameOrganizationDomain(oldUser?.email, newUser?.email),
  };
}

const defaultFetchJson = createFetchJson({
  formatError: (url, response) => `npm registry request to ${url} failed: ${response.status} ${response.statusText}`,
});

// changes: dependency-update-info.jsのchanges（[{ name, oldVersion, newVersion, ... }]）
// oldVersion・newVersionのいずれかが無い変更（新規追加・削除のみ等）は対象外とする。
// 戻り値: [{ name, oldVersion, newVersion, oldPublisher, newPublisher }]
// （公開者が変化したパッケージのみを含む配列。変化が無いパッケージは含めない）
// issue #1241: 対象パッケージごとのnpm registry fetchは互いに依存しないため、
// Promise.allで並列化してCI実行時間を短縮する（戻り値の順序はtargetsの順序を維持する）
async function fetchMaintainerAnomalies(changes, { fetchJsonImpl = defaultFetchJson } = {}) {
  const targets = changes.filter((c) => c.oldVersion != null && c.newVersion != null);
  const anomalies = await Promise.all(
    targets.map(async (change) => {
      const packageJson = await fetchJsonImpl(`${NPM_REGISTRY_BASE}/${change.name}`);
      const result = detectMaintainerChange(packageJson, change.oldVersion, change.newVersion);
      if (!result) return null;
      return { name: change.name, oldVersion: change.oldVersion, newVersion: change.newVersion, ...result };
    }),
  );
  return anomalies.filter((anomaly) => anomaly !== null);
}

function main() {
  const [, , dependencyUpdateInfoPath] = process.argv;
  if (!dependencyUpdateInfoPath) {
    console.error("Usage: node dependency-maintainer-info.js <dependency-update-info.json>");
    console.error("  <dependency-update-info.json> is the output of dependency-update-info.js");
    process.exitCode = 1;
    return;
  }

  const { changes } = JSON.parse(fs.readFileSync(dependencyUpdateInfoPath, "utf-8"));

  fetchMaintainerAnomalies(changes)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  detectMaintainerChange,
  fetchMaintainerAnomalies,
  isSameOrganizationDomain,
  extractEmailDomain,
};
