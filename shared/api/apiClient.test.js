import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, buildUrl, createApiClient, isRetryable, messageForApiError } from "./apiClient.js";

const ok = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const noSleep = async () => {};

test("buildUrl: スラッシュを正規化し、undefined・nullは付けない", () => {
  assert.equal(buildUrl("https://api.test/", "/items", { a: 1, b: undefined, c: null, d: "x y" }), "https://api.test/items?a=1&d=x+y");
  assert.equal(buildUrl("https://api.test", "items"), "https://api.test/items");
});

test("get: JSONを返し、URLとメソッドを正しく渡す", async () => {
  const calls = [];
  const client = createApiClient({ baseUrl: "https://api.test", fetch: async (u, i) => (calls.push([u, i]), ok({ n: 1 })) });
  assert.deepEqual(await client.get("/items", { params: { q: "a" } }), { n: 1 });
  assert.equal(calls[0][0], "https://api.test/items?q=a");
  assert.equal(calls[0][1].method, "GET");
});

test("post: JSON本文を送り、204はnullを返す", async () => {
  let init;
  const client = createApiClient({ baseUrl: "https://api.test", fetch: async (u, i) => ((init = i), ok(null, 204)) });
  assert.equal(await client.post("/items", { body: { a: 1 } }), null);
  assert.equal(init.body, '{"a":1}');
  assert.equal(init.headers["Content-Type"], "application/json");
});

test("ApiErrorの3種別: network・http・parse", async () => {
  const client = (f) => createApiClient({ baseUrl: "https://api.test", fetch: f });
  await assert.rejects(client(async () => { throw new TypeError("x"); }).get("/a"), (e) => e instanceof ApiError && e.kind === "network");
  await assert.rejects(client(async () => ok({}, 404)).get("/a"), (e) => e.kind === "http" && e.status === 404);
  await assert.rejects(client(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("x"); } })).get("/a"), (e) => e.kind === "parse");
});

test("既定ではリトライしない", async () => {
  let n = 0;
  const client = createApiClient({ baseUrl: "https://api.test", fetch: async () => (n++, ok({}, 500)), sleep: noSleep });
  await assert.rejects(client.get("/a"));
  assert.equal(n, 1);
});

test("リトライ対象: network・5xx・429。4xxは対象外", async () => {
  assert.ok(isRetryable(new ApiError("network", "x")));
  assert.ok(isRetryable(new ApiError("http", "x", { status: 503 })));
  assert.ok(isRetryable(new ApiError("http", "x", { status: 429 })));
  assert.ok(!isRetryable(new ApiError("http", "x", { status: 404 })));
  assert.ok(!isRetryable(new ApiError("parse", "x")));
  assert.ok(!isRetryable(new Error("x")));
});

test("リトライ: 指数バックオフで回数まで再試行し、成功したら返す", async () => {
  let n = 0;
  const waits = [];
  const client = createApiClient({ baseUrl: "https://api.test", fetch: async () => (++n < 3 ? ok({}, 503) : ok({ done: true })), sleep: async (ms) => void waits.push(ms) });
  assert.deepEqual(await client.get("/a", { retry: { count: 3, baseDelayMs: 100, maxDelayMs: 150 } }), { done: true });
  assert.deepEqual(waits, [100, 150]);
});

test("リトライを使い切ったら最後のエラーを投げる。4xxは再試行しない", async () => {
  let n = 0;
  const client = createApiClient({ baseUrl: "https://api.test", fetch: async () => (n++, ok({}, 500)), sleep: noSleep });
  await assert.rejects(client.get("/a", { retry: { count: 2 } }), (e) => e.status === 500);
  assert.equal(n, 3);
  n = 0;
  const client4 = createApiClient({ baseUrl: "https://api.test", fetch: async () => (n++, ok({}, 400)), sleep: noSleep });
  await assert.rejects(client4.get("/a", { retry: { count: 2 } }));
  assert.equal(n, 1);
});

test("AbortSignalによる中断はリトライせずAbortErrorを投げる", async () => {
  let n = 0;
  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  const client = createApiClient({ baseUrl: "https://api.test", fetch: async () => (n++, Promise.reject(abort)), sleep: noSleep });
  await assert.rejects(client.get("/a", { retry: { count: 3 } }), (e) => e.name === "AbortError");
  assert.equal(n, 1);
});

test("baseUrlが無ければ例外", () => {
  assert.throws(() => createApiClient({}), /baseUrl/);
});

