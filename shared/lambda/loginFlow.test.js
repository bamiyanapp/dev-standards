"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createLoginFlow, forbiddenResponse } = require("./loginFlow.js");

const silent = { error: () => {} };
const b64 = (obj) => Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");

function setup({ consume = async () => true, exchange, verify } = {}) {
  const calls = { consume: [], exchange: [], verify: [], errors: [] };
  const flow = createLoginFlow({
    csrfNonce: {
      issueCsrfNonce: async () => "n1",
      consumeCsrfNonce: async (n) => {
        calls.consume.push(n);
        return consume(n);
      },
    },
    cognitoTokens: {
      exchangeAuthorizationCode: async (...a) => {
        calls.exchange.push(a);
        return exchange ? exchange() : { id_token: "idt", refresh_token: "rt", expires_in: 3600 };
      },
      verifyIdToken: async (t) => {
        calls.verify.push(t);
        return verify ? verify() : { email: "a@example.com" };
      },
    },
    config: { clientId: "cid" },
    logger: { error: (...a) => calls.errors.push(a) },
  });
  return { flow, calls };
}

const cb = (state, code = "c1") => ({
  querystring: new URLSearchParams({ ...(code ? { code } : {}), ...(state ? { state } : {}) }).toString(),
  domainName: "d.example",
  cognitoDomainHost: "auth.example.com",
});

test("buildLoginRedirect: nonceと戻り先をstateへ載せ、Hosted UIへ302する", async () => {
  const { flow } = setup();
  const r = await flow.buildLoginRedirect("/settings/", "d.example", "auth.example.com", ["a=1"]);
  assert.equal(r.status, "302");
  const url = new URL(r.headers.location[0].value);
  assert.equal(url.origin, "https://auth.example.com");
  assert.equal(url.pathname, "/oauth2/authorize");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("redirect_uri"), "https://d.example/_callback");
  assert.deepEqual(JSON.parse(Buffer.from(url.searchParams.get("state"), "base64").toString()), {
    uri: "/settings/",
    nonce: "n1",
  });
  assert.deepEqual(r.headers["set-cookie"], [{ key: "Set-Cookie", value: "a=1" }]);
});

test("authenticateCallback: code・stateが無ければ400（nonceは消費しない）", async () => {
  const { flow, calls } = setup();
  for (const args of [cb(null), cb(b64({}), null)]) {
    const { response } = await flow.authenticateCallback(args);
    assert.equal(response.status, "400");
    assert.equal(response.body, "missing code or state");
  }
  assert.equal(calls.consume.length, 0);
});

test("authenticateCallback: stateを復号できなければ400 invalid state", async () => {
  const { flow, calls } = setup();
  const { response } = await flow.authenticateCallback(cb("!!!not-json"));
  assert.equal(response.status, "400");
  assert.equal(response.body, "invalid state");
  assert.equal(calls.consume.length, 0);
});

test("authenticateCallback: nonceが無効なら400 invalid state。コードは交換しない", async () => {
  const { flow, calls } = setup({ consume: async () => false });
  const { response } = await flow.authenticateCallback(cb(b64({ uri: "/", nonce: "used" })));
  assert.equal(response.status, "400");
  assert.equal(response.body, "invalid state");
  assert.deepEqual(calls.consume, ["used"]);
  assert.equal(calls.exchange.length, 0);
});

test("authenticateCallback: コードの交換に失敗したら502", async () => {
  const { flow, calls } = setup({
    exchange: () => {
      throw new Error("boom");
    },
  });
  const { response } = await flow.authenticateCallback(cb(b64({ uri: "/", nonce: "n" })));
  assert.equal(response.status, "502");
  assert.equal(response.body, "authentication failed");
  assert.equal(calls.verify.length, 0);
  assert.equal(calls.errors[0][0], "Token exchange failed");
});

test("authenticateCallback: id_tokenの検証に失敗したら403", async () => {
  const { flow, calls } = setup({
    verify: () => {
      throw new Error("bad sig");
    },
  });
  const { response } = await flow.authenticateCallback(cb(b64({ uri: "/", nonce: "n" })));
  assert.deepEqual(response, forbiddenResponse());
  assert.deepEqual(calls.errors[0], ["id_token verification failed at callback", "bad sig"]);
});

test("authenticateCallback: 成功すれば、payload・tokens・戻り先を返す", async () => {
  const { flow, calls } = setup();
  const result = await flow.authenticateCallback(cb(b64({ uri: "/settings/", nonce: "n" })));
  assert.deepEqual(result.payload, { email: "a@example.com" });
  assert.equal(result.tokens.id_token, "idt");
  assert.equal(result.originalUri, "/settings/");
  assert.deepEqual(calls.exchange[0], ["c1", "https://d.example/_callback", "auth.example.com"]);
  assert.deepEqual(calls.verify, ["idt"]);
});

test("authenticateCallback: stateにuriが無ければ、戻り先は'/'", async () => {
  const { flow } = setup();
  const result = await flow.authenticateCallback(cb(b64({ nonce: "n" })));
  assert.equal(result.originalUri, "/");
});

test("forbiddenResponse: 403とtext/plainの本文", () => {
  const r = forbiddenResponse();
  assert.equal(r.status, "403");
  assert.equal(r.headers["content-type"][0].value, "text/plain; charset=utf-8");
});
