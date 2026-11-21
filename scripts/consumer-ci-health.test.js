"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { sinceDate, checkRepo, render } = require("./consumer-ci-health");

const now = new Date("2026-11-21T00:00:00Z");
const res = (ok, status, json) => async () => ({ ok, status, json: async () => json });

test("sinceDate: 7日前の日付を返す", () => {
  assert.strictEqual(sinceDate(now), "2026-11-14");
});

test("checkRepo: startup_failureのrunを集める", async () => {
  const r = await checkRepo("o/a", {
    now,
    fetchImpl: res(true, 200, {
      workflow_runs: [{ name: "CI", html_url: "https://x/1", created_at: "t" }],
    }),
  });
  assert.strictEqual(r.runs.length, 1);
  assert.strictEqual(r.unreadable, null);
});

test("checkRepo: 読めない場合は失敗させず理由を返す", async () => {
  const r = await checkRepo("o/a", { now, fetchImpl: res(false, 404, {}) });
  assert.strictEqual(r.unreadable, "HTTP 404");
  const e = await checkRepo("o/a", {
    now,
    fetchImpl: async () => {
      throw new Error("boom");
    },
  });
  assert.strictEqual(e.unreadable, "boom");
});

test("render: 検知あり・読めなかった・なしを区別する", () => {
  const out = render([
    { repo: "o/a", unreadable: null, runs: [{ name: "CI", url: "https://x/1", createdAt: "t" }] },
    { repo: "o/b", unreadable: "HTTP 404", runs: [] },
    { repo: "o/c", unreadable: null, runs: [] },
  ]);
  assert.strictEqual(out.hasFindings, true);
  assert.match(out.markdown, /o\/a \| ❌ 1件/);
  assert.match(out.markdown, /o\/b \| ⚠️ 読めなかった（HTTP 404）/);
  assert.match(out.markdown, /o\/c \| ✅ なし/);
  assert.match(out.markdown, /https:\/\/x\/1/);
});

test("render: 全件なしならhasFindingsはfalse", () => {
  assert.strictEqual(render([{ repo: "o/c", unreadable: null, runs: [] }]).hasFindings, false);
});
