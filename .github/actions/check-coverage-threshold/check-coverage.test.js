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
