"use strict";

const fs = require("node:fs");

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

const NPM_REGISTRY_BASE = "https://registry.npmjs.org";

// registryの"GET /{name}"レスポンスから、oldVersion・newVersionそれぞれの公開者
// （_npmUser.name）を抽出し、異なっていれば異常として返す。いずれかのバージョンの
// 公開者情報が取得できない場合（削除されたバージョン等）は判定不能としてnullを返す
function detectMaintainerChange(packageJson, oldVersion, newVersion) {
  const versions = packageJson?.versions ?? {};
  const oldPublisher = versions[oldVersion]?._npmUser?.name ?? null;
  const newPublisher = versions[newVersion]?._npmUser?.name ?? null;
  if (!oldPublisher || !newPublisher) return null;
  if (oldPublisher === newPublisher) return null;
  return { oldPublisher, newPublisher };
}

async function defaultFetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`npm registry request to ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// changes: dependency-update-info.jsのchanges（[{ name, oldVersion, newVersion, ... }]）
// oldVersion・newVersionのいずれかが無い変更（新規追加・削除のみ等）は対象外とする。
// 戻り値: [{ name, oldVersion, newVersion, oldPublisher, newPublisher }]
// （公開者が変化したパッケージのみを含む配列。変化が無いパッケージは含めない）
async function fetchMaintainerAnomalies(changes, { fetchJsonImpl = defaultFetchJson } = {}) {
  const targets = changes.filter((c) => c.oldVersion != null && c.newVersion != null);
  const anomalies = [];
  for (const change of targets) {
    const packageJson = await fetchJsonImpl(`${NPM_REGISTRY_BASE}/${change.name}`);
    const result = detectMaintainerChange(packageJson, change.oldVersion, change.newVersion);
    if (result) {
      anomalies.push({ name: change.name, oldVersion: change.oldVersion, newVersion: change.newVersion, ...result });
    }
  }
  return anomalies;
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
};
