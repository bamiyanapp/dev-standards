"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { renderMaintenanceSection } = require("./dependency-maintenance-summary.js");

test("renderMaintenanceSection: 両方空の場合は対象なしの文を返す", () => {
  const body = renderMaintenanceSection([], []);
  assert.match(body, /対象パッケージはありませんでした/);
});

test("renderMaintenanceSection: 放置検知でflaggedが1件も無い場合は件数のみの要約にする", () => {
  const body = renderMaintenanceSection(
    [
      { name: "fresh-pkg-1", oldVersion: "2.0.0", newVersion: "2.1.0", lastPublishedAt: "2025-12-01T00:00:00Z", ageDays: 10, flagged: false },
      { name: "fresh-pkg-2", oldVersion: "3.0.0", newVersion: "3.1.0", lastPublishedAt: "2025-11-01T00:00:00Z", ageDays: 40, flagged: false },
    ],
    [],
  );
  assert.match(body, /2件を確認し、放置の疑いはありませんでした/);
  assert.doesNotMatch(body, /fresh-pkg-1/);
  assert.doesNotMatch(body, /\|.*パッケージ.*\|/);
});

test("renderMaintenanceSection: 放置検知でflagged該当行のみを経過日数の降順で表示する", () => {
  const body = renderMaintenanceSection(
    [
      { name: "stale-pkg-short", oldVersion: "1.0.0", newVersion: "1.0.1", lastPublishedAt: "2022-01-01T00:00:00Z", ageDays: 800, flagged: true },
      { name: "fresh-pkg", oldVersion: "2.0.0", newVersion: "2.1.0", lastPublishedAt: "2025-12-01T00:00:00Z", ageDays: 10, flagged: false },
      { name: "stale-pkg-long", oldVersion: "3.0.0", newVersion: "3.0.1", lastPublishedAt: "2019-01-01T00:00:00Z", ageDays: 2500, flagged: true },
    ],
    [],
  );
  assert.match(body, /3件中2件で放置の疑いがあります/);
  assert.doesNotMatch(body, /fresh-pkg/);
  const longIndex = body.indexOf("stale-pkg-long");
  const shortIndex = body.indexOf("stale-pkg-short");
  assert.ok(longIndex !== -1 && shortIndex !== -1 && longIndex < shortIndex, "経過日数が長い順（降順）で並ぶこと");
});

test("renderMaintenanceSection: Scorecardでflaggedが1件も無い場合は件数のみの要約にする", () => {
  const body = renderMaintenanceSection(
    [],
    [{ name: "pkg", oldVersion: "1.0.0", newVersion: "1.0.1", owner: "owner", repo: "pkg", score: 9.0, flagged: false }],
  );
  assert.match(body, /1件を確認し、低スコアはありませんでした/);
  assert.doesNotMatch(body, /\|.*pkg.*\|/);
});

test("renderMaintenanceSection: Scorecardでflagged該当行のみをスコアの昇順で表示する", () => {
  const body = renderMaintenanceSection(
    [],
    [
      { name: "mid-score-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", owner: "owner", repo: "mid-score-pkg", score: 4.0, flagged: true },
      { name: "high-score-pkg", oldVersion: "2.0.0", newVersion: "2.1.0", owner: "owner", repo: "high-score-pkg", score: 9.0, flagged: false },
      { name: "low-score-pkg", oldVersion: "3.0.0", newVersion: "3.0.1", owner: "owner", repo: "low-score-pkg", score: 1.5, flagged: true },
    ],
  );
  assert.match(body, /3件中2件が低スコアです/);
  assert.doesNotMatch(body, /high-score-pkg/);
  const lowIndex = body.indexOf("low-score-pkg");
  const midIndex = body.indexOf("mid-score-pkg");
  assert.ok(lowIndex !== -1 && midIndex !== -1 && lowIndex < midIndex, "スコアが低い順（昇順）で並ぶこと");
});

test("renderMaintenanceSection: 放置検知のみ空の場合、Scorecardセクションのみ表示する", () => {
  const body = renderMaintenanceSection(
    [],
    [{ name: "pkg", oldVersion: "1.0.0", newVersion: "1.0.1", owner: "owner", repo: "pkg", score: 5, flagged: false }],
  );
  assert.doesNotMatch(body, /\*\*放置検知\*\*/);
  assert.match(body, /OpenSSF Scorecard/);
});
