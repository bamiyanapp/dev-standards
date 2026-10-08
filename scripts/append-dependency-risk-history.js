"use strict";

const fs = require("node:fs");
const path = require("node:path");

// issue #746 Phase 2: dev-standards自身のリリースに含まれる依存更新のRisk判定結果を、
// 各プロダクトリポジトリ（karuta等）が参照できる機械可読な履歴として残す。
// reusable-cd.ymlの「Compute dependency risk info for this release」ステップ
// （dev-standards自身のリリース時のみ実行、continue-on-error）が/tmp配下へ生成した
// risk-classification.json・stale-risk-classification.jsonを読み、新バージョンと
// 紐付けてdocs/generated/dependency-risk-history.jsonへ追記する。
//
// semantic-releaseのchangelogPrepareCmd（@semantic-release/execのprepareステップ）
// から呼ばれる。prepareCmdの失敗はコミット自体を止めてしまう（@semantic-release/git
// のcommitより前の工程のため）ため、本スクリプトは内部で何が起きても必ずexit 0で
// 終了する（失敗してもリリース自体は従来どおり進む。履歴への追記が1件スキップされる
// だけであり、安全側の設計とする）

const DEFAULT_OUTPUT_PATH = path.join(__dirname, "..", "docs", "generated", "dependency-risk-history.json");

function readJsonFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function buildEntry(version, riskResult, staleRiskResult) {
  return {
    version,
    date: new Date().toISOString(),
    riskLevel: riskResult?.level ?? null,
    riskReasons: riskResult?.reasons ?? [],
    staleRiskLevel: staleRiskResult?.level ?? null,
    staleRiskReasons: staleRiskResult?.reasons ?? [],
  };
}

function appendEntry(outputPath, entry) {
  const existing = readJsonFileIfExists(outputPath) ?? [];
  const withoutSameVersion = existing.filter((e) => e.version !== entry.version);
  const updated = [...withoutSameVersion, entry];
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
}

function main() {
  const [, , version, outputPath = DEFAULT_OUTPUT_PATH] = process.argv;
  if (!version) {
    console.error("Usage: node append-dependency-risk-history.js <version> [output-path]");
    console.error("  <version>は通常semantic-releaseの${nextRelease.version}をそのまま渡す");
    return; // exit 0のまま（リリースを止めない）
  }

  const riskResult = readJsonFileIfExists("/tmp/risk-classification.json");
  const staleRiskResult = readJsonFileIfExists("/tmp/stale-risk-classification.json");
  if (!riskResult && !staleRiskResult) {
    console.log("Risk判定データが無いため（初回リリース・前段ステップの失敗等）、履歴への追記をスキップする");
    return;
  }

  const entry = buildEntry(version, riskResult, staleRiskResult);
  appendEntry(outputPath, entry);
  console.log(`依存Risk履歴へ追記した: v${version}（riskLevel=${entry.riskLevel}, staleRiskLevel=${entry.staleRiskLevel}）`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`依存Risk履歴への追記に失敗したが、リリースは続行する: ${error.message}`);
  }
}

module.exports = { buildEntry, appendEntry };
