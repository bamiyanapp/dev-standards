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
  // #1593: ブラウザが"//"として扱う入力
  ["/\\evil.example", "/"],
  ["/\\\\evil.example", "/"],
  ["/a\\b", "/"],
  ["/\t/evil.example", "/"],
  ["/\n/evil.example", "/"],
  ["/\r/evil.example", "/"],
  ["/\u0000/evil.example", "/"],
  ["/\u007f", "/"],
  // 正当な入力は、そのまま通す
  ["/a%5Cb", "/a%5Cb"],
  ["/日本語/ページ", "/日本語/ページ"],
];

for (const [input, expected] of cases) {
  test(`sanitizeRedirectPath: ${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
    assert.equal(sanitizeRedirectPath(input), expected);
  });
}
