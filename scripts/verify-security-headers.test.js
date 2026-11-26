"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate, check, renderTable } = require("./verify-security-headers.js");

const good = {
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

test("全て満たせば、不足は無い（X-Frame-Optionsの代わりにframe-ancestors）", () => {
  assert.deepEqual(evaluate(good), []);
});

test("何も無ければ、5つの不足を返す", () => {
  assert.equal(evaluate({}).length, 5);
});

test("HSTSのmax-ageが短い・nosniff以外・frame防止が無い場合を、検知する", () => {
  const p = evaluate({
    ...good,
    "strict-transport-security": "max-age=60",
    "x-content-type-options": "sniff",
    "content-security-policy": "default-src 'self'",
  });
  assert.equal(p.length, 3);
  assert.ok(p.some((s) => s.includes("max-age")));
});

test("X-Frame-Optionsがあれば、frame-ancestorsが無くてもよい", () => {
  const h = { ...good, "content-security-policy": "default-src 'self'", "x-frame-options": "DENY" };
  assert.deepEqual(evaluate(h), []);
});

test("check: レスポンスのヘッダーを実測し、取得失敗は不足として返す", async () => {
  const ok = await check("https://x.example/", async () => new Response("", { headers: good }));
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.status, 200);
  const ng = await check("https://x.example/", async () => { throw new TypeError("fetch failed"); });
  assert.equal(ng.status, null);
  assert.match(ng.problems[0], /取得できない/);
});

test("renderTable: 結果を表にする", () => {
  const t = renderTable([{ url: "https://a/", status: 200, problems: [] }, { url: "https://b/", status: 200, problems: ["x"] }]);
  assert.match(t, /\| https:\/\/a\/ \| 200 \| OK \|/);
  assert.match(t, /\| https:\/\/b\/ \| 200 \| x \|/);
});
