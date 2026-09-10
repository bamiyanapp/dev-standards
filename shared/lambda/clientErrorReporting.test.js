"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CLIENT_ERROR_FIELD_MAX_LENGTHS,
  truncateClientErrorField,
  buildClientErrorLogPayload,
  buildClientErrorAlertMessage,
} = require("./clientErrorReporting.js");

test("builds a payload with all fields when message is present", () => {
  const payload = buildClientErrorLogPayload({
    message: "テスト用の例外",
    stack: "Error: テスト用の例外\n    at Bomb",
    componentStack: "\n    in Bomb\n    in ErrorBoundary",
    url: "https://example.com/",
  });

  assert.deepEqual(payload, {
    message: "テスト用の例外",
    stack: "Error: テスト用の例外\n    at Bomb",
    componentStack: "\n    in Bomb\n    in ErrorBoundary",
    url: "https://example.com/",
  });
});

test("returns null when message is missing (invalid input)", () => {
  assert.equal(buildClientErrorLogPayload({ stack: "Error" }), null);
});

test("returns null when message is an empty string", () => {
  assert.equal(buildClientErrorLogPayload({ message: "" }), null);
});

test("returns null when body is undefined", () => {
  assert.equal(buildClientErrorLogPayload(undefined), null);
});

test("omits optional fields that are not strings instead of throwing", () => {
  const payload = buildClientErrorLogPayload({ message: "エラー", stack: 123, componentStack: null });

  assert.equal(payload.message, "エラー");
  assert.equal(payload.stack, undefined);
  assert.equal(payload.componentStack, undefined);
});

test("truncates fields that exceed their max length (abuse prevention)", () => {
  const payload = buildClientErrorLogPayload({
    message: "a".repeat(1000),
    stack: "b".repeat(5000),
    componentStack: "c".repeat(5000),
    url: "d".repeat(1000),
  });

  assert.equal(payload.message.length, CLIENT_ERROR_FIELD_MAX_LENGTHS.message);
  assert.equal(payload.stack.length, CLIENT_ERROR_FIELD_MAX_LENGTHS.stack);
  assert.equal(payload.componentStack.length, CLIENT_ERROR_FIELD_MAX_LENGTHS.componentStack);
  assert.equal(payload.url.length, CLIENT_ERROR_FIELD_MAX_LENGTHS.url);
});

test("truncateClientErrorField leaves short strings untouched", () => {
  assert.equal(truncateClientErrorField("short", 500), "short");
});

test("truncateClientErrorField returns undefined for non-string values", () => {
  assert.equal(truncateClientErrorField(123, 500), undefined);
  assert.equal(truncateClientErrorField(null, 500), undefined);
  assert.equal(truncateClientErrorField(undefined, 500), undefined);
});

test("buildClientErrorAlertMessage builds a LINE message including the app name (bamiyanapp/dev-standards#387)", () => {
  const message = buildClientErrorAlertMessage({
    appName: "karuta",
    message: "テスト用の例外",
    url: "https://example.com/",
  });

  assert.equal(
    message,
    ["【フロントエンドエラー】", "アプリ: karuta", "内容: テスト用の例外", "発生ページ: https://example.com/"].join("\n"),
  );
});

test("buildClientErrorAlertMessage omits the URL line when url is not provided", () => {
  const message = buildClientErrorAlertMessage({ appName: "karuta", message: "テスト用の例外" });

  assert.equal(message, ["【フロントエンドエラー】", "アプリ: karuta", "内容: テスト用の例外"].join("\n"));
});
