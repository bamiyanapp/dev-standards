"use strict";

const fs = require("node:fs");
const { summarizeCiResults, analyzeCiFailures, readCiResultsFromEnv } = require("./dependency-risk-ci-results.js");
const { buildSecurityRows } = require("./dependency-risk-security-summary.js");

// issue #647（OSS依存更新の自動安全判定基盤 Phase 2）Task 1。
// Phase 1（issue #646）で収集したupdate type・CVE/CVSS/KEV/EPSS・CI結果・ファンアウトを
// もとに、Low/Medium/High Riskのいずれかへ機械的に分類する（#645「2. Risk判定」参照）。
// 判定結果をRisk Summaryコメントへの表示とmerge jobの自動マージ条件（#647本体）の
// 両方で使うため、CIステップ結果等の外部入力は呼び出し側で既に取得済みのデータとして
// 受け取る純粋関数とし、このモジュール自体はネットワーク呼び出しを一切行わない
//
// 重要な安全性の性質: このRisk EngineはLow判定であっても「既存のmerge job条件
// （CI全PASS等）を満たしている」ことが前提であり、Risk Engine自体はmerge許可を
// 追加で与えることはない。Medium/High判定は既存の自動マージをブロックする方向にのみ
// 働く（#647 Task 3でmerge jobへ接続）。そのため誤判定の最悪ケースは
// 「安全な更新を人間の確認待ちにしてしまう」(過剰ブロック)であり、
// 「危険な更新を誤って通す」方向のリスクは既存のCI gate自体の信頼性に依存する
// （Risk Engineが新たにそのリスクを増やすことはない）

const DIRECT_DEPENDENCY_THRESHOLD_DEFAULT = 2;

function escalate(current, next) {
  const order = { low: 0, medium: 1, high: 2 };
  return order[next] > order[current] ? next : current;
}

// input:
//   updateSummary: dependency-update-info.jsのsummary（{total, direct, transitive, byUpdateType}）
//   vulnerabilityInfo, exploitInfo: dependency-vulnerability-info.js/dependency-exploit-info.jsの出力。
//     securityDataAvailableがfalseの場合は無視される（空配列扱い）
//   securityDataAvailable: OSV.dev等への問い合わせが成功したか（falseの場合、既知の脆弱性が
//     無いことを意味しない「不明」であり、安全側に倒してMedium以上へ格上げする）
//   ciSummary: summarizeCiResults()の出力
//   fanOutCount: consumer-repositories.jsの出力（dev-standards自体の更新でない場合はnull）
//   directDependencyThreshold: 直接依存の更新件数がこの値以上の場合、変更の複雑さを理由に
//     Medium以上へ格上げする（#645「2. Risk判定」のMedium Risk条件「依存変更が複数」に対応）
function classifyRisk({
  updateSummary,
  vulnerabilityInfo = [],
  exploitInfo = [],
  securityDataAvailable,
  ciSummary,
  fanOutCount = null,
  directDependencyThreshold = DIRECT_DEPENDENCY_THRESHOLD_DEFAULT,
}) {
  let level = "low";
  const reasons = [];

  const isUnclassifiable = (updateSummary.byUpdateType.major ?? 0) > 0 || (updateSummary.byUpdateType.other ?? 0) > 0;
  if (isUnclassifiable) {
    level = escalate(level, "high");
    reasons.push("major update、またはバージョン比較不能な更新（ダウングレード等）が含まれています");
  }

  const securityRows = securityDataAvailable ? buildSecurityRows(vulnerabilityInfo, exploitInfo) : [];
  const hasCriticalOrHighCve = securityRows.some((r) => r.severityRating === "CRITICAL" || r.severityRating === "HIGH");
  if (hasCriticalOrHighCve) {
    level = escalate(level, "high");
    reasons.push("Critical/High severityのCVEが残っています");
  }
  const hasKev = securityRows.some((r) => r.kev === true);
  if (hasKev) {
    level = escalate(level, "high");
    reasons.push("KEV（Known Exploited Vulnerability）に該当する脆弱性があります");
  }

  const ciFailures = analyzeCiFailures(ciSummary);
  if (ciFailures.hasUnexplainedFailure) {
    level = escalate(level, "high");
    reasons.push("既知flakyパターンで説明できないtest/static analysisの失敗があります");
  }

  if (!securityDataAvailable) {
    level = escalate(level, "medium");
    reasons.push("CVE/CVSS/EPSS/KEV情報の取得に失敗したため、脆弱性の有無が不明です");
  }
  if (fanOutCount != null && fanOutCount > 0) {
    level = escalate(level, "medium");
    reasons.push(`dev-standards自体の更新であり、既知の参照側リポジトリが${fanOutCount}件あります`);
  }
  if (ciFailures.hasExplainedFailure && !ciFailures.hasUnexplainedFailure) {
    level = escalate(level, "medium");
    reasons.push("既知flakyパターンに該当する失敗があります（再実行での解消を確認してください）");
  }
  if (updateSummary.direct >= directDependencyThreshold) {
    level = escalate(level, "medium");
    reasons.push(`直接依存の更新が${updateSummary.direct}件あり、影響範囲の特定が難しい可能性があります`);
  }

  if (reasons.length === 0) {
    reasons.push("patch/minor updateで、既知の脆弱性・CI失敗・ファンアウトのいずれも検出されませんでした");
  }

  return { level, reasons };
}

function readJsonFileIfExists(path) {
  if (!path || !fs.existsSync(path)) return null;
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

function main() {
  const [, , updateInfoPath, vulnerabilityInfoPath, exploitInfoPath, fanOutCountArg] = process.argv;
  if (!updateInfoPath) {
    console.error(
      "Usage: node dependency-risk-classifier.js <dependency-update-info.json> [vulnerability-info.json] [exploit-info.json] [fanout-count]",
    );
    process.exitCode = 1;
    return;
  }

  const { summary } = JSON.parse(fs.readFileSync(updateInfoPath, "utf-8"));
  const vulnerabilityInfo = readJsonFileIfExists(vulnerabilityInfoPath);
  const exploitInfo = readJsonFileIfExists(exploitInfoPath);
  const securityDataAvailable = vulnerabilityInfo != null && exploitInfo != null;
  const fanOutCount = fanOutCountArg ? Number(fanOutCountArg) : null;
  const ciSummary = summarizeCiResults(readCiResultsFromEnv());

  const result = classifyRisk({
    updateSummary: summary,
    vulnerabilityInfo: vulnerabilityInfo ?? [],
    exploitInfo: exploitInfo ?? [],
    securityDataAvailable,
    ciSummary,
    fanOutCount: Number.isFinite(fanOutCount) ? fanOutCount : null,
  });

  console.log(JSON.stringify(result, null, 2));

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `level=${result.level}\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  classifyRisk,
};
