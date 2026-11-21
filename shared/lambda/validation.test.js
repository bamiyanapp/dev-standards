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

test("requireNumber: 有限の数値のみ通し、範囲と整数を検証する", () => {
  assert.equal(v.requireNumber(12.5, "タイム", { min: 0, max: 100 }), 12.5);
  assert.equal(v.requireNumber(0, "件数", { min: 0, integer: true }), 0);
  assert.equal(v.requireNumber(100, "タイム", { max: 100 }), 100);
  // 型違い・NaN・無限大・数値の文字列は拒否する
  for (const bad of ["1", null, undefined, NaN, Infinity, -Infinity, {}, [1], true]) rejects400(() => v.requireNumber(bad, "タイム"));
  rejects400(() => v.requireNumber(-1, "タイム", { min: 0 }));
  rejects400(() => v.requireNumber(101, "タイム", { max: 100 }));
  rejects400(() => v.requireNumber(1.5, "件数", { integer: true }));
});

test("requireNumber: エラー文言に、入力値を含めない", () => {
  assert.throws(() => v.requireNumber(123456, "タイム", { max: 100 }), (e) => !e.message.includes("123456"));
});
