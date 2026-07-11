"use strict";

const fs = require("fs");
const path = require("path");

const METRICS = ["lines", "statements", "functions", "branches"];

// summaryJson: coverage-summary.jsonのパース済み内容（{ total: {...}, ... }）。
// 副作用（fs/process.exit）を持たない純粋関数として、判定ロジックのみをテスト可能にする。
function evaluateCoverage(summaryJson, threshold, label) {
  const total = summaryJson.total;
  const table = METRICS.reduce(
    (acc, metric) => acc + `| ${metric} | ${total[metric]?.pct ?? 0}% |\n`,
    `\n### カバレッジ（${label}）\n\n| Metric | Coverage |\n|---|---|\n`
  );

  const failedMetrics = METRICS.filter((metric) => (total[metric]?.pct ?? 0) < threshold);

  return { table, failedMetrics };
}

function main() {
  const summaryPath = path.resolve(process.cwd(), "coverage", "coverage-summary.json");
  const threshold = Number(process.env.THRESHOLD || "0");
  const label = process.env.LABEL || path.basename(process.cwd());
  const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;

  if (!fs.existsSync(summaryPath)) {
    if (threshold > 0) {
      console.error(
        `coverage/coverage-summary.json が見つかりません（${label}）。` +
          "vitestのcoverage.reporterに'json-summary'を含めるなど、集計レポートを出力する設定が必要です。"
      );
      process.exit(1);
    }
    console.log(`coverage/coverage-summary.json が見つからないため、カバレッジ表示をスキップします（${label}）。`);
    return;
  }

  const summaryJson = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
  const { table, failedMetrics } = evaluateCoverage(summaryJson, threshold, label);

  if (stepSummaryPath) {
    fs.appendFileSync(stepSummaryPath, table);
  }
  console.log(table);

  if (threshold <= 0) {
    return;
  }

  if (failedMetrics.length > 0) {
    const details = failedMetrics
      .map((metric) => `${metric}=${summaryJson.total[metric].pct}%`)
      .join(", ");
    console.error(`カバレッジが閾値(${threshold}%)を下回っています（${label}）: ${details}`);
    process.exit(1);
  }

  console.log(`カバレッジは閾値(${threshold}%)を満たしています（${label}）。`);
}

module.exports = { evaluateCoverage, METRICS };

if (require.main === module) {
  main();
}
