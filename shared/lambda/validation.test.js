"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("./validation.js");

const rejects400 = (fn) =>
  assert.throws(fn, (e) => e.statusCode === 400 && e.code === "VALIDATION" && e instanceof v.ValidationError);

test("requireObject: プレーンオブジェクトのみ通す", () => {
  const body = { a: 1 };
  assert.equal(v.requireObject(body), body);
  for (const bad of [null, [], "x", 1, undefined]) rejects400(() => v.requireObject(bad));
});

test("requireString: 前後の空白を除いて返し、空・型違い・上限超過は拒否する", () => {
  assert.equal(v.requireString("  ab ", "名前", { max: 2 }), "ab");
  for (const bad of ["", "   ", 1, null, undefined]) rejects400(() => v.requireString(bad, "名前"));
  rejects400(() => v.requireString("abc", "名前", { max: 2 }));
});

test("optionalString: 未指定・null・空文字はnull", () => {
  for (const empty of [undefined, null, "", "  "]) assert.equal(v.optionalString(empty, "メモ"), null);
  assert.equal(v.optionalString(" x ", "メモ"), "x");
  rejects400(() => v.optionalString("abc", "メモ", { max: 2 }));
  rejects400(() => v.optionalString(1, "メモ"));
});

test("requireBoolean", () => {
  assert.equal(v.requireBoolean(false, "f"), false);
  rejects400(() => v.requireBoolean("true", "f"));
});

test("optionalDate: 実在する日付のみ通す", () => {
  assert.equal(v.optionalDate("2026-02-28", "日付"), "2026-02-28");
  for (const empty of [undefined, null, ""]) assert.equal(v.optionalDate(empty, "日付"), null);
  for (const bad of ["2026-02-30", "2026-13-01", "2026/01/01", "20260101", 20260101]) rejects400(() => v.optionalDate(bad, "日付"));
});

test("requireExactlyOneOf: ちょうど1つ", () => {
  assert.equal(v.requireExactlyOneOf({ a: 1 }, ["a", "b"]), "a");
  rejects400(() => v.requireExactlyOneOf({}, ["a", "b"]));
  rejects400(() => v.requireExactlyOneOf({ a: 1, b: 2 }, ["a", "b"]));
});

test("エラー文言に入力値を含めない", () => {
  assert.throws(() => v.requireString("x".repeat(500), "名前", { max: 3 }), (e) => !e.message.includes("xxxx"));
  assert.throws(() => v.optionalDate("secret-value", "日付"), (e) => !e.message.includes("secret"));
});
