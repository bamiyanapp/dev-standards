"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate, SCANS } = require("./check-periodic-scans.js");

const scheduledCaller = (names) => `
name: Periodic
on:
  schedule:
    - cron: "0 0 * * *"
jobs:
${names.map((n) => `  ${n}:\n    uses: bamiyanapp/dev-standards/.github/workflows/reusable-${n}.yml@v2.0.0`).join("\n")}
`;

const all = SCANS.map((s) => s.name);

test("4つとも、scheduleつきのworkflowが呼んでいれば、警告しない", () => {
  assert.deepEqual(evaluate([{ file: "a.yml", text: scheduledCaller(all) }], {}), []);
});

test("呼んでいないものを、警告する", () => {
  const findings = evaluate([{ file: "a.yml", text: scheduledCaller(["dependency-full-scan"]) }], {});
  assert.deepEqual(findings.map((f) => f.name), ["dependency-deprecation-scan", "runtime-version-scan", "secret-full-scan"]);
  assert.match(findings[0].reason, /periodic-scans-opt-out\.json/);
});

test("scheduleを持たないworkflowが呼んでいても、導入済みとは見なさない", () => {
  const noSchedule = "on:\n  workflow_dispatch: {}\njobs:\n  x:\n    uses: ./.github/workflows/reusable-dependency-full-scan.yml\n";
  const findings = evaluate([{ file: "a.yml", text: noSchedule }], {});
  assert.equal(findings.some((f) => f.name === "dependency-full-scan"), true);
});

test("コメントの中のscheduleや呼び出しで、誤って導入済みと判定しない", () => {
  const commented = "on:\n  workflow_dispatch: {}\n  # schedule:\njobs:\n  x:\n    # uses: ./.github/workflows/reusable-secret-full-scan.yml\n    runs-on: ubuntu-latest\n";
  assert.equal(evaluate([{ file: "a.yml", text: commented }], {}).length, 4);
});

test("理由つきのopt-outは、警告しない。理由が空なら、理由を求める", () => {
  const findings = evaluate([{ file: "a.yml", text: scheduledCaller(["dependency-full-scan"]) }], {
    "dependency-deprecation-scan": "対象のパッケージが無い",
    "runtime-version-scan": "",
  });
  assert.deepEqual(findings.map((f) => f.name), ["runtime-version-scan", "secret-full-scan"]);
  assert.match(findings[0].reason, /理由/);
});

test("ローカル参照（./.github/workflows/...）の呼び出しも、導入済みと見なす", () => {
  const local = "on:\n  schedule:\n    - cron: '0 0 * * 1'\njobs:\n  s:\n    uses: ./.github/workflows/reusable-secret-full-scan.yml\n";
  assert.equal(evaluate([{ file: "a.yml", text: local }], {}).some((f) => f.name === "secret-full-scan"), false);
});

test("Lambdaのランタイムを宣言しているときだけ、Lambdaランタイムのサポート終了スキャンを求める", () => {
  const caller = [{ file: "a.yml", text: scheduledCaller(["dependency-full-scan", "dependency-deprecation-scan", "runtime-version-scan", "secret-full-scan"]) }];
  assert.deepEqual(evaluate(caller, {}, { hasLambda: false }), []);
  const withLambda = evaluate(caller, {}, { hasLambda: true });
  assert.deepEqual(withLambda.map((f) => f.name), ["lambda-runtime-eol-scan"]);
  // 呼んでいれば、警告しない。理由つきのopt-outでも、警告しない
  const called = [{ file: "a.yml", text: scheduledCaller(all) }];
  assert.deepEqual(evaluate(called, {}, { hasLambda: true }), []);
  assert.deepEqual(evaluate(caller, { "lambda-runtime-eol-scan": "ランタイムは、別の仕組みで管理している" }, { hasLambda: true }), []);
});