test("messageForApiError: 種別ごとの固定文言。内部メッセージは出さず、上書きできる", () => {
  assert.match(messageForApiError(new ApiError("network", "internal-detail")), /通信/);
  assert.match(messageForApiError(new ApiError("http", "x", { status: 404 })), /見つかりません/);
  assert.match(messageForApiError(new ApiError("http", "x", { status: 502 })), /処理に失敗/);
  assert.equal(messageForApiError(new Error("raw english")), "エラーが発生しました。時間をおいてお試しください。");
  assert.ok(!messageForApiError(new ApiError("network", "internal-detail")).includes("internal"));
  assert.equal(messageForApiError(new ApiError("http", "x", { status: 404 }), { "http:404": "カスタム" }), "カスタム");
});

test("getHeaders: 値が付与され、リクエストごとに呼ばれる。undefined・nullは付けない", async () => {
  const seen = [];
  let n = 0;
  const client = createApiClient({
    baseUrl: "https://api.test",
    fetch: async (u, i) => (seen.push(i.headers), ok({})),
    getHeaders: async () => ({ Authorization: `Bearer t${++n}`, "x-skip": undefined, "x-null": null }),
  });
  await client.get("/a");
  await client.post("/a", { body: { x: 1 } });
  assert.deepEqual(seen[0], { Authorization: "Bearer t1" });
  assert.deepEqual(seen[1], { "Content-Type": "application/json", Authorization: "Bearer t2" });
});

test("getHeadersが例外を投げたら、ApiErrorにせずそのまま投げる", async () => {
  const client = createApiClient({ baseUrl: "https://api.test", fetch: async () => ok({}), getHeaders: async () => { throw new Error("auth down"); } });
  await assert.rejects(client.get("/a"), (e) => !(e instanceof ApiError) && e.message === "auth down");
});

test("401: shouldRefreshOn401がtrueなら、forceRefresh付きで1回だけ再試行する", async () => {
  const flags = [];
  let n = 0;
  const client = createApiClient({
    baseUrl: "https://api.test",
    fetch: async () => (++n === 1 ? ok({}, 401) : ok({ done: true })),
    getHeaders: async ({ forceRefresh }) => (flags.push(forceRefresh), {}),
    shouldRefreshOn401: () => true,
  });
  assert.deepEqual(await client.get("/a"), { done: true });
  assert.deepEqual(flags, [false, true]);
});

test("401: 再試行後も401ならエラー。2回目以降は再試行しない", async () => {
  let n = 0;
  const client = createApiClient({ baseUrl: "https://api.test", fetch: async () => (n++, ok({}, 401)), shouldRefreshOn401: () => true });
  await assert.rejects(client.get("/a"), (e) => e.kind === "http" && e.status === 401);
  assert.equal(n, 2);
});

test("401: shouldRefreshOn401が未指定・falseなら再試行しない", async () => {
  let n = 0;
  const client = createApiClient({ baseUrl: "https://api.test", fetch: async () => (n++, ok({}, 401)), shouldRefreshOn401: () => false });
  await assert.rejects(client.get("/a"));
  assert.equal(n, 1);
});

test("put・delete: 正しいメソッド・本文・クエリで送信する", async () => {
  const calls = [];
  const client = createApiClient({ baseUrl: "https://api.test", fetch: async (u, i) => (calls.push([u, i]), ok({ ok: 1 })) });
  await client.put("/items/1", { body: { name: "x" } });
  await client.delete("/items/1", { params: { userId: "u" } });
  assert.equal(calls[0][1].method, "PUT");
  assert.equal(calls[0][1].body, '{"name":"x"}');
  assert.equal(calls[1][0], "https://api.test/items/1?userId=u");
  assert.equal(calls[1][1].method, "DELETE");
  assert.equal(calls[1][1].body, undefined);
});

test("空本文の応答はnullを返す（content-length 0・本文が空文字列）", async () => {
  const empty = (extra) => ({ ok: true, status: 200, headers: { get: () => extra.length }, text: async () => extra.text, json: async () => { throw new SyntaxError("x"); } });
  const c1 = createApiClient({ baseUrl: "https://api.test", fetch: async () => empty({ length: "0", text: "" }) });
  const c2 = createApiClient({ baseUrl: "https://api.test", fetch: async () => empty({ length: null, text: "" }) });
  assert.equal(await c1.delete("/a"), null);
  assert.equal(await c2.delete("/a"), null);
});
