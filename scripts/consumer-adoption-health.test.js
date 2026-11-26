"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { parseVersion, lagOf, extractVersions, checkRepo, findingsOf, render, latestTag } = require("./consumer-adoption-health");

const b64 = (s) => Buffer.from(s).toString("base64");
// URL（https://api.github.com/以降）から、{status, json}を返す偽のfetch。表に無いURLは、404
const fakeFetch = (routes) => async (url) => {
  const key = url.replace("https://api.github.com/", "");
  const hit = routes[key] ?? { status: 404 };
  return { ok: hit.status === undefined || hit.status < 400, status: hit.status ?? 200, json: async () => hit.json };
};

test("parseVersion・lagOf: マイナーバージョンの差を数える。メジャーが違えば、Infinity。読めなければ、null", () => {
  assert.deepStrictEqual(parseVersion("v2.184.3"), { major: 2, minor: 184, patch: 3 });
  assert.strictEqual(parseVersion("main"), null);
  assert.strictEqual(lagOf("v2.184.3", "v2.124.1"), 60);
  assert.strictEqual(lagOf("v2.184.3", "v2.184.0"), 0);
  assert.strictEqual(lagOf("v2.184.3", "v1.9.0"), Infinity);
  assert.strictEqual(lagOf("v2.184.3", "main"), null);
  assert.strictEqual(lagOf("v2.1.0", "v2.9.0"), 0); // 新しい側は、遅れなし
});

test("extractVersions: uses:の@タグと、self_refを集める。コメント行・ブランチ参照・重複は、除く", () => {
  const text = [
    "jobs:",
    "  ci:",
    "    uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@v2.124.1",
    "    with:",
    '      self_ref: v2.124.1',
    "      x: 1",
    "  cd:",
    "    uses: bamiyanapp/dev-standards/.github/actions/deploy-serverless@v2.100.0",
    "    # uses: bamiyanapp/dev-standards/.github/workflows/old.yml@v2.1.0",
    "  d:",
    "    uses: bamiyanapp/dev-standards/.github/workflows/x.yml@main",
  ].join("\n");
  assert.deepStrictEqual(extractVersions(text).sort(), ["v2.100.0", "v2.124.1"]);
});

test("latestTag: releases/latestを使い、読めなければ、タグ一覧の先頭を使う", async () => {
  assert.strictEqual(await latestTag({ fetchImpl: fakeFetch({ "repos/bamiyanapp/dev-standards/releases/latest": { json: { tag_name: "v2.185.0" } } }) }), "v2.185.0");
  assert.strictEqual(await latestTag({ fetchImpl: fakeFetch({ "repos/bamiyanapp/dev-standards/tags?per_page=1": { json: [{ name: "v2.184.3" }] } }) }), "v2.184.3");
  assert.strictEqual(await latestTag({ fetchImpl: fakeFetch({}) }), null);
});

const repoRoutes = (over = {}) => ({
  "repos/o/a/contents/renovate.json": { json: { content: b64('{"extends":["github>bamiyanapp/dev-standards"]}') } },
  "repos/o/a/contents/.github/workflows": { json: [{ name: "ci.yml", type: "file" }, { name: "README.md", type: "file" }] },
  "repos/o/a/contents/.github/workflows/ci.yml": { json: { content: b64("uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@v2.180.1\nself_ref: v2.180.1") } },
  ...over,
});

test("checkRepo: Renovateの設定と共有プリセット・参照の版・最新との差を返す", async () => {
  const r = await checkRepo("o/a", "v2.184.3", { fetchImpl: fakeFetch(repoRoutes()) });
  assert.strictEqual(r.unreadable, null);
  assert.deepStrictEqual(r.renovate, { found: "renovate.json", preset: true });
  assert.deepStrictEqual(r.tags, ["v2.180.1"]);
  assert.strictEqual(r.lag, 4);
});

test("checkRepo: Renovateの設定が無ければ、found: null。共有プリセットを継承していなければ、preset: false", async () => {
  const none = await checkRepo("o/a", "v2.184.3", { fetchImpl: fakeFetch(repoRoutes({ "repos/o/a/contents/renovate.json": { status: 404 } })) });
  assert.strictEqual(none.renovate.found, null);
  const own = await checkRepo("o/a", "v2.184.3", { fetchImpl: fakeFetch(repoRoutes({ "repos/o/a/contents/renovate.json": { json: { content: b64('{"extends":["config:recommended"]}') } } })) });
  assert.deepStrictEqual(own.renovate, { found: "renovate.json", preset: false });
  const broken = await checkRepo("o/a", "v2.184.3", { fetchImpl: fakeFetch(repoRoutes({ "repos/o/a/contents/renovate.json": { json: { content: b64("{not json") } } })) });
  assert.strictEqual(broken.renovate.preset, null); // 読めなかった（不明）
});

