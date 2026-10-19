"use strict";

const fs = require("node:fs");
const { packageNameFromKey, extractDirectDependencyNames } = require("./dependency-update-info.js");
const { fetchVulnerabilityInfo } = require("./dependency-vulnerability-info.js");

// issue #1095。既存のdependency-risk-summary job（PRのpackage-lock.json差分に
// 対してのみ動作する）は、Renovateが更新PRを出さない限り一度も実行されない。
// 間接依存は親パッケージのバージョン範囲内で解決されるため、親パッケージ自体が
// range外の新しいバージョンを必要とする脆弱性修正を取り込めない場合、Renovateは
// 通常検知できない。このため、Renovateの提案可否に依存しない独立したセーフティ
// ネットとして、mainブランチのpackage-lock.jsonを対象にした定期フルスキャンを追加する

// package-lock.json（npm lockfileVersion 3）の全パッケージエントリ（直接・間接問わず）
// から { name, version, direct } の一覧を抽出する。同名パッケージが複数バージョンで
// 存在する場合（ネストしたnode_modules配下）はいずれも対象に含める
// （name+versionで重複除去し、同じ組み合わせの再チェックは避ける）
function extractAllPackages(lockJson) {
  const packages = lockJson?.packages ?? {};
  const directNames = extractDirectDependencyNames(lockJson);

  const seen = new Set();
  const result = [];
  for (const [key, entry] of Object.entries(packages)) {
    if (key === "") continue;
    const name = packageNameFromKey(key);
    const version = entry?.version;
    if (!name || !version) continue;

    const dedupeKey = `${name}@${version}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    result.push({ name, version, direct: directNames.has(name) });
  }
  return result.sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
}

// lockJson全体を対象にOSV.devへ脆弱性照会し、1件以上の脆弱性が見つかったパッケージ
// のみを返す（対象外のパッケージまで毎回列挙すると、Issue本文が肥大化し
// textlintのmax-linesにも抵触しやすいため、Risk SummaryのSecurity節とは異なり
// 「見つかった場合のみ」の設計にする。スキャン自体が実行されたかどうかは、
// ワークフロー側のJob Summary・Issueの有無で確認できる）
// fetchJsonImpl: テスト用に差し替え可能なHTTP呼び出し実装（既定はグローバルfetch）
async function scanLockFileForVulnerabilities(lockJson, { fetchJsonImpl } = {}) {
  const packages = extractAllPackages(lockJson);
  const results = await fetchVulnerabilityInfo(packages, fetchJsonImpl ? { fetchJsonImpl } : {});

  const byNameVersion = new Map(packages.map((p) => [`${p.name}@${p.version}`, p]));
  return results
    .filter((r) => r.vulnerabilities.length > 0)
    .map((r) => ({
      ...r,
      direct: byNameVersion.get(`${r.name}@${r.version}`)?.direct ?? false,
    }));
}

function main() {
  const [, , lockPath] = process.argv;
  if (!lockPath) {
    console.error("Usage: node dependency-full-scan.js <package-lock.json>");
    process.exitCode = 1;
    return;
  }

  const lockJson = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
  scanLockFileForVulnerabilities(lockJson)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_vulnerabilities=${result.length > 0}\n`);
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
  extractAllPackages,
  scanLockFileForVulnerabilities,
};
