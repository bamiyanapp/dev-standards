"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeRedirectPath } = require("./redirectPath.js");

const cases = [
  ["/home", "/home"],
  ["/a/b?c=1#d", "/a/b?c=1#d"],
  ["/", "/"],
  ["", "/"],
  [null, "/"],
  [undefined, "/"],
  ["//evil.example", "/"],
  ["//evil.example/path", "/"],
  ["https://evil.example", "/"],
  ["http://evil.example", "/"],
  ["evil.example", "/"],
  ["javascript:alert(1)", "/"],
];

for (const [input, expected] of cases) {
  test(`sanitizeRedirectPath: ${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
    assert.equal(sanitizeRedirectPath(input), expected);
  });
}
