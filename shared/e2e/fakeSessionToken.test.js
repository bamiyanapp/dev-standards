import test from "node:test";
import assert from "node:assert/strict";
import { createFakeSessionToken, loginAsE2EUser } from "./fakeSessionToken.js";

function decodePayload(token) {
  const [, payloadSegment] = token.split(".");
  return JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf-8"));
}

test("createFakeSessionTokenはJWT形状（3パート、ドット区切り）のトークンを返す", () => {
  const token = createFakeSessionToken({ sub: "user-1" });
  assert.equal(token.split(".").length, 3);
});

test("createFakeSessionTokenのpayloadには渡したクレームがそのまま入る", () => {
  const token = createFakeSessionToken({
    sub: "user-1",
    name: "テスト太郎",
    email: "test@example.com",
    picture: "https://example.com/icon.png",
  });
  assert.deepEqual(decodePayload(token), {
    sub: "user-1",
    name: "テスト太郎",
    email: "test@example.com",
    picture: "https://example.com/icon.png",
  });
});

function fakeContext() {
  const calls = [];
  return {
    calls,
    async addCookies(cookies) {
      calls.push(cookies);
    },
  };
}

test("loginAsE2EUserは指定したcookieNameでCookieを注入する", async () => {
  const context = fakeContext();
  const token = await loginAsE2EUser(context, {
    baseURL: "https://example.com",
    cookieName: "my-app-id-token",
    sub: "user-1",
    name: "テスト太郎",
    email: "test@example.com",
    picture: "https://example.com/icon.png",
  });

  assert.equal(context.calls.length, 1);
  const [cookie] = context.calls[0];
  assert.equal(cookie.name, "my-app-id-token");
  assert.equal(cookie.value, token);
  assert.equal(cookie.domain, "example.com");
  assert.equal(cookie.path, "/");
});

test("loginAsE2EUserは注入したfakeトークンを戻り値として返す", async () => {
  const context = fakeContext();
  const token = await loginAsE2EUser(context, {
    baseURL: "https://example.com",
    cookieName: "my-app-id-token",
    sub: "user-1",
  });

  assert.deepEqual(decodePayload(token), { sub: "user-1" });
});
