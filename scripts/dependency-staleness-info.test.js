"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detectStaleness, fetchStalenessInfo, STALE_THRESHOLD_DAYS_DEFAULT } = require("./dependency-staleness-info.js");

test("detectStaleness: 最終公開から閾値以上経過している場合はflagged: trueを返す", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const packageJson = { time: { modified: "2020-01-01T00:00:00Z" } };
  const result = detectStaleness(packageJson, 730, now);
  assert.equal(result.lastPublishedAt, "2020-01-01T00:00:00Z");
  assert.ok(result.ageDays > 730);
  assert.equal(result.flagged, true);
});

test("detectStaleness: 閾値未満の場合はflagged: falseを返す（結果自体は返す）", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const packageJson = { time: { modified: "2025-06-01T00:00:00Z" } };
  const result = detectStaleness(packageJson, 730, now);
  assert.equal(result.flagged, false);
  assert.ok(result.ageDays < 730);
});

test("detectStaleness: time.modifiedが無い場合はnullを返す（判定不能）", () => {
  assert.equal(detectStaleness({}, 730, new Date()), null);
});

test("detectStaleness: time.modifiedが不正な日付文字列の場合はnullを返す", () => {
  const packageJson = { time: { modified: "not-a-date" } };
  assert.equal(detectStaleness(packageJson, 730, new Date()), null);
});

test("detectStaleness: thresholdDays省略時はデフォルト値（2年）を使う", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const packageJson = { time: { modified: "2020-01-01T00:00:00Z" } };
  const result = detectStaleness(packageJson, undefined, now);
  assert.equal(result.ageDays, Math.floor((now - new Date("2020-01-01T00:00:00Z")) / (24 * 60 * 60 * 1000)));
  assert.ok(STALE_THRESHOLD_DAYS_DEFAULT > 0);
});

test("fetchStalenessInfo: チェック対象の全パッケージを返す（放置と判定されなかったものも含む）", async () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const changes = [
    { name: "old-and-stale", oldVersion: "1.0.0", newVersion: "1.0.1" },
    { name: "actively-maintained", oldVersion: "2.0.0", newVersion: "2.1.0" },
    { name: "newly-added", oldVersion: null, newVersion: "1.0.0" },
  ];
  const fixtures = {
    "old-and-stale": { time: { modified: "2019-01-01T00:00:00Z" } },
    "actively-maintained": { time: { modified: "2025-12-01T00:00:00Z" } },
  };
  const fetchJsonImpl = async (url) => fixtures[url.split("/").pop()];
  const result = await fetchStalenessInfo(changes, { fetchJsonImpl, now });
  assert.deepEqual(result, [
    {
      name: "old-and-stale",
      oldVersion: "1.0.0",
      newVersion: "1.0.1",
      lastPublishedAt: "2019-01-01T00:00:00Z",
      ageDays: Math.floor((now - new Date("2019-01-01T00:00:00Z")) / (24 * 60 * 60 * 1000)),
      flagged: true,
    },
    {
      name: "actively-maintained",
      oldVersion: "2.0.0",
      newVersion: "2.1.0",
      lastPublishedAt: "2025-12-01T00:00:00Z",
      ageDays: Math.floor((now - new Date("2025-12-01T00:00:00Z")) / (24 * 60 * 60 * 1000)),
      flagged: false,
    },
  ]);
});

test("fetchStalenessInfo: oldVersionが無い変更（新規追加）は対象外", async () => {
  const changes = [{ name: "newly-added", oldVersion: null, newVersion: "1.0.0" }];
  const fetchJsonImpl = async () => {
    throw new Error("fetchJsonImpl should not be called");
  };
  const result = await fetchStalenessInfo(changes, { fetchJsonImpl });
  assert.deepEqual(result, []);
});

test("fetchStalenessInfo: time.modifiedが取得できない（判定不能）パッケージは対象外", async () => {
  const changes = [{ name: "unknown-pkg", oldVersion: "1.0.0", newVersion: "1.0.1" }];
  const fetchJsonImpl = async () => ({});
  const result = await fetchStalenessInfo(changes, { fetchJsonImpl });
  assert.deepEqual(result, []);
});

test("fetchStalenessInfo: production: falseのパッケージは対象外にする（issue #1156）", async () => {
  const changes = [{ name: "dev-only-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", production: false }];
  const fetchJsonImpl = async () => {
    throw new Error("fetchJsonImpl should not be called");
  };
  const result = await fetchStalenessInfo(changes, { fetchJsonImpl });
  assert.deepEqual(result, []);
});
