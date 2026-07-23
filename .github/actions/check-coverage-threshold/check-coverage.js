"use strict";

const fs = require("fs");
const path = require("path");

const METRICS = ["lines", "statements", "functions", "branches"];

// summaryJson: coverage-summary.jsonのパース済み内容（{ total: {...}, <filePath>: {...}, ... }）。
// 副作用（fs/process.exit）を持たない純粋関数として、判定ロジックのみをテスト可能にする。
//
// options.metrics: 判定対象の指標（省略時はMETRICS全4種）。issue #57対応: 「分岐(branches)を
// 基準に80%を必須化する」のように、一部の指標のみをゲート対象にしたい場合に指定する
// （表自体は常に全指標を表示し、判定のみ絞り込む）。
// options.checkPerFile: trueの場合、total（パッケージ全体平均）だけでなく、summaryJsonの
// total以外の各キー（ファイルパス）についても同じ指標・閾値で判定する。一部のファイルの
// カバレッジが著しく低くても、他のファイルが高ければ全体平均で閾値をクリアしてしまう
// 問題（issue #57）への対応
function evaluateCoverage(summaryJson, threshold, label, options = {}) {
  const metrics = options.metrics && options.metrics.length > 0 ? options.metrics : METRICS;
  const total = summaryJson.total;
  const table = METRICS.reduce(
    (acc, metric) => acc + `| ${metric} | ${total[metric]?.pct ?? 0}% |\n`,
    `\n### カバレッジ（${label}）\n\n| Metric | Coverage |\n|---|---|\n`
  );

  const failedMetrics = metrics.filter((metric) => (total[metric]?.pct ?? 0) < threshold);

  let fileTable = "";
  const failedFiles = [];
  if (options.checkPerFile) {
    for (const [file, fileCoverage] of Object.entries(summaryJson)) {
      if (file === "total") continue;
      const failed = metrics.filter((metric) => (fileCoverage[metric]?.pct ?? 0) < threshold);
      if (failed.length > 0) {
        failedFiles.push({
          file,
          failedMetrics: failed,
          values: Object.fromEntries(failed.map((metric) => [metric, fileCoverage[metric]?.pct ?? 0])),
        });
      }
    }
    if (failedFiles.length > 0) {
      fileTable = failedFiles.reduce(
        (acc, { file, failedMetrics: failed, values }) =>
          acc + `| ${file} | ${failed.map((metric) => `${metric}=${values[metric]}%`).join(", ")} |\n`,
        `\n### 閾値(${threshold}%)未達のファイル（${label}）\n\n| File | 未達の指標 |\n|---|---|\n`
      );
    }
  }

  return { table, fileTable, failedMetrics, failedFiles };
}

function main() {
  const summaryPath = path.resolve(process.cwd(), "coverage", "coverage-summary.json");
  const threshold = Number(process.env.THRESHOLD || "0");
  const label = process.env.LABEL || path.basename(process.cwd());
  const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  const metrics = process.env.METRICS
    ? process.env.METRICS.split(",")
        .map((metric) => metric.trim())
        .filter(Boolean)
    : undefined;
  const checkPerFile = process.env.CHECK_PER_FILE === "true";

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
  const { table, fileTable, failedMetrics, failedFiles } = evaluateCoverage(summaryJson, threshold, label, {
    metrics,
    checkPerFile,
  });

  if (stepSummaryPath) {
    fs.appendFileSync(stepSummaryPath, table + fileTable);
  }
  console.log(table);
  if (fileTable) {
    console.log(fileTable);
  }

  if (threshold <= 0) {
    return;
  }

  if (failedMetrics.length > 0 || failedFiles.length > 0) {
    if (failedMetrics.length > 0) {
      const details = failedMetrics
        .map((metric) => `${metric}=${summaryJson.total[metric].pct}%`)
        .join(", ");
      console.error(`カバレッジが閾値(${threshold}%)を下回っています（${label}）: ${details}`);
    }
    if (failedFiles.length > 0) {
      const details = failedFiles
        .map(({ file, failedMetrics: failed, values }) => `${file}(${failed.map((metric) => `${metric}=${values[metric]}%`).join(", ")})`)
        .join("; ");
      console.error(`ファイル/クラス単位でカバレッジが閾値(${threshold}%)を下回っています（${label}）: ${details}`);
    }
    process.exit(1);
  }

  console.log(`カバレッジは閾値(${threshold}%)を満たしています（${label}）。`);
}

module.exports = { evaluateCoverage, METRICS };

if (require.main === module) {
  main();
}
