"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseVersion,
  compareVersions,
  latestVersionForMajor,
  findUnpatchedVulnerabilities,
  scanRuntimeVersions,
} = require("./runtime-version-scan.js");

const SECURITY_WG_VULN_DB_URL = "https://raw.githubusercontent.com/nodejs/security-wg/main/vuln/core/index.json";

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

test("findUnpatchedVulnerabilities: vulnerable範囲に該当しpatched範囲に該当しない場合のみ対象とする", () => {
  const vulnDatabase = {
    1: { cve: ["CVE-2026-111497"], vulnerable: "<22.23.4", patched: ">=22.23.4", severity: "high", overview: "Brotli OOB write" },
  };
  assert.deepEqual(findUnpatchedVulnerabilities("v22.23.2", vulnDatabase), [
    { cve: ["CVE-2026-111497"], severity: "high", overview: "Brotli OOB write" },
  ]);
});

test("findUnpatchedVulnerabilities: patched範囲に該当する（修正済み）バージョンは対象外とする", () => {
  const vulnDatabase = { 1: { cve: ["CVE-2026-111497"], vulnerable: "<22.23.4", patched: ">=22.23.4" } };
  assert.deepEqual(findUnpatchedVulnerabilities("v22.23.4", vulnDatabase), []);
});

test("findUnpatchedVulnerabilities: vulnerable範囲に該当しないバージョンは対象外とする", () => {
  const vulnDatabase = { 1: { cve: ["CVE-2026-111497"], vulnerable: "<22.23.4", patched: ">=22.23.4" } };
  assert.deepEqual(findUnpatchedVulnerabilities("v24.0.0", vulnDatabase), []);
});

test("findUnpatchedVulnerabilities: OR条件（||）を含むvulnerable範囲も解釈する", () => {
  const vulnDatabase = { 1: { cve: ["CVE-0000-00000"], vulnerable: "4.x || 22.x", patched: "^22.23.4" } };
  assert.equal(findUnpatchedVulnerabilities("v22.1.0", vulnDatabase).length, 1);
  assert.equal(findUnpatchedVulnerabilities("v25.0.0", vulnDatabase).length, 0);
});

test("scanRuntimeVersions: 最新パッチより古いエンドポイントのみを検知結果に含める", async () => {
  const fetchJsonImpl = async (url) => {
    if (url === "https://nodejs.org/dist/index.json") {
      return [{ version: "v26.12.1" }, { version: "v24.22.1" }, { version: "v22.23.4" }];
    }
    if (url === SECURITY_WG_VULN_DB_URL) return {};
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
    {
      name: "canary",
      url: "https://canary.example.com/get-version",
      currentVersion: "v22.22.0",
      latestVersion: "v22.23.4",
      major: 22,
      vulnerabilities: [],
    },
  ]);
});

test("scanRuntimeVersions: 未パッチの既知脆弱性があるエンドポイントにvulnerabilitiesを付与する", async () => {
  const fetchJsonImpl = async (url) => {
    if (url === "https://nodejs.org/dist/index.json") return [{ version: "v22.23.4" }];
    if (url === SECURITY_WG_VULN_DB_URL) {
      return { 1: { cve: ["CVE-2026-111497"], vulnerable: "<22.23.4", patched: ">=22.23.4", severity: "high" } };
    }
    if (url === "https://canary.example.com/get-version") return { nodeVersion: "v22.23.2" };
    throw new Error(`unexpected url: ${url}`);
  };

  const endpoints = [{ name: "canary", url: "https://canary.example.com/get-version" }];
  const result = await scanRuntimeVersions(endpoints, { fetchJsonImpl });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].vulnerabilities, [{ cve: ["CVE-2026-111497"], severity: "high", overview: null }]);
});

test("scanRuntimeVersions: nodeVersionを取得できない場合はerrorとして結果に含める", async () => {
  const fetchJsonImpl = async (url) => {
    if (url === "https://nodejs.org/dist/index.json") return [{ version: "v22.23.4" }];
    if (url === SECURITY_WG_VULN_DB_URL) return {};
    if (url === "https://broken.example.com/get-version") return { version: "no-nodeVersion-field" };
    throw new Error(`unexpected url: ${url}`);
  };

  const endpoints = [{ name: "broken", url: "https://broken.example.com/get-version" }];
  const result = await scanRuntimeVersions(endpoints, { fetchJsonImpl });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "broken");
  assert.ok(result[0].error);
});

test("scanRuntimeVersions: 1エンドポイントがHTTPエラー等で例外を投げても、他のエンドポイントの結果に影響しない", async () => {
  const fetchJsonImpl = async (url) => {
    if (url === "https://nodejs.org/dist/index.json") return [{ version: "v22.23.4" }];
    if (url === SECURITY_WG_VULN_DB_URL) return {};
    if (url === "https://canary.example.com/get-version") throw new Error("HTTP 503 for https://canary.example.com/get-version");
    if (url === "https://stable.example.com/get-version") return { nodeVersion: "v22.22.0" };
    throw new Error(`unexpected url: ${url}`);
  };

  const endpoints = [
    { name: "canary", url: "https://canary.example.com/get-version" },
    { name: "stable", url: "https://stable.example.com/get-version" },
  ];
  const result = await scanRuntimeVersions(endpoints, { fetchJsonImpl });
  assert.equal(result.length, 2);
  assert.equal(result[0].name, "canary");
  assert.ok(result[0].error.includes("HTTP 503"));
  assert.deepEqual(result[1], {
    name: "stable",
    url: "https://stable.example.com/get-version",
    currentVersion: "v22.22.0",
    latestVersion: "v22.23.4",
    major: 22,
    vulnerabilities: [],
  });
});

test("scanRuntimeVersions: 同一メジャー系列が公式リリース一覧に無い場合（EOL等）はスキップする", async () => {
  const fetchJsonImpl = async (url) => {
    if (url === "https://nodejs.org/dist/index.json") return [{ version: "v22.23.4" }];
    if (url === SECURITY_WG_VULN_DB_URL) return {};
    if (url === "https://eol.example.com/get-version") return { nodeVersion: "v16.0.0" };
    throw new Error(`unexpected url: ${url}`);
  };

  const endpoints = [{ name: "eol", url: "https://eol.example.com/get-version" }];
  const result = await scanRuntimeVersions(endpoints, { fetchJsonImpl });
  assert.deepEqual(result, []);
});
