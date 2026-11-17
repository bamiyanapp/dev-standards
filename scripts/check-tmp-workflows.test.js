"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate } = require("./check-tmp-workflows.js");

const now = new Date("2026-11-30T00:00:00Z");
const day = (n) => new Date(now - n * 24 * 60 * 60 * 1000);
const HEADER = "# 目的: ログの取得 / issue #1 / 作成日: 2026-11-01";

test("期限内で、冒頭にコメントがあれば、警告しない", () => {
  assert.deepEqual(evaluate([{ file: "tmp-a.yml", addedAt: day(5), header: HEADER }], now, 14), []);
});

test("期限（14日）を超えたら、日数つきで警告する。ちょうど14日は警告しない", () => {
  assert.equal(evaluate([{ file: "tmp-a.yml", addedAt: day(14), header: HEADER }], now, 14).length, 0);
  const got = evaluate([{ file: "tmp-a.yml", addedAt: day(20), header: HEADER }], now, 14);
  assert.equal(got.length, 1);
  assert.equal(got[0].ageDays, 20);
  assert.match(got[0].reason, /削除するPR/);
});

test("冒頭のコメントが無ければ、警告する", () => {
  const got = evaluate([{ file: "tmp-a.yml", addedAt: day(1), header: "name: x" }], now, 14);
  assert.equal(got.length, 1);
  assert.match(got[0].reason, /冒頭/);
});

test("追加日が分からない（履歴が浅い・未追跡）ときは、日数では警告しない", () => {
  assert.deepEqual(evaluate([{ file: "tmp-a.yml", addedAt: null, header: HEADER }], now, 14), []);
});

test("日数を変更できる。複数あれば、それぞれ判定する", () => {
  const files = [{ file: "tmp-a.yml", addedAt: day(5), header: HEADER }, { file: "tmp-b.yml", addedAt: day(40), header: HEADER }];
  assert.deepEqual(evaluate(files, now, 3).map((f) => f.file), ["tmp-a.yml", "tmp-b.yml"]);
  assert.deepEqual(evaluate(files, now, 30).map((f) => f.file), ["tmp-b.yml"]);
});
