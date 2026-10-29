"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFetchJson, NPM_REGISTRY_BASE } = require("./http-fetch.js");

test("NPM_REGISTRY_BASE: npm registryのベースURLを返す", () => {
  assert.equal(NPM_REGISTRY_BASE, "https://registry.npmjs.org");
});

test("createFetchJson: 2xxレスポンスをjsonとして返す", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: "value" }) });
  try {
    const fetchJson = createFetchJson();
    assert.deepEqual(await fetchJson("https://example.com"), { ok: "value" });
  } finally {
    global.fetch = originalFetch;
  }
});

test("createFetchJson: 既定では!okレスポンスを既定の文言で例外化する", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, statusText: "Internal Server Error" });
  try {
    const fetchJson = createFetchJson();
    await assert.rejects(
      () => fetchJson("https://example.com/x"),
      (err) => err.message === "request to https://example.com/x failed: 500 Internal Server Error",
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("createFetchJson: formatErrorを指定すると例外メッセージをカスタマイズできる", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404, statusText: "Not Found" });
  try {
    const fetchJson = createFetchJson({
      formatError: (url, response) => `custom: ${url} ${response.status}`,
    });
    await assert.rejects(
      () => fetchJson("https://example.com/x"),
      (err) => err.message === "custom: https://example.com/x 404",
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("createFetchJson: notFoundReturnsNull指定時は404をnullとして返す", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404, statusText: "Not Found" });
  try {
    const fetchJson = createFetchJson({ notFoundReturnsNull: true });
    assert.equal(await fetchJson("https://example.com/x"), null);
  } finally {
    global.fetch = originalFetch;
  }
});

test("createFetchJson: fetchへoptionsをそのまま渡す", async () => {
  const originalFetch = global.fetch;
  let receivedOptions;
  global.fetch = async (_url, options) => {
    receivedOptions = options;
    return { ok: true, status: 200, json: async () => ({}) };
  };
  try {
    const fetchJson = createFetchJson();
    await fetchJson("https://example.com", { method: "POST" });
    assert.deepEqual(receivedOptions, { method: "POST" });
  } finally {
    global.fetch = originalFetch;
  }
});
