"use strict";

const fs = require("node:fs");
const { extractDirectDependencyNames, packageNameFromKey } = require("./dependency-update-info.js");
const { detectDeprecation } = require("./dependency-deprecation-info.js");

// issue #969。issue #945で追加したdeprecated検知（dependency-deprecation-info.js）は、
// 「更新前バージョン」と「更新後バージョン」を比較するdependency-risk-summary job
// （更新PRが存在する場合のみ実行される）からのみ呼ばれる。そのため、Renovateが
// 更新PR自体を作らない「後継バージョンが存在しないまま非推奨化されたパッケージ」
// （本issueの発生源であるaws-sdk v2のケースそのもの）は、PRが無いために一度も
// 評価されず、素通りしてしまう。
//
// 本スクリプトは更新PRの有無に関わらず、現時点でロックされている依存パッケージ全体を
// 対象にdeprecated状態を検知する（スケジュール実行での定期スキャン用）。
// directOnly（既定true）: 直接依存のみを対象とする。transitive依存まで含めると
// 検知件数が膨大になり、対応判断が難しい（自分では直接アップグレードできない）
// パッケージまで通知してしまうため、既定では直接依存のみに絞る

const NPM_REGISTRY_BASE = "https://registry.npmjs.org";

async function defaultFetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`npm registry request to ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// lockJson: package-lock.jsonの内容。戻り値: [{ name, version, deprecated }]
// （name+versionの重複は除く。同名パッケージが複数バージョン存在する場合は
// バージョンごとに1件とする）
async function scanForDeprecated(lockJson, { directOnly = true, fetchJsonImpl = defaultFetchJson } = {}) {
  const directNames = extractDirectDependencyNames(lockJson);
  const packages = lockJson?.packages ?? {};

  const targets = new Map(); // name -> Set<version>
  for (const [key, entry] of Object.entries(packages)) {
    if (key === "" || !entry?.version) continue;
    const name = packageNameFromKey(key);
    if (!name) continue;
    if (directOnly && !directNames.has(name)) continue;
    if (!targets.has(name)) targets.set(name, new Set());
    targets.get(name).add(entry.version);
  }

  const results = [];
  for (const [name, versions] of targets) {
    let packageJson;
    try {
      packageJson = await fetchJsonImpl(`${NPM_REGISTRY_BASE}/${name}`);
    } catch {
      continue; // issue #945系と同じ方針: 個別パッケージの取得失敗は無視し、安全側（検知漏れ）に倒す
    }
    for (const version of versions) {
      const detected = detectDeprecation(packageJson, version);
      if (detected) results.push({ name, version, deprecated: detected.deprecated });
    }
  }
  return results;
}

function main() {
  const [, , lockfilePath, directOnlyArg] = process.argv;
  if (!lockfilePath) {
    console.error("Usage: node dependency-deprecation-scan.js <package-lock.json> [direct-only(true|false)]");
    process.exitCode = 1;
    return;
  }

  const lockJson = JSON.parse(fs.readFileSync(lockfilePath, "utf-8"));
  const directOnly = directOnlyArg !== "false";

  scanForDeprecated(lockJson, { directOnly })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_deprecated=${result.length > 0}\n`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  scanForDeprecated,
};
