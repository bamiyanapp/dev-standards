"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarize, maskSecrets } = require("./playwright-failure-summary.js");

const spec = (title, status, message, extra = {}) => ({
  title,
  file: "e2e/app.spec.ts",
  line: 12,
  tests: [{ projectName: "chromium", status, results: [{ status: status === "unexpected" ? "failed" : "passed", errors: message ? [{ message }] : [] }], ...extra }],
});
const report = (...specs) => ({ suites: [{ title: "e2e/app.spec.ts", suites: [{ title: "ログイン", specs }] }] });

test("strict mode違反の失敗を、題名の階層・ファイル・行・メッセージつきで出す。ANSIは除去する", () => {
  const msg = "\u001b[31mError: strict mode violation: getByRole('button') resolved to 2 elements\u001b[39m";
  const r = summarize(report(spec("保存できる", "unexpected", msg)));
  assert.equal(r.failed, 1);
  assert.match(r.markdown, /### E2Eテストの失敗（1件）/);
  assert.match(r.markdown, /\*\*ログイン › 保存できる\*\* \[chromium\] — `e2e\/app\.spec\.ts:12`/);
  assert.match(r.markdown, /strict mode violation: getByRole\('button'\) resolved to 2 elements/);
  assert.ok(!r.markdown.includes("\u001b"));
});

test("タイムアウトの失敗も出す", () => {
  const r = summarize(report(spec("遅い", "unexpected", "Test timeout of 30000ms exceeded.")));
  assert.match(r.markdown, /Test timeout of 30000ms exceeded\./);
});

test("最終結果が成功したテスト（flaky）は失敗に含めず、件数だけを別枠で出す", () => {
  const r = summarize(report(spec("不安定", "flaky", ""), spec("落ちる", "unexpected", "boom")));
  assert.equal(r.failed, 1);
  assert.equal(r.flaky, 1);
  assert.ok(!r.markdown.includes("不安定"));
  assert.match(r.markdown, /再試行で成功したテスト（flaky）: 1件/);
});

test("失敗が無ければ、何も出さない", () => {
  const r = summarize(report(spec("成功", "expected", ""), spec("不安定", "flaky", "")));
  assert.equal(r.markdown, "");
  assert.equal(r.failed, 0);
  assert.equal(r.flaky, 1);
});

test("secretsの値は伏せ字にする。短い値は対象にしない", () => {
  const r = summarize(report(spec("a", "unexpected", "token=SECRET-VALUE-123 failed, id=ab")), { secrets: ["SECRET-VALUE-123", "ab"] });
  assert.ok(!r.markdown.includes("SECRET-VALUE-123"));
  assert.match(r.markdown, /token=\*\*\* failed/);
  assert.match(r.markdown, /id=ab/);
  assert.equal(maskSecrets("x", ["x"]), "x");
});

test("長いメッセージは切り詰め、失敗が多ければ件数に上限を設ける", () => {
  const long = summarize(report(spec("長い", "unexpected", "x".repeat(5000))));
  assert.match(long.markdown, /以降は省略/);
  assert.ok(long.markdown.length < 2500);
  const many = summarize(report(...Array.from({ length: 30 }, (_, i) => spec(`t${i}`, "unexpected", "e"))));
  assert.equal(many.failed, 30);
  assert.match(many.markdown, /ほか10件の失敗は/);
});

test("入れ子のdescribeをたどり、projectが無くても動く", () => {
  const nested = { suites: [{ title: "a.spec.ts", suites: [{ title: "外", suites: [{ title: "内", specs: [{ title: "テスト", file: "a.spec.ts", tests: [{ status: "unexpected", results: [{ error: { message: "bad" } }] }] }] }] }] }] };
  const r = summarize(nested);
  assert.match(r.markdown, /\*\*外 › 内 › テスト\*\* — `a\.spec\.ts`/);
  assert.match(r.markdown, /bad/);
});
