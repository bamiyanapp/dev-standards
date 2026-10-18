"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { renderMaintenanceSection } = require("./dependency-maintenance-summary.js");

test("renderMaintenanceSection: 両方空の場合は対象なしの文を返す", () => {
  const body = renderMaintenanceSection([], []);
  assert.match(body, /対象パッケージはありませんでした/);
});

test("renderMaintenanceSection: 放置検知の全件（flagged true/false両方）を表示する", () => {
  const body = renderMaintenanceSection(
    [
      { name: "stale-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", lastPublishedAt: "2019-01-01T00:00:00Z", ageDays: 2500, flagged: true },
      { name: "fresh-pkg", oldVersion: "2.0.0", newVersion: "2.1.0", lastPublishedAt: "2025-12-01T00:00:00Z", ageDays: 10, flagged: false },
    ],
    [],
  );
  assert.match(body, /stale-pkg/);
  assert.match(body, /2500日/);
  assert.match(body, /放置の疑いあり/);
  assert.match(body, /fresh-pkg/);
  assert.match(body, /10日/);
  assert.match(body, /問題なし/);
});

test("renderMaintenanceSection: Scorecardの全件（flagged true/false両方）を表示する", () => {
  const body = renderMaintenanceSection(
    [],
    [
      { name: "low-score-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", owner: "owner", repo: "low-score-pkg", score: 1.5, flagged: true },
      { name: "high-score-pkg", oldVersion: "2.0.0", newVersion: "2.1.0", owner: "owner", repo: "high-score-pkg", score: 9.0, flagged: false },
    ],
  );
  assert.match(body, /low-score-pkg/);
  assert.match(body, /owner\/low-score-pkg/);
  assert.match(body, /低スコア/);
  assert.match(body, /high-score-pkg/);
});

test("renderMaintenanceSection: 放置検知のみ空の場合、Scorecardセクションのみ表示する", () => {
  const body = renderMaintenanceSection(
    [],
    [{ name: "pkg", oldVersion: "1.0.0", newVersion: "1.0.1", owner: "owner", repo: "pkg", score: 5, flagged: false }],
  );
  assert.doesNotMatch(body, /\*\*放置検知\*\*/);
  assert.match(body, /OpenSSF Scorecard/);
});
