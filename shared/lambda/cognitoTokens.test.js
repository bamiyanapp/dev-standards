"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createCognitoTokens } = require("./cognitoTokens.js");

const config = { region: "us-east-1", userPoolId: "pool1", clientId: "cid", clientSecret: "sec" };
const ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/pool1";

function fakeJose({ verifyImpl } = {}) {
  const calls = { jwks: [], verify: [] };
  return {
    calls,
    createRemoteJWKSet: (url) => {
      calls.jwks.push(url.toString());
      return { jwks: true };
    },
    jwtVerify: async (token, keys, options) => {
      calls.verify.push({ token, keys, options });
      if (verifyImpl) return verifyImpl(token);
      return { payload: { email: "a@example.com" } };
    },
  };
}

// 応答をチャンクに分けて返す偽のhttps
function fakeHttps({ statusCode = 200, chunks = [Buffer.from('{"id_token":"t"}')], error } = {}) {
  const requests = [];
  return {
    requests,
    request(options, onResponse) {
      const req = new EventEmitter();
      req.end = (body) => {
        requests.push({ options, body });
        if (error) {
          req.emit("error", error);
          return;
        }
        const res = new EventEmitter();
        res.statusCode = statusCode;
        onResponse(res);
        for (const c of chunks) res.emit("data", c);
        res.emit("end");
      };
      return req;
    },
  };
}

test("verifyIdToken: issuer・audienceを指定して検証し、payloadを返す", async () => {
  const jose = fakeJose();
  const { verifyIdToken } = createCognitoTokens({ jose, config, https: fakeHttps() });
  const payload = await verifyIdToken("tok");
  assert.deepEqual(payload, { email: "a@example.com" });
  assert.deepEqual(jose.calls.verify[0].options, { issuer: ISSUER, audience: "cid" });
});

test("verifyIdToken: JWKSは一度だけ作って再利用する（URLも固定）", async () => {
  const jose = fakeJose();
  const { verifyIdToken } = createCognitoTokens({ jose, config, https: fakeHttps() });
  await verifyIdToken("a");
  await verifyIdToken("b");
  assert.equal(jose.calls.jwks.length, 1);
  assert.equal(jose.calls.jwks[0], `${ISSUER}/.well-known/jwks.json`);
  assert.equal(jose.calls.verify[0].keys, jose.calls.verify[1].keys);
});

test("verifyIdToken: 検証に失敗したら、エラーをそのまま投げる", async () => {
  const jose = fakeJose({
    verifyImpl: () => {
      throw new Error("expired");
    },
  });
  const { verifyIdToken } = createCognitoTokens({ jose, config, https: fakeHttps() });
  await assert.rejects(() => verifyIdToken("x"), /expired/);
});

test("exchangeAuthorizationCode: Basic認証とフォームで、トークンエンドポイントを呼ぶ", async () => {
  const https = fakeHttps();
  const { exchangeAuthorizationCode } = createCognitoTokens({ jose: fakeJose(), config, https });
  const result = await exchangeAuthorizationCode("code1", "https://d.example/_callback", "auth.example.com");
  assert.deepEqual(result, { id_token: "t" });
  const { options, body } = https.requests[0];
  assert.equal(options.hostname, "auth.example.com");
  assert.equal(options.path, "/oauth2/token");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, `Basic ${Buffer.from("cid:sec").toString("base64")}`);
  assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(options.headers["Content-Length"], Buffer.byteLength(body));
  assert.deepEqual(Object.fromEntries(new URLSearchParams(body)), {
    grant_type: "authorization_code",
    client_id: "cid",
    code: "code1",
    redirect_uri: "https://d.example/_callback",
  });
});

test("exchangeRefreshToken: refresh_tokenのgrantで呼ぶ", async () => {
  const https = fakeHttps();
  const { exchangeRefreshToken } = createCognitoTokens({ jose: fakeJose(), config, https });
  await exchangeRefreshToken("r1", "auth.example.com");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(https.requests[0].body)), {
    grant_type: "refresh_token",
    client_id: "cid",
    refresh_token: "r1",
  });
});

test("postForm: マルチバイト文字がチャンクの境界で分割されても、文字化けしない", async () => {
  const bytes = Buffer.from('{"name":"あ"}');
  const cut = bytes.indexOf(0xe3) + 1;
  const https = fakeHttps({ chunks: [bytes.subarray(0, cut), bytes.subarray(cut)] });
  const { postForm } = createCognitoTokens({ jose: fakeJose(), config, https });
  assert.deepEqual(await postForm("h", "/p", {}), { name: "あ" });
});

test("postForm: 2xx以外は、ステータスと本文つきのエラー", async () => {
  const https = fakeHttps({ statusCode: 400, chunks: [Buffer.from("bad")] });
  const { postForm } = createCognitoTokens({ jose: fakeJose(), config, https });
  await assert.rejects(() => postForm("h", "/p", {}), /token endpoint returned 400: bad/);
});

test("postForm: JSONでない応答は、エラー", async () => {
  const https = fakeHttps({ chunks: [Buffer.from("<html>")] });
  const { postForm } = createCognitoTokens({ jose: fakeJose(), config, https });
  await assert.rejects(() => postForm("h", "/p", {}), /invalid JSON: <html>/);
});

test("postForm: 通信エラーは、そのまま投げる", async () => {
  const https = fakeHttps({ error: new Error("ECONNRESET") });
  const { postForm } = createCognitoTokens({ jose: fakeJose(), config, https });
  await assert.rejects(() => postForm("h", "/p", {}), /ECONNRESET/);
});
