import test from "node:test";
import assert from "node:assert/strict";
import formatBuildTime from "./formatBuildTime.js";

test("ISO文字列をja-JP・Asia/Tokyoの年月日時分表記へ整形する", () => {
  // UTC 2026-08-29T10:15:00Z はJST（UTC+9）で2026-08-29 19:15
  const result = formatBuildTime("2026-08-29T10:15:00.000Z");
  assert.equal(result, "2026/08/29 19:15");
});

test("日付が変わるUTC深夜の時刻でもJSTへ正しく変換する", () => {
  // UTC 2026-08-29T15:30:00Z はJSTで2026-08-30 00:30
  const result = formatBuildTime("2026-08-29T15:30:00.000Z");
  assert.equal(result, "2026/08/30 00:30");
});
