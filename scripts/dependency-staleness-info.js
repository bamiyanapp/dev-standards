"use strict";

const fs = require("node:fs");
const { createFetchJson, NPM_REGISTRY_BASE } = require("./lib/http-fetch.js");

// issue #1076。CVE/CVSS/KEV/EPSS（dependency-vulnerability-info.js等）は「既知の
// 脆弱性が公表されているか」を見る指標であり、npm registryのdeprecatedフラグ
// （dependency-deprecation-info.js、issue #945）は「メンテナが明示的に非推奨化したか」を
// 見る指標である。いずれも、サポートが脆弱・利用者が少ないマイナーなパッケージが
// 「明示的にdeprecated化されないまま、単に更新が止まっている」だけの状態を検知できない。
// この場合、脆弱性が見つかってもCVEとして報告されず、修正版も出ないまま放置される
// リスクがある。
//
// npm registryの各パッケージレスポンス（GET /{name}）が持つ`time.modified`
// （そのパッケージの最新バージョンが公開された日時）を見て、直近一定期間
// 新バージョンが一度も公開されていないパッケージを機械的に検知する。
// dependency-deprecation-info.jsと同じ構成（registryレスポンスを解析する純粋関数＋
// 実際にHTTPリクエストを行うオーケストレーション関数の分離）で実装する

const STALE_THRESHOLD_DAYS_DEFAULT = 730; // 2年

// registryの"GET /{name}"レスポンスから、最終公開日時・経過日数・閾値判定結果を算出する。
// `time.modified`自体が取得できない場合（registry側の仕様変化等）は判定不能としてnullを返す。
// issue #1086: 閾値に該当しなかった場合もRisk Summaryへ実測値を表示できるよう、
// 該当の有無に関わらず常に結果を返す（`flagged`で判定結果を示す）
function detectStaleness(packageJson, thresholdDays = STALE_THRESHOLD_DAYS_DEFAULT, now = new Date()) {
  const modified = packageJson?.time?.modified;
  if (!modified) return null;
  const lastPublishedAt = new Date(modified);
  if (Number.isNaN(lastPublishedAt.getTime())) return null;
  const ageDays = Math.floor((now.getTime() - lastPublishedAt.getTime()) / (24 * 60 * 60 * 1000));
  return { lastPublishedAt: modified, ageDays, flagged: ageDays >= thresholdDays };
}

const defaultFetchJson = createFetchJson({
  formatError: (url, response) => `npm registry request to ${url} failed: ${response.status} ${response.statusText}`,
});

// changes: dependency-update-info.jsのchanges（[{ name, oldVersion, newVersion, ... }]）。
// 「このPRを適用せず現行バージョンに留まる場合の危険度」（維持リスク）の判定に使うため、
// oldVersionが存在する変更のみを対象にする（新規追加のみの変更は対象外）。
// issue #1156: production: falseのパッケージ（devDependency経由のみで到達し、本番コードに
// 含まれない）も対象外にする。放置されていても実害が無いパッケージの表示で、本来注目すべき
// 本番コードの依存が埋もれる問題への対応
// 戻り値: [{ name, oldVersion, newVersion, lastPublishedAt, ageDays, flagged }]
// issue #1086: 判定不能（time.modifiedが取得できない）パッケージのみ対象外とし、
// 閾値未満（flagged: false）のパッケージも含めて全件返す（Risk Summaryでの
// 実測値表示に使うため）。閾値への該当判定自体はflaggedで示す
async function fetchStalenessInfo(changes, { fetchJsonImpl = defaultFetchJson, thresholdDays = STALE_THRESHOLD_DAYS_DEFAULT, now } = {}) {
  const targets = changes.filter((c) => c.oldVersion != null && c.production !== false);
  const results = [];
  for (const change of targets) {
    const packageJson = await fetchJsonImpl(`${NPM_REGISTRY_BASE}/${change.name}`);
    const result = detectStaleness(packageJson, thresholdDays, now);
    if (!result) continue;
    results.push({ name: change.name, oldVersion: change.oldVersion, newVersion: change.newVersion, ...result });
  }
  return results;
}

function main() {
  const [, , dependencyUpdateInfoPath, thresholdDaysArg] = process.argv;
  if (!dependencyUpdateInfoPath) {
    console.error("Usage: node dependency-staleness-info.js <dependency-update-info.json> [thresholdDays]");
    console.error("  <dependency-update-info.json> is the output of dependency-update-info.js");
    process.exitCode = 1;
    return;
  }

  const { changes } = JSON.parse(fs.readFileSync(dependencyUpdateInfoPath, "utf-8"));
  const thresholdDays = thresholdDaysArg ? Number(thresholdDaysArg) : STALE_THRESHOLD_DAYS_DEFAULT;

  fetchStalenessInfo(changes, { thresholdDays })
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
  STALE_THRESHOLD_DAYS_DEFAULT,
  detectStaleness,
  fetchStalenessInfo,
};
