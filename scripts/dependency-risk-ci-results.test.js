"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { summarizeCiResults, renderCiResultsSection } = require("./dependency-risk-ci-results.js");

test("summarizeCiResults: test系・static analysis系を分類し、全件成功ならtrueを返す", () => {
  const result = summarizeCiResults({
    frontendTest: "success",
    backendTest: "success",
    packageTest: "skipped",
    frontendE2eTest: "success",
    architectureCheck: "success",
    duplicationCheck: "success",
  });

  assert.equal(result.allTestsPassed, true);
  assert.equal(result.allStaticAnalysisPassed, true);
  assert.deepEqual(
    result.tests.map((t) => t.label),
    ["frontend-test", "backend-test", "package-test", "frontend-e2e-test"],
  );
  assert.deepEqual(
    result.staticAnalysis.map((t) => t.label),
    ["architecture-check", "duplication-check"],
  );
});

test("summarizeCiResults: failure/cancelled/timed_outはallXxxPassedをfalseにする", () => {
  assert.equal(summarizeCiResults({ frontendTest: "failure" }).allTestsPassed, false);
  assert.equal(summarizeCiResults({ backendTest: "cancelled" }).allTestsPassed, false);
  assert.equal(summarizeCiResults({ packageTest: "timed_out" }).allTestsPassed, false);
  assert.equal(summarizeCiResults({ architectureCheck: "failure" }).allStaticAnalysisPassed, false);
});

test("summarizeCiResults: skippedは失敗として扱わない（enable_*フラグ無効時等）", () => {
  const result = summarizeCiResults({ frontendTest: "skipped", architectureCheck: "skipped" });
  assert.equal(result.allTestsPassed, true);
  assert.equal(result.allStaticAnalysisPassed, true);
});

test("summarizeCiResults: 未指定のjobキーはskipped扱いになる", () => {
  const result = summarizeCiResults({});
  assert.ok(result.tests.every((t) => t.conclusion === "skipped"));
  assert.ok(result.staticAnalysis.every((t) => t.conclusion === "skipped"));
});

test("renderCiResultsSection: 全件成功時は警告文を含まない", () => {
  const summary = summarizeCiResults({
    frontendTest: "success",
    backendTest: "success",
    architectureCheck: "success",
    duplicationCheck: "success",
  });
  const body = renderCiResultsSection(summary);
  assert.match(body, /frontend-test.*✅ success/);
  assert.doesNotMatch(body, /失敗したjobがあります/);
});

test("renderCiResultsSection: 失敗したjobがある場合は警告文を含む", () => {
  const summary = summarizeCiResults({ frontendTest: "failure" });
  const body = renderCiResultsSection(summary);
  assert.match(body, /frontend-test.*❌ failure/);
  assert.match(body, /失敗したjobがあります/);
});

test("renderCiResultsSection: 既知flakyパターンに該当するjobが失敗した場合は注記を含む", () => {
  const summary = summarizeCiResults({ frontendE2eTest: "failure" });
  const body = renderCiResultsSection(summary);
  assert.match(body, /frontend-e2e-test.*既知のflakyパターンに該当する可能性があります/);
  assert.match(body, /bamiyanapp\/karuta#972/);
});

test("renderCiResultsSection: 既知flakyパターンが無いjobの失敗では注記を含まない", () => {
  const summary = summarizeCiResults({ backendTest: "failure" });
  const body = renderCiResultsSection(summary);
  assert.doesNotMatch(body, /既知のflakyパターン/);
});

test("renderCiResultsSection: 既知flakyパターンに該当するjobがsuccessの場合は注記を含まない", () => {
  const summary = summarizeCiResults({ frontendE2eTest: "success" });
  const body = renderCiResultsSection(summary);
  assert.doesNotMatch(body, /既知のflakyパターン/);
});

test("CLI: CI_RESULT_*環境変数からjob結果を読み取り、Markdown断片を標準出力する", () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, "dependency-risk-ci-results.js")], {
    encoding: "utf-8",
    env: {
      ...process.env,
      CI_RESULT_FRONTEND_TEST: "success",
      CI_RESULT_BACKEND_TEST: "success",
      CI_RESULT_ARCHITECTURE_CHECK: "failure",
    },
  });
  assert.match(output, /frontend-test.*✅ success/);
  assert.match(output, /architecture-check.*❌ failure/);
  assert.match(output, /失敗したjobがあります/);
});

test("CLI: 環境変数が1件も設定されていない場合は全件skippedとして出力する", () => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("CI_RESULT_")) delete env[key];
  }
  const output = execFileSync(process.execPath, [path.join(__dirname, "dependency-risk-ci-results.js")], {
    encoding: "utf-8",
    env,
  });
  assert.match(output, /frontend-test.*⏭️ skipped/);
  assert.doesNotMatch(output, /失敗したjobがあります/);
});
