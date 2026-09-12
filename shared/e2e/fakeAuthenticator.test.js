import test from "node:test";
import assert from "node:assert/strict";
import { createFakeAuthenticator } from "./fakeAuthenticator.js";
import { createFakeSessionToken } from "./fakeSessionToken.js";

test("Authorizationヘッダーが無い場合は401を投げる", async () => {
  const authenticate = createFakeAuthenticator();
  await assert.rejects(() => authenticate({}), (error) => {
    assert.equal(error.statusCode, 401);
    return true;
  });
});

test("Bearerプレフィックスが無い場合は401を投げる", async () => {
  const authenticate = createFakeAuthenticator();
  await assert.rejects(
    () => authenticate({ authorization: "Basic abc" }),
    (error) => {
      assert.equal(error.statusCode, 401);
      return true;
    }
  );
});

test("payloadにsubが無い場合は401を投げる", async () => {
  const authenticate = createFakeAuthenticator();
  const token = createFakeSessionToken({ name: "匿名" });
  await assert.rejects(
    () => authenticate({ authorization: `Bearer ${token}` }),
    (error) => {
      assert.equal(error.statusCode, 401);
      return true;
    }
  );
});

test("payloadが不正なJSONの場合は401を投げる", async () => {
  const authenticate = createFakeAuthenticator();
  await assert.rejects(
    () => authenticate({ authorization: "Bearer header.not-valid-base64url-json.signature" }),
    (error) => {
      assert.equal(error.statusCode, 401);
      return true;
    }
  );
});

test("正常なfakeトークンの場合はpayloadのクレームを返す", async () => {
  const authenticate = createFakeAuthenticator();
  const token = createFakeSessionToken({
    sub: "user-1",
    name: "テスト太郎",
    email: "test@example.com",
    picture: "https://example.com/icon.png",
  });
  const result = await authenticate({ authorization: `Bearer ${token}` });
  assert.deepEqual(result, {
    userId: "user-1",
    name: "テスト太郎",
    email: "test@example.com",
    picture: "https://example.com/icon.png",
  });
});

test("Authorizationヘッダーが大文字（Authorization）でも動作する", async () => {
  const authenticate = createFakeAuthenticator();
  const token = createFakeSessionToken({ sub: "user-2" });
  const result = await authenticate({ Authorization: `Bearer ${token}` });
  assert.equal(result.userId, "user-2");
});
