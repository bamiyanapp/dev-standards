"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { findingKey, updateLedger, summarizeMttr } = require("./dependency-mttr-tracker.js");

test("findingKey combines name and version", () => {
  assert.equal(findingKey({ name: "lodash", version: "4.17.0" }), "lodash@4.17.0");
});

test("updateLedger adds newly detected findings with firstDetectedAt", () => {
  const { ledger, resolved } = updateLedger([], [{ name: "lodash", version: "4.17.0" }], "2026-01-01T00:00:00.000Z");
  assert.deepEqual(ledger, [
    { key: "lodash@4.17.0", name: "lodash", version: "4.17.0", firstDetectedAt: "2026-01-01T00:00:00.000Z" },
  ]);
  assert.deepEqual(resolved, []);
});

test("updateLedger keeps existing entries that are still present", () => {
  const existingLedger = [{ key: "lodash@4.17.0", name: "lodash", version: "4.17.0", firstDetectedAt: "2026-01-01T00:00:00.000Z" }];
  const { ledger, resolved } = updateLedger(existingLedger, [{ name: "lodash", version: "4.17.0" }], "2026-01-05T00:00:00.000Z");
  assert.deepEqual(ledger, existingLedger);
  assert.deepEqual(resolved, []);
});

test("updateLedger marks entries no longer in findings as resolved and computes mttrDays", () => {
  const existingLedger = [{ key: "lodash@4.17.0", name: "lodash", version: "4.17.0", firstDetectedAt: "2026-01-01T00:00:00.000Z" }];
  const { ledger, resolved } = updateLedger(existingLedger, [], "2026-01-04T00:00:00.000Z");
  assert.deepEqual(ledger, []);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].name, "lodash");
  assert.equal(resolved[0].version, "4.17.0");
  assert.equal(resolved[0].detectedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(resolved[0].resolvedAt, "2026-01-04T00:00:00.000Z");
  assert.equal(resolved[0].mttrDays, 3);
});

test("updateLedger handles a mix of kept, resolved, and newly added entries in one call", () => {
  const existingLedger = [
    { key: "a@1.0.0", name: "a", version: "1.0.0", firstDetectedAt: "2026-01-01T00:00:00.000Z" },
    { key: "b@2.0.0", name: "b", version: "2.0.0", firstDetectedAt: "2026-01-01T00:00:00.000Z" },
  ];
  const currentFindings = [{ name: "a", version: "1.0.0" }, { name: "c", version: "3.0.0" }];
  const { ledger, resolved } = updateLedger(existingLedger, currentFindings, "2026-01-10T00:00:00.000Z");

  assert.equal(ledger.length, 2);
  assert.ok(ledger.some((e) => e.key === "a@1.0.0"));
  assert.ok(ledger.some((e) => e.key === "c@3.0.0"));
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].name, "b");
});

test("summarizeMttr returns null average when no entries resolved in window", () => {
  assert.deepEqual(summarizeMttr([], "2026-01-01T00:00:00.000Z"), { count: 0, averageMttrDays: null });
});

test("summarizeMttr computes average mttrDays for entries within the window", () => {
  const history = [
    { name: "a", version: "1.0.0", detectedAt: "2025-12-01T00:00:00.000Z", resolvedAt: "2025-12-05T00:00:00.000Z", mttrDays: 4 },
    { name: "b", version: "2.0.0", detectedAt: "2026-01-02T00:00:00.000Z", resolvedAt: "2026-01-04T00:00:00.000Z", mttrDays: 2 },
    { name: "c", version: "3.0.0", detectedAt: "2026-01-02T00:00:00.000Z", resolvedAt: "2026-01-08T00:00:00.000Z", mttrDays: 6 },
  ];
  const summary = summarizeMttr(history, "2026-01-01T00:00:00.000Z");
  assert.equal(summary.count, 2);
  assert.equal(summary.averageMttrDays, 4);
});
