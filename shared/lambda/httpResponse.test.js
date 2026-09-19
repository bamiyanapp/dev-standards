"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { jsonResponse, badRequest, notFound, serverError } = require("./httpResponse.js");

test("jsonResponse: statusCode・CORSヘッダー・JSON文字列化されたbodyを返す", () => {
  const response = jsonResponse("https://example.com", 200, { ok: true });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.headers, { "Access-Control-Allow-Origin": "https://example.com" });
  assert.equal(response.body, JSON.stringify({ ok: true }));
});

test("jsonResponse: credentials: trueを指定するとAccess-Control-Allow-Credentialsヘッダーを付与する", () => {
  const response = jsonResponse("https://example.com", 200, {}, { credentials: true });

  assert.deepEqual(response.headers, {
    "Access-Control-Allow-Origin": "https://example.com",
    "Access-Control-Allow-Credentials": true,
  });
});

test("jsonResponse: credentialsを省略するとAccess-Control-Allow-Credentialsヘッダーを付与しない", () => {
  const response = jsonResponse("https://example.com", 200, {});

  assert.equal("Access-Control-Allow-Credentials" in response.headers, false);
});

test("badRequest: 400とmessageを含むbodyを返す", () => {
  const response = badRequest("https://example.com", "roomId is required");

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { message: "roomId is required" });
});

test("notFound: 404とmessageを含むbodyを返す", () => {
  const response = notFound("https://example.com", "room not found");

  assert.equal(response.statusCode, 404);
  assert.deepEqual(JSON.parse(response.body), { message: "room not found" });
});

test("serverError: 既定ではerrorの詳細を含めず、Internal Server Errorのみ返す", () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const response = serverError("https://example.com", new Error("boom"));

    assert.equal(response.statusCode, 500);
    assert.deepEqual(JSON.parse(response.body), { message: "Internal Server Error" });
  } finally {
    console.error = originalConsoleError;
  }
});

test("serverError: includeMessage: trueを指定するとerror.messageをbodyに含める", () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const response = serverError("https://example.com", new Error("boom"), { includeMessage: true });

    assert.deepEqual(JSON.parse(response.body), { message: "Internal Server Error", error: "boom" });
  } finally {
    console.error = originalConsoleError;
  }
});

test("serverError: エラーをconsole.errorへログ出力する", () => {
  const loggedErrors = [];
  const originalConsoleError = console.error;
  console.error = (error) => loggedErrors.push(error);
  try {
    const error = new Error("boom");
    serverError("https://example.com", error);

    assert.deepEqual(loggedErrors, [error]);
  } finally {
    console.error = originalConsoleError;
  }
});
