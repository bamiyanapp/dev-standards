"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseVersion, compareVersions, latestVersionForMajor, scanRuntimeVersions } = require("./runtime-version-scan.js");

test("parseVersion: 先頭のvの有無どちらも許容する", () => {
  assert.deepEqual(parseVersion("v22.23.4"), { major: 22, minor: 23, patch: 4, raw: "v22.23.4" });
  assert.deepEqual(parseVersion("22.23.4"), { major: 22, minor: 23, patch: 4, raw: "22.23.4" });
});

test("parseVersion: 不正な形式はnullを返す", () => {
  assert.equal(parseVersion("not-a-version"), null);
  assert.equal(parseVersion(undefined), null);
  assert.equal(parseVersion(""), null);
});

test("compareVersions: major/minor/patchの順に比較する", () => {
  assert.ok(compareVersions(parseVersion("v22.23.4"), parseVersion("v22.23.5")) < 0);
  assert.ok(compareVersions(parseVersion("v22.23.4"), parseVersion("v22.22.9")) > 0);
  assert.ok(compareVersions(parseVersion("v22.23.4"), parseVersion("v24.0.0")) < 0);
  assert.equal(compareVersions(parseVersion("v22.23.4"), parseVersion("v22.23.4")), 0);
});

test("latestVersionForMajor: 降順ソート済みリリース一覧から同一メジャー系列の最新を返す", () => {
  const releases = [{ version: "v26.12.1" }, { version: "v24.22.1" }, { version: "v22.23.4" }, { version: "v22.22.0" }];
  assert.deepEqual(latestVersionForMajor(releases, 22), { major: 22, minor: 23, patch: 4, raw: "v22.23.4" });
});

test("latestVersionForMajor: 該当メジャー系列が無い場合はnullを返す", () => {
  assert.equal(latestVersionForMajor([{ version: "v26.12.1" }], 18), null);
});

test("scanRuntimeVersions: 最新パッチより古いエンドポイントのみを検知結果に含める", async () => {
  const fetchJsonImpl = async (url) => {
    if (url === "https://nodejs.org/dist/index.json") {
      return [{ version: "v26.12.1" }, { version: "v24.22.1" }, { version: "v22.23.4" }];
    }
    if (url === "https://canary.example.com/get-version") return { nodeVersion: "v22.22.0" };
    if (url === "https://stable.example.com/get-version") return { nodeVersion: "v22.23.4" };
    throw new Error(`unexpected url: ${url}`);
  };

  const endpoints = [
    { name: "canary", url: "https://canary.example.com/get-version" },
    { name: "stable", url: "https://stable.example.com/get-version" },
  ];
  const result = await scanRuntimeVersions(endpoints, { fetchJsonImpl });
  assert.deepEqual(result, [
    { name: "canary", url: "https://canary.example.com/get-version", currentVersion: "v22.22.0", latestVersion: "v22.23.4", major: 22 },
  ]);
});

test("scanRuntimeVersions: nodeVersionを取得できない場合はerrorとして結果に含める", async () => {
  const fetchJsonImpl = async (url) => {
    if (url === "https://nodejs.org/dist/index.json") return [{ version: "v22.23.4" }];
    if (url === "https://broken.example.com/get-version") return { version: "no-nodeVersion-field" };
    throw new Error(`unexpected url: ${url}`);
  };

  const endpoints = [{ name: "broken", url: "https://broken.example.com/get-version" }];
  const result = await scanRuntimeVersions(endpoints, { fetchJsonImpl });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "broken");
  assert.ok(result[0].error);
});

test("scanRuntimeVersions: 同一メジャー系列が公式リリース一覧に無い場合（EOL等）はスキップする", async () => {
  const fetchJsonImpl = async (url) => {
    if (url === "https://nodejs.org/dist/index.json") return [{ version: "v22.23.4" }];
    if (url === "https://eol.example.com/get-version") return { nodeVersion: "v16.0.0" };
    throw new Error(`unexpected url: ${url}`);
  };

  const endpoints = [{ name: "eol", url: "https://eol.example.com/get-version" }];
  const result = await scanRuntimeVersions(endpoints, { fetchJsonImpl });
  assert.deepEqual(result, []);
});
