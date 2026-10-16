"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateStaleness, formatSummary, anyJobSucceeded } = require("./staleness.js");

const NOW = "2026-10-16T12:00:00.000Z";

test("not stale when no true-run exists", () => {
  const result = evaluateStaleness([], ["2026-10-01T00:00:00.000Z"], 24, NOW);
  assert.equal(result.stale, false);
  assert.equal(result.sinceIso, null);
});

test("not stale when the latest false-run is newer than the latest true-run", () => {
  const result = evaluateStaleness(
    ["2026-10-14T00:00:00.000Z"],
    ["2026-10-15T00:00:00.000Z"],
    24,
    NOW,
  );
  assert.equal(result.stale, false);
});

test("not stale when true-run is recent (within max-age)", () => {
  const result = evaluateStaleness(["2026-10-16T10:00:00.000Z"], [], 24, NOW);
  assert.equal(result.stale, false);
  assert.ok(result.hoursElapsed < 24);
});

test("stale when true-run is older than max-age and no later false-run exists", () => {
  const result = evaluateStaleness(["2026-10-14T00:00:00.000Z"], [], 24, NOW);
  assert.equal(result.stale, true);
  assert.equal(result.sinceIso, "2026-10-14T00:00:00.000Z");
  assert.ok(result.hoursElapsed > 24);
});

test("uses the latest timestamp when multiple true-runs exist", () => {
  const result = evaluateStaleness(
    ["2026-10-10T00:00:00.000Z", "2026-10-15T00:00:00.000Z", "2026-10-12T00:00:00.000Z"],
    [],
    24,
    NOW,
  );
  assert.equal(result.sinceIso, "2026-10-15T00:00:00.000Z");
});

test("formatSummary includes a warning marker when stale", () => {
  const result = evaluateStaleness(["2026-10-14T00:00:00.000Z"], [], 24, NOW);
  const summary = formatSummary(result, 24);
  assert.match(summary, /⚠️/);
});

test("formatSummary has no warning marker when within max-age", () => {
  const result = evaluateStaleness(["2026-10-16T10:00:00.000Z"], [], 24, NOW);
  const summary = formatSummary(result, 24);
  assert.doesNotMatch(summary, /⚠️/);
});

test("formatSummary explains when the flag is not currently true", () => {
  const result = evaluateStaleness([], [], 24, NOW);
  const summary = formatSummary(result, 24);
  assert.match(summary, /現在trueに設定されていない/);
});

// dev-standards#953: KVS設定ジョブ自体は成功しても、無関係な後続ジョブ
// （例: 反映確認のverifyジョブ）が失敗していると、ワークフロー全体の
// 結論はfailureになる。run全体の結論ではなく、ジョブ単位の成否で
// 「成功実行」と判定できることを確認する
test("anyJobSucceeded is true when the KVS-setting job succeeded even if another job in the same run failed", () => {
  const jobs = [
    { name: "resolve", conclusion: "success" },
    { name: "clear / rollback", conclusion: "success" },
    { name: "verify", conclusion: "failure" },
  ];
  assert.equal(anyJobSucceeded(jobs), true);
});

test("anyJobSucceeded is false when every job in the run failed", () => {
  const jobs = [
    { name: "resolve", conclusion: "failure" },
    { name: "clear / rollback", conclusion: "cancelled" },
  ];
  assert.equal(anyJobSucceeded(jobs), false);
});

test("anyJobSucceeded is false for a run with no jobs", () => {
  assert.equal(anyJobSucceeded([]), false);
});
