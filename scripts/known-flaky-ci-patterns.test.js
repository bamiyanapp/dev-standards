"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { findKnownFlakyPatterns } = require("./known-flaky-ci-patterns.js");

test("findKnownFlakyPatterns: 登録済みのjobKeyでは該当パターンを返す", () => {
  const patterns = findKnownFlakyPatterns("frontendE2eTest");
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].issueRef, "bamiyanapp/karuta#972");
  assert.match(patterns[0].description, /Polly/);
});

test("findKnownFlakyPatterns: 未登録のjobKeyでは空配列を返す", () => {
  assert.deepEqual(findKnownFlakyPatterns("backendTest"), []);
  assert.deepEqual(findKnownFlakyPatterns("nonexistentJob"), []);
});
