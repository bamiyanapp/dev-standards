"use strict";

// shared/pwa/sw.jsは実際のブラウザのService Worker実行環境（self/caches/fetch等の
// グローバル）を前提にしたプレーンスクリプトのため、Node.jsのvmモジュールで
// これらのグローバルを模したサンドボックス上で実行し、install/activate/fetch各
// イベントハンドラーの振る舞いを検証する。実際のimportScripts("./sw-config.js")は
// ここでは無害な no-op とし、self.SW_CONFIGを実行前に直接設定することで代替する
// （examination側での実機動作確認は別途必要）

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SW_SOURCE = fs.readFileSync(path.join(__dirname, "sw.js"), "utf-8");

function makeFakeCacheStorage() {
  const stores = new Map();
  return {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request) {
          return store.get(typeof request === "string" ? request : request.url);
        },
        async put(request, response) {
          store.set(typeof request === "string" ? request : request.url, response);
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      stores.delete(name);
    },
    // テスト側からキャッシュの中身を覗くためのヘルパー（実際のCache Storage APIには無い）
    _stores: stores,
  };
}

function makeSandbox({ config, fetchImpl }) {
  const listeners = {};
  const sandbox = {
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    location: { origin: "https://example.test" },
    SW_CONFIG: config,
  };
  sandbox.self = sandbox;
  sandbox.importScripts = () => {}; // sw-config.jsの読み込みは呼び出し側が既にSW_CONFIGを設定済みのため no-op
  sandbox.caches = makeFakeCacheStorage();
  sandbox.fetch = fetchImpl;
  sandbox.Response = { error: () => ({ __isErrorResponse: true }) };
  sandbox.URL = URL;
  sandbox.console = console;

  vm.createContext(sandbox);
  vm.runInContext(SW_SOURCE, sandbox);
  return { sandbox, listeners };
}

test("install event precaches each configured URL with the X-Precache-Request header and calls skipWaiting", async () => {
  const fetchCalls = [];
  const fetchImpl = async (url, options) => {
    fetchCalls.push({ url, options });
    return { ok: true, clone: () => ({ ok: true }) };
  };
  const { sandbox, listeners } = makeSandbox({
    config: { cacheVersion: "v1", precacheUrls: ["/", "/about/"], apiHostnames: [] },
    fetchImpl,
  });
  let skipWaitingCalled = false;
  sandbox.skipWaiting = async () => {
    skipWaitingCalled = true;
  };

  const waited = [];
  await listeners.install({ waitUntil: (promise) => waited.push(promise) });
  await Promise.all(waited);

  assert.deepEqual(
    fetchCalls.map((call) => call.url),
    ["/", "/about/"]
  );
  // fetchCalls[0].optionsはvmサンドボックス（別realm）内で生成されたオブジェクトのため、
  // deepEqual/deepStrictEqualのプロトタイプ比較を避けJSON表現で内容のみ比較する
  assert.equal(JSON.stringify(fetchCalls[0].options), JSON.stringify({ headers: { "X-Precache-Request": "1" } }));
  assert.equal(skipWaitingCalled, true);

  const staticCache = sandbox.caches._stores.get("pwa-static-v1");
  assert.ok(staticCache.has("/"));
  assert.ok(staticCache.has("/about/"));
});

test("install event tolerates a failed precache fetch without throwing", async () => {
  const fetchImpl = async (url) => {
    if (url === "/broken/") throw new Error("network error");
    return { ok: true, clone: () => ({ ok: true }) };
  };
  const { listeners } = makeSandbox({
    config: { cacheVersion: "v1", precacheUrls: ["/", "/broken/"], apiHostnames: [] },
    fetchImpl,
  });

  const waited = [];
  await assert.doesNotReject(async () => {
    await listeners.install({ waitUntil: (promise) => waited.push(promise) });
    await Promise.all(waited);
  });
});

test("activate event deletes caches from a previous cacheVersion and claims clients", async () => {
  const fetchImpl = async () => ({ ok: true, clone: () => ({ ok: true }) });
  const { sandbox, listeners } = makeSandbox({
    config: { cacheVersion: "v2", precacheUrls: [], apiHostnames: [] },
    fetchImpl,
  });
  // 旧バージョンのキャッシュが残っている状態を模す
  sandbox.caches._stores.set("pwa-static-v1", new Map());
  sandbox.caches._stores.set("pwa-api-v1", new Map());
  sandbox.caches._stores.set("pwa-static-v2", new Map());
  let clientsClaimed = false;
  sandbox.clients = {
    claim: async () => {
      clientsClaimed = true;
    },
  };

  const waited = [];
  await listeners.activate({ waitUntil: (promise) => waited.push(promise) });
  await Promise.all(waited);

  assert.deepEqual([...sandbox.caches._stores.keys()], ["pwa-static-v2"]);
  assert.equal(clientsClaimed, true);
});

