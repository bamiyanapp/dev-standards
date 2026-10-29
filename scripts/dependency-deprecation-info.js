"use strict";

const fs = require("node:fs");
const { createFetchJson, NPM_REGISTRY_BASE } = require("./lib/http-fetch.js");

// issue #945。CVE/CVSS/KEV/EPSS（dependency-vulnerability-info.js等）は「既知の
// 脆弱性が出ているか」を検知できるが、aws-sdk（v2系）のようにメンテナンスモード・
// サポート終了（EOL）となり今後の脆弱性修正自体が出なくなったパッケージは、CVEが
// 無い限り検知できない。npm registryの各バージョンレスポンス（GET /{name}）には
// `deprecated`フィールドがあり、これを見れば非推奨状態を機械的に検知できる
// （karuta#1656・#1658の調査で確認）。
//
// dependency-maintainer-info.jsと同じ構成（registryレスポンスを解析する純粋関数＋
// 実際にHTTPリクエストを行うオーケストレーション関数の分離）で実装する


// registryの"GET /{name}"レスポンスから、指定バージョンのdeprecatedフィールドを
// 抽出する。該当バージョンの情報自体が取得できない場合（削除されたバージョン等）は
// 判定不能としてnullを返す
function detectDeprecation(packageJson, version) {
  const versionInfo = packageJson?.versions?.[version];
  if (!versionInfo) return null;
  return versionInfo.deprecated ? { deprecated: versionInfo.deprecated } : null;
}

const defaultFetchJson = createFetchJson({
  formatError: (url, response) => `npm registry request to ${url} failed: ${response.status} ${response.statusText}`,
});

// changes: dependency-update-info.jsのchanges（[{ name, oldVersion, newVersion, ... }]）
// oldVersion・newVersionのいずれも無い変更（新規追加・削除のみ等）は対象外とする。
// 戻り値: [{ name, oldVersion, newVersion, oldDeprecated, newDeprecated }]
// oldDeprecated・newDeprecatedは、それぞれのバージョンがdeprecatedの場合のみメッセージ
// 文字列を持ち、該当しない場合はキー自体を含めない。いずれのバージョンも
// deprecatedでないパッケージは戻り値の配列に含めない
async function fetchDeprecationInfo(changes, { fetchJsonImpl = defaultFetchJson } = {}) {
  const targets = changes.filter((c) => c.oldVersion != null || c.newVersion != null);
  const results = [];
  for (const change of targets) {
    const packageJson = await fetchJsonImpl(`${NPM_REGISTRY_BASE}/${change.name}`);
    const oldResult = change.oldVersion != null ? detectDeprecation(packageJson, change.oldVersion) : null;
    const newResult = change.newVersion != null ? detectDeprecation(packageJson, change.newVersion) : null;
    if (!oldResult && !newResult) continue;
    const entry = { name: change.name, oldVersion: change.oldVersion, newVersion: change.newVersion };
    if (oldResult) entry.oldDeprecated = oldResult.deprecated;
    if (newResult) entry.newDeprecated = newResult.deprecated;
    results.push(entry);
  }
  return results;
}

function main() {
  const [, , dependencyUpdateInfoPath] = process.argv;
  if (!dependencyUpdateInfoPath) {
    console.error("Usage: node dependency-deprecation-info.js <dependency-update-info.json>");
    console.error("  <dependency-update-info.json> is the output of dependency-update-info.js");
    process.exitCode = 1;
    return;
  }

  const { changes } = JSON.parse(fs.readFileSync(dependencyUpdateInfoPath, "utf-8"));

  fetchDeprecationInfo(changes)
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
  detectDeprecation,
  fetchDeprecationInfo,
};
