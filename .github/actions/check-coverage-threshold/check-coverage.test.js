"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateCoverage } = require("./check-coverage.js");

function makeSummary({ lines = 90, statements = 90, functions = 90, branches = 90 } = {}) {
  return {
    total: {
      lines: { pct: lines },
      statements: { pct: statements },
      functions: { pct: functions },
      branches: { pct: branches },
    },
  };
}

test("reports no failed metrics when all coverage meets the threshold", () => {
  const { failedMetrics } = evaluateCoverage(makeSummary(), 80, "frontend");
  assert.deepEqual(failedMetrics, []);
});

test("reports failed metrics that fall below the threshold", () => {
  const summary = makeSummary({ lines: 70, functions: 60 });
  const { failedMetrics } = evaluateCoverage(summary, 80, "frontend");
  assert.deepEqual(failedMetrics.sort(), ["functions", "lines"].sort());
});

test("threshold of 0 (or below) never fails any metric", () => {
  const summary = makeSummary({ lines: 0, statements: 0, functions: 0, branches: 0 });
  const { failedMetrics } = evaluateCoverage(summary, 0, "frontend");
  assert.deepEqual(failedMetrics, []);
});

test("includes the label and all four metrics in the summary table", () => {
  const { table } = evaluateCoverage(makeSummary({ lines: 95 }), 80, "backend");
  assert.match(table, /backend/);
  assert.match(table, /lines \| 95%/);
  assert.match(table, /statements \| 90%/);
  assert.match(table, /functions \| 90%/);
  assert.match(table, /branches \| 90%/);
});

test("treats a missing metric as 0% rather than throwing, and fails it against a positive threshold", () => {
  const summary = { total: { lines: { pct: 50 } } };
  const { failedMetrics, table } = evaluateCoverage(summary, 10, "partial");
  assert.deepEqual(failedMetrics.sort(), ["branches", "functions", "statements"]);
  assert.match(table, /statements \| 0%/);
});

test("options.metrics narrows which metrics gate the check, but the table still shows all four", () => {
  const summary = makeSummary({ lines: 70, branches: 90 });
  const { failedMetrics, table } = evaluateCoverage(summary, 80, "frontend", { metrics: ["branches"] });
  assert.deepEqual(failedMetrics, []);
  assert.match(table, /lines \| 70%/);
});

test("options.metrics still fails when the narrowed metric is below threshold", () => {
  const summary = makeSummary({ lines: 90, branches: 60 });
  const { failedMetrics } = evaluateCoverage(summary, 80, "frontend", { metrics: ["branches"] });
  assert.deepEqual(failedMetrics, ["branches"]);
});

test("options.checkPerFile is false by default, ignoring per-file coverage", () => {
  const summary = {
    total: { lines: { pct: 90 }, statements: { pct: 90 }, functions: { pct: 90 }, branches: { pct: 90 } },
    "src/low.js": { lines: { pct: 10 }, statements: { pct: 10 }, functions: { pct: 10 }, branches: { pct: 10 } },
  };
  const { failedFiles, fileTable } = evaluateCoverage(summary, 80, "frontend");
  assert.deepEqual(failedFiles, []);
  assert.equal(fileTable, "");
});

test("options.checkPerFile reports files below the threshold even when the total average passes", () => {
  const summary = {
    total: { lines: { pct: 90 }, statements: { pct: 90 }, functions: { pct: 90 }, branches: { pct: 90 } },
    "src/low.js": { lines: { pct: 10 }, statements: { pct: 90 }, functions: { pct: 90 }, branches: { pct: 90 } },
    "src/high.js": { lines: { pct: 100 }, statements: { pct: 100 }, functions: { pct: 100 }, branches: { pct: 100 } },
  };
  const { failedFiles, fileTable } = evaluateCoverage(summary, 80, "frontend", { checkPerFile: true });
  assert.equal(failedFiles.length, 1);
  assert.equal(failedFiles[0].file, "src/low.js");
  assert.deepEqual(failedFiles[0].failedMetrics, ["lines"]);
  assert.match(fileTable, /src\/low\.js/);
  assert.doesNotMatch(fileTable, /src\/high\.js/);
});

test("options.checkPerFile combined with options.metrics only gates the narrowed metrics per file", () => {
  const summary = {
    total: { lines: { pct: 90 }, statements: { pct: 90 }, functions: { pct: 90 }, branches: { pct: 90 } },
    "src/low-lines.js": { lines: { pct: 10 }, statements: { pct: 90 }, functions: { pct: 90 }, branches: { pct: 90 } },
    "src/low-branches.js": { lines: { pct: 90 }, statements: { pct: 90 }, functions: { pct: 90 }, branches: { pct: 10 } },
  };
  const { failedFiles } = evaluateCoverage(summary, 80, "frontend", { checkPerFile: true, metrics: ["branches"] });
  assert.equal(failedFiles.length, 1);
  assert.equal(failedFiles[0].file, "src/low-branches.js");
});
