"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { extractRuntimes, judge, evaluate, fetchEntries } = require("./lambda-runtime-eol.js");

const ENTRIES = [
  { cycle: "nodejs24.x", support: "2028-04-30", eol: "2028-07-01" },
  { cycle: "nodejs22.x", support: "2027-05-30", eol: "2027-08-31" },
  { cycle: "nodejs18.x", support: "2025-09-01", eol: "2027-08-31" },
  { cycle: "nodejs12.x", support: "2023-03-31", eol: "2023-04-30" },
];
const NOW = new Date("2026-11-20T00:00:00Z");

test("extractRuntimes: provider・functions配下のリテラルを、行番号つきで拾う。変数・コメントは拾わない", () => {
  const yml = [
    "provider:",
    "  name: aws",
    "  runtime: nodejs22.x",
    "functions:",
    "  edge:",
    '    runtime: "nodejs18.x" # Lambda@Edge',
    "  other:",
    "    runtime: ${self:provider.runtime}",
    "    # runtime: nodejs12.x",
    "    handler: x.handler",
  ].join("\n");
  assert.deepEqual(extractRuntimes(yml), [
    { runtime: "nodejs22.x", line: 3 },
    { runtime: "nodejs18.x", line: 6 },
  ]);
});

test("extractRuntimes: CloudFormationのタグがあっても、読める", () => {
  const yml = "resources:\n  Resources:\n    F:\n      Properties:\n        Role: !GetAtt R.Arn\n        runtime: nodejs22.x\n";
  assert.deepEqual(extractRuntimes(yml), [{ runtime: "nodejs22.x", line: 6 }]);
});

test("judge: 十分先なら ok、warnDays以内なら soon（あと何日か示す）", () => {
  assert.equal(judge("nodejs22.x", ENTRIES[1], NOW, 90).level, "ok");
  const soon = judge("nodejs22.x", ENTRIES[1], new Date("2027-03-10T00:00:00Z"), 90);
  assert.equal(soon.level, "soon");
  assert.match(soon.message, /あと81日/);
});

test("judge: supportを過ぎたら deprecated、eolを過ぎたら blocked", () => {
  assert.equal(judge("nodejs18.x", ENTRIES[2], NOW, 90).level, "deprecated");
  assert.match(judge("nodejs18.x", ENTRIES[2], NOW, 90).message, /パッチが止まって/);
  assert.equal(judge("nodejs12.x", ENTRIES[3], NOW, 90).level, "blocked");
});

test("judge: 載っていないランタイムは unknown（期限を確認できないと伝える）", () => {
  const r = judge("nodejs99.x", undefined, NOW, 90);
  assert.equal(r.level, "unknown");
  assert.match(r.message, /確認できません/);
});

test("evaluate: okは除き、ファイル・行・ランタイムを保つ", () => {
  const decl = [
    { file: "a/serverless.yml", runtime: "nodejs22.x", line: 3 },
    { file: "b/serverless.yml", runtime: "nodejs18.x", line: 7 },
  ];
  const out = evaluate(decl, ENTRIES, NOW, 90);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].file, out[0].line, out[0].runtime, out[0].level], ["b/serverless.yml", 7, "nodejs18.x", "deprecated"]);
});

test("fetchEntries: 配列を返す。HTTPエラー・形が違う応答は、エラーにする", async () => {
  const ok = async () => ({ ok: true, status: 200, json: async () => ENTRIES });
  assert.equal((await fetchEntries(ok)).length, 4);
  await assert.rejects(fetchEntries(async () => ({ ok: false, status: 503, json: async () => ({}) })), /HTTP 503/);
  await assert.rejects(fetchEntries(async () => ({ ok: true, status: 200, json: async () => ({ result: {} }) })), /配列ではありません/);
});
