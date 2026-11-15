"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isSameSecret } = require("./sharedSecret.js");

test("isSameSecret: 一致する場合はtrue", () => {
  assert.equal(isSameSecret("s3cret", "s3cret"), true);
});

test("isSameSecret: 不一致の場合はfalse", () => {
  assert.equal(isSameSecret("s3cret", "s3creT"), false);
});

test("isSameSecret: 長さが違っても例外を投げずfalse", () => {
  assert.equal(isSameSecret("short", "a-much-longer-secret"), false);
});

test("isSameSecret: providedがundefinedならfalse", () => {
  assert.equal(isSameSecret(undefined, "s3cret"), false);
});

test("isSameSecret: 空文字列同士でも（設定漏れ防止のため）false", () => {
  assert.equal(isSameSecret("", ""), false);
  assert.equal(isSameSecret("x", undefined), false);
});
