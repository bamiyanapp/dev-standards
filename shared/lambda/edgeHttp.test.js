"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseCookies,
  cookieString,
  redirectResponse,
  jsonResponse,
  normalizeUri,
  parseJsonBody,
} = require("./edgeHttp.js");

test("parseCookies: 複数のCookieヘッダー・複数の組を解析する", () => {
  const headers = { cookie: [{ value: "a=1; b=2" }, { value: "c=3" }] };
  assert.deepEqual(parseCookies(headers), { a: "1", b: "2", c: "3" });
});

test("parseCookies: ヘッダー無し・'='無し・空のキー・値に'='を含む場合", () => {
  assert.deepEqual(parseCookies({}), {});
  assert.deepEqual(parseCookies({ cookie: [{ value: "novalue; =x; k=a=b" }] }), { k: "a=b" });
});

test("cookieString: 認証に必要な属性（Path・Secure・HttpOnly・SameSite=Lax・Max-Age）を付ける", () => {
  assert.equal(cookieString("id", "v", 60), "id=v; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=60");
});

test("redirectResponse: 302とLocationを返す。Cookieがあれば複数のSet-Cookieにする", () => {
  const r = redirectResponse("/x", ["a=1", "b=2"]);
  assert.equal(r.status, "302");
  assert.equal(r.statusDescription, "Found");
  assert.deepEqual(r.headers.location, [{ key: "Location", value: "/x" }]);
  assert.deepEqual(r.headers["set-cookie"], [
    { key: "Set-Cookie", value: "a=1" },
    { key: "Set-Cookie", value: "b=2" },
  ]);
});

test("redirectResponse: Cookieが無い・空ならSet-Cookieを付けない", () => {
  assert.equal(redirectResponse("/x").headers["set-cookie"], undefined);
  assert.equal(redirectResponse("/x", []).headers["set-cookie"], undefined);
});

test("jsonResponse: statusは文字列、bodyはJSON文字列", () => {
  const r = jsonResponse(403, "Forbidden", { error: "no" });
  assert.equal(r.status, "403");
  assert.equal(r.statusDescription, "Forbidden");
  assert.equal(r.body, '{"error":"no"}');
  assert.equal(r.headers["content-type"][0].value, "application/json; charset=utf-8");
});

test("normalizeUri: 末尾'/'・拡張子無し・拡張子ありを正規化する", () => {
  assert.equal(normalizeUri("/a/"), "/a/index.html");
  assert.equal(normalizeUri("/a"), "/a/index.html");
  assert.equal(normalizeUri("/a/b.js"), "/a/b.js");
  assert.equal(normalizeUri("/"), "/index.html");
});

test("parseJsonBody: 平文・base64・不正なJSON・bodyなし", () => {
  assert.deepEqual(parseJsonBody({ body: { data: '{"a":1}' } }), { a: 1 });
  const b64 = Buffer.from('{"a":2}').toString("base64");
  assert.deepEqual(parseJsonBody({ body: { encoding: "base64", data: b64 } }), { a: 2 });
  assert.equal(parseJsonBody({ body: { data: "{" } }), null);
  assert.equal(parseJsonBody({}), null);
  assert.equal(parseJsonBody({ body: {} }), null);
});
