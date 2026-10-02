"use strict";

// issue #646（OSS依存更新の自動安全判定基盤 Phase 1）Task E。
// 同一ワークフロー実行内のtest系job・static analysis系jobの結論（success/failure/
// skipped/cancelled）を、Risk Summaryコメントに載せる表形式へ整形する。
//
// dependency-risk-summary job（reusable-ci.yml）はこれらのjobの実行結果を
// GitHub ActionsのneedsコンテキストからAPI呼び出し無しで直接取得できる
// （同一ワークフロー実行内のjob間連携のため）。そのためこのモジュールは
// 「結果を集約・整形する純粋関数」のみを提供し、ワークフロー側は
// `${{ needs.<job>.result }}`で取得した文字列をそのまま渡すだけでよい
//
// 失敗したjobについては、known-flaky-ci-patterns.js（issue #646 Task F）の登録簿と
// 突合し、既知のflakyパターンに該当する場合はRisk Summaryへその旨を注記する
const { findKnownFlakyPatterns } = require("./known-flaky-ci-patterns.js");

// jobKeyと、Risk Summary上での表示名・カテゴリ（test/staticAnalysis）の対応表。
// reusable-ci.ymlのjob idと一致させる（新しいjobを追加した場合はここにも追記すること）
const JOB_DEFINITIONS = [
  { key: "frontendTest", label: "frontend-test", category: "test" },
  { key: "backendTest", label: "backend-test", category: "test" },
  { key: "packageTest", label: "package-test", category: "test" },
  { key: "frontendE2eTest", label: "frontend-e2e-test", category: "test" },
  { key: "architectureCheck", label: "architecture-check", category: "staticAnalysis" },
  { key: "duplicationCheck", label: "duplication-check", category: "staticAnalysis" },
];

// 失敗とみなすGitHub Actionsのjob conclusion。'skipped'は（enable_*フラグ無効化や
// path filtering等による）意図的な非実行であり、失敗とは区別する
const FAILURE_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out"]);

// results: { frontendTest: 'success', backendTest: 'skipped', ... }（reusable-ci.ymlの
// `needs.<job>.result`をキャメルケース化したキーで渡す。未指定のjobキーは
// 'skipped'として扱う）
function summarizeCiResults(results = {}) {
  const tests = [];
  const staticAnalysis = [];
  let allTestsPassed = true;
  let allStaticAnalysisPassed = true;

  for (const def of JOB_DEFINITIONS) {
    const conclusion = results[def.key] ?? "skipped";
    const entry = { key: def.key, label: def.label, conclusion };
    if (def.category === "test") {
      tests.push(entry);
      if (FAILURE_CONCLUSIONS.has(conclusion)) allTestsPassed = false;
    } else {
      staticAnalysis.push(entry);
      if (FAILURE_CONCLUSIONS.has(conclusion)) allStaticAnalysisPassed = false;
    }
  }

  return { tests, staticAnalysis, allTestsPassed, allStaticAnalysisPassed };
}

const CONCLUSION_ICON = {
  success: "✅",
  skipped: "⏭️",
  failure: "❌",
  cancelled: "⚠️",
  timed_out: "⚠️",
};

function renderResultRow(entry) {
  const icon = CONCLUSION_ICON[entry.conclusion] ?? "❓";
  return `| ${entry.label} | ${icon} ${entry.conclusion} |`;
}

// 失敗したjobについて、既知flakyパターンに該当する場合の注記行（箇条書き）を返す。
// 該当パターンが無ければ空配列を返す
function renderKnownFlakyNotes(entry) {
  if (!FAILURE_CONCLUSIONS.has(entry.conclusion)) return [];
  return findKnownFlakyPatterns(entry.key).map(
    (p) => `- **${entry.label}**: 既知のflakyパターンに該当する可能性があります（${p.issueRef}）。${p.description}。まず再実行で解消するか確認してください`,
  );
}

// issue #647（Phase 2 Task 1）。summarizeCiResultsの戻り値を基に、失敗したjobを
// 「既知flakyパターンで説明できる失敗」と「説明できない失敗（真のリグレッションの
// 疑いがある）」に分類する。dependency-risk-classifier.js（Risk Engine）が
// High Risk判定とMedium Risk判定を区別するために使う（#645「8-5」参照。
// 既知flakyのみの失敗でHuman Reviewを無駄に増やさない）
function analyzeCiFailures(summary) {
  const allEntries = [...summary.tests, ...summary.staticAnalysis];
  let hasUnexplainedFailure = false;
  let hasExplainedFailure = false;
  for (const entry of allEntries) {
    if (!FAILURE_CONCLUSIONS.has(entry.conclusion)) continue;
    if (findKnownFlakyPatterns(entry.key).length > 0) {
      hasExplainedFailure = true;
    } else {
      hasUnexplainedFailure = true;
    }
  }
  return { hasUnexplainedFailure, hasExplainedFailure };
}

// summarizeCiResultsの戻り値をRisk Summaryコメントへ追記するMarkdown断片へ整形する
function renderCiResultsSection(summary) {
  let body = "### Tests / Static Analysis\n\n";
  body += "| job | 結果 |\n|---|---|\n";
  const allEntries = [...summary.tests, ...summary.staticAnalysis];
  for (const entry of allEntries) {
    body += `${renderResultRow(entry)}\n`;
  }
  if (!summary.allTestsPassed || !summary.allStaticAnalysisPassed) {
    body += "\n⚠️ 失敗したjobがあります。マージ前に原因を確認してください。\n";
  }
  const flakyNotes = allEntries.flatMap(renderKnownFlakyNotes);
  if (flakyNotes.length > 0) {
    body += `\n${flakyNotes.join("\n")}\n`;
  }
  return body;
}

// CI組み込み用のCLIエントリポイント。各job結果は環境変数（CI_RESULT_<JOB_KEYの
// スネークケース大文字>、例: CI_RESULT_FRONTEND_TEST）経由で渡す。reusable-ci.ymlの
// dependency-risk-summary jobから`${{ needs.<job>.result }}`をenv:で渡して呼び出す
// 想定（dependency-update-info.js・dependency-vulnerability-info.js等、他のPhase 1
// スクリプトと同様、`node script.js > 出力ファイル`の形でCIから呼び出す。
// actions/github-scriptステップ内から直接requireする方式は、このリポジトリに
// 前例が無く実機未検証のため避けた）
function envKeyFor(jobKey) {
  return `CI_RESULT_${jobKey.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
}

// 環境変数（CI_RESULT_<JOB_KEY>）からjob結果を読み取る。dependency-risk-classifier.js
// （Risk Engine）もこのjobと同じ環境変数経由でCI結果を受け取るため、読み取りロジックを
// ここに一本化してexportする（envKeyForの命名規則を重複実装しない）
function readCiResultsFromEnv(env = process.env) {
  const results = {};
  for (const def of JOB_DEFINITIONS) {
    const value = env[envKeyFor(def.key)];
    if (value) results[def.key] = value;
  }
  return results;
}

function main() {
  console.log(renderCiResultsSection(summarizeCiResults(readCiResultsFromEnv())));
}

if (require.main === module) {
  main();
}

module.exports = {
  JOB_DEFINITIONS,
  summarizeCiResults,
  analyzeCiFailures,
  renderCiResultsSection,
  envKeyFor,
  readCiResultsFromEnv,
};
