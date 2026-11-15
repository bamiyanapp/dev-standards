"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { extractBearerToken } = require("./bearerToken.js");

test("extractBearerToken: Authorizationヘッダーからトークンを取り出す", () => {
  assert.equal(extractBearerToken({ headers: { Authorization: "Bearer abc.def" } }), "abc.def");
});

test("extractBearerToken: ヘッダー名・スキーム名の大文字小文字を区別しない", () => {
  assert.equal(extractBearerToken({ headers: { authorization: "bearer tok" } }), "tok");
});

test("extractBearerToken: ヘッダー無し・headers無し・event無しはnull", () => {
  assert.equal(extractBearerToken({ headers: {} }), null);
  assert.equal(extractBearerToken({}), null);
  assert.equal(extractBearerToken(undefined), null);
});

test("extractBearerToken: Bearer以外のスキーム・トークン空はnull", () => {
  assert.equal(extractBearerToken({ headers: { Authorization: "Basic abc" } }), null);
  assert.equal(extractBearerToken({ headers: { Authorization: "Bearer " } }), null);
  assert.equal(extractBearerToken({ headers: { Authorization: "Bearer a b" } }), null);
});