test("checkRepo: 版が混在していれば、最も古い版（取り残されている側）で、遅れを測る", async () => {
  const routes = repoRoutes({
    "repos/o/a/contents/.github/workflows": { json: [{ name: "ci.yml", type: "file" }, { name: "cd.yml", type: "file" }] },
    "repos/o/a/contents/.github/workflows/cd.yml": { json: { content: b64("uses: bamiyanapp/dev-standards/.github/actions/deploy-serverless@v2.114.1") } },
  });
  const r = await checkRepo("o/a", "v2.184.3", { fetchImpl: fakeFetch(routes) });
  assert.strictEqual(r.oldest, "v2.114.1");
  assert.strictEqual(r.lag, 70);
});

test("checkRepo: 読めないリポジトリ（403等）・例外は、失敗させず、読めなかった旨を返す", async () => {
  const forbidden = await checkRepo("o/a", "v2.184.3", { fetchImpl: fakeFetch({ "repos/o/a/contents/renovate.json": { status: 403 } }) });
  assert.match(forbidden.unreadable, /403/);
  const boom = await checkRepo("o/a", "v2.184.3", {
    fetchImpl: async () => {
      throw new Error("network");
    },
  });
  assert.match(boom.unreadable, /network/);
});

test("checkRepo: workflowが無いリポジトリは、参照なしとして扱う", async () => {
  const r = await checkRepo("o/a", "v2.184.3", { fetchImpl: fakeFetch({ "repos/o/a/contents/renovate.json": { json: { content: b64("{}") } } }) });
  assert.deepStrictEqual(r.tags, []);
  assert.strictEqual(r.lag, null);
});

test("findingsOf: Renovate設定なし・しきい値以上の遅れを、載せる。読めなかったものは、載せない", () => {
  const ok = { unreadable: null, renovate: { found: "renovate.json" }, lag: 29 };
  assert.deepStrictEqual(findingsOf(ok, 30), []);
  assert.deepStrictEqual(findingsOf({ ...ok, lag: 30 }, 30), ["30版遅れ"]);
  assert.deepStrictEqual(findingsOf({ ...ok, lag: Infinity }, 30), ["メジャーバージョンが古い"]);
  assert.deepStrictEqual(findingsOf({ ...ok, renovate: { found: null } }, 30), ["Renovateの設定が無い"]);
  assert.deepStrictEqual(findingsOf({ unreadable: "HTTP 404" }, 30), []);
});

test("render: 表と、取り残されているリポジトリの一覧を出す。読めなかったものは、黙って飛ばさず、明記する", () => {
  const results = [
    { repo: "o/new", unreadable: null, renovate: { found: "renovate.json", preset: true }, tags: ["v2.184.3"], oldest: "v2.184.3", lag: 0 },
    { repo: "o/old", unreadable: null, renovate: { found: null, preset: null }, tags: ["v2.4.0"], oldest: "v2.4.0", lag: 180 },
    { repo: "o/private", unreadable: "HTTP 404（renovate.json以外）" },
  ];
  const { markdown, hasFindings } = render(results, "v2.184.3", 30);
  assert.strictEqual(hasFindings, true);
  assert.match(markdown, /\| o\/new \| renovate\.json \| ✅ \| v2\.184\.3 \| 0版 \| ✅ \|/);
  assert.match(markdown, /\| o\/old \| \*\*なし\*\* \| — \| v2\.4\.0 \| 180版 \| ❌ Renovateの設定が無い・180版遅れ \|/);
  assert.match(markdown, /o\/private.*読めなかった/);
  assert.match(markdown, /- o\/old: Renovateの設定が無い・180版遅れ/);
  assert.match(markdown, /黙って飛ばさず/);
});

test("render: 取り残されているものが無ければ、hasFindingsは、false（Issueを閉じる）", () => {
  const { hasFindings, markdown } = render([{ repo: "o/new", unreadable: null, renovate: { found: "renovate.json", preset: true }, tags: ["v2.184.3"], oldest: "v2.184.3", lag: 0 }], "v2.184.3", 30);
  assert.strictEqual(hasFindings, false);
  assert.doesNotMatch(markdown, /取り残されている可能性/);
});