test("fetch event ignores non-GET requests", () => {
  const fetchImpl = async () => ({ ok: true, clone: () => ({ ok: true }) });
  const { listeners } = makeSandbox({
    config: { cacheVersion: "v1", precacheUrls: [], apiHostnames: [] },
    fetchImpl,
  });

  let responded = false;
  listeners.fetch({
    request: { method: "POST", url: "https://example.test/_admin/emails", mode: "same-origin" },
    respondWith: () => {
      responded = true;
    },
  });

  assert.equal(responded, false);
});

test("fetch event routes a configured API hostname through stale-while-revalidate into the API cache", async () => {
  const fetchImpl = async () => ({ ok: true, clone: () => ({ ok: true }) });
  const { sandbox, listeners } = makeSandbox({
    config: { cacheVersion: "v1", precacheUrls: [], apiHostnames: ["api.example.com"] },
    fetchImpl,
  });

  let respondedPromise;
  listeners.fetch({
    request: { method: "GET", url: "https://api.example.com/questions", mode: "cors" },
    respondWith: (promise) => {
      respondedPromise = promise;
    },
  });
  await respondedPromise;

  assert.ok(sandbox.caches._stores.get("pwa-api-v1").has("https://api.example.com/questions"));
});

test("fetch event routes a same-origin navigation through network-first into the static cache", async () => {
  const fetchImpl = async () => ({ ok: true, clone: () => ({ ok: true }) });
  const { sandbox, listeners } = makeSandbox({
    config: { cacheVersion: "v1", precacheUrls: [], apiHostnames: [] },
    fetchImpl,
  });

  let respondedPromise;
  listeners.fetch({
    request: { method: "GET", url: "https://example.test/education/", mode: "navigate" },
    respondWith: (promise) => {
      respondedPromise = promise;
    },
  });
  await respondedPromise;

  assert.ok(sandbox.caches._stores.get("pwa-static-v1").has("https://example.test/education/"));
});

test("fetch event ignores cross-origin requests to hosts not listed in apiHostnames", () => {
  const fetchImpl = async () => ({ ok: true, clone: () => ({ ok: true }) });
  const { listeners } = makeSandbox({
    config: { cacheVersion: "v1", precacheUrls: [], apiHostnames: ["api.example.com"] },
    fetchImpl,
  });

  let responded = false;
  listeners.fetch({
    request: { method: "GET", url: "https://unrelated-third-party.example/tracker.js", mode: "no-cors" },
    respondWith: () => {
      responded = true;
    },
  });

  assert.equal(responded, false);
});

test("network-first falls back to the cache when the network request fails", async () => {
  let networkCallCount = 0;
  const fetchImpl = async (input) => {
    networkCallCount += 1;
    if (typeof input === "object" && input.url === "https://example.test/") {
      if (networkCallCount === 1) return { ok: true, clone: () => ({ ok: true, cached: true }) };
      throw new Error("offline");
    }
    return { ok: true, clone: () => ({ ok: true }) };
  };
  const { sandbox, listeners } = makeSandbox({
    config: { cacheVersion: "v1", precacheUrls: [], apiHostnames: [] },
    fetchImpl,
  });

  // 1回目: ネットワーク成功、キャッシュへ保存される
  await new Promise((resolve) => {
    listeners.fetch({
      request: { method: "GET", url: "https://example.test/", mode: "navigate" },
      respondWith: resolve,
    });
  });

  // 2回目: ネットワーク失敗、1回目でキャッシュされた内容にフォールバックする
  const secondResponse = await new Promise((resolve) => {
    listeners.fetch({
      request: { method: "GET", url: "https://example.test/", mode: "navigate" },
      respondWith: resolve,
    });
  });

  assert.deepEqual(secondResponse, { ok: true, cached: true });
  assert.ok(sandbox.caches._stores.get("pwa-static-v1").has("https://example.test/"));
});
