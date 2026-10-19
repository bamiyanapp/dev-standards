"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { extractAllPackages, scanLockFileForVulnerabilities } = require("./dependency-full-scan.js");

test("extractAllPackages: 直接・間接の全パッケージをname/version付きで抽出する", () => {
  const lockJson = {
    packages: {
      "": { dependencies: { foo: "^1.0.0" } },
      "node_modules/foo": { version: "1.2.3" },
      "node_modules/bar": { version: "2.0.0" },
    },
  };
  assert.deepEqual(extractAllPackages(lockJson), [
    { name: "bar", version: "2.0.0", direct: false },
    { name: "foo", version: "1.2.3", direct: true },
  ]);
});

test("extractAllPackages: ネストしたnode_modulesで同名異バージョンが共存する場合は両方残す", () => {
  const lockJson = {
    packages: {
      "": { dependencies: {} },
      "node_modules/foo": { version: "1.0.0" },
      "node_modules/parent/node_modules/foo": { version: "2.0.0" },
    },
  };
  assert.deepEqual(extractAllPackages(lockJson), [
    { name: "foo", version: "1.0.0", direct: false },
    { name: "foo", version: "2.0.0", direct: false },
  ]);
});

test("extractAllPackages: 同一name+versionの重複エントリは1件にまとめる", () => {
  const lockJson = {
    packages: {
      "": { dependencies: {} },
      "node_modules/foo": { version: "1.0.0" },
      "node_modules/parent/node_modules/foo": { version: "1.0.0" },
    },
  };
  assert.deepEqual(extractAllPackages(lockJson), [{ name: "foo", version: "1.0.0", direct: false }]);
});

test("extractAllPackages: versionを持たないエントリ（linkされたワークスペース自身等）は除外する", () => {
  const lockJson = {
    packages: {
      "": { dependencies: {} },
      "frontend": { link: true },
      "node_modules/foo": { version: "1.0.0" },
    },
  };
  assert.deepEqual(extractAllPackages(lockJson), [{ name: "foo", version: "1.0.0", direct: false }]);
});

test("scanLockFileForVulnerabilities: 脆弱性が1件も無いパッケージは結果から除外する", async () => {
  const lockJson = {
    packages: {
      "": { dependencies: { foo: "^1.0.0" } },
      "node_modules/foo": { version: "1.0.0" },
      "node_modules/bar": { version: "2.0.0" },
    },
  };
  const fetchJsonImpl = async (url) => {
    if (url.endsWith("/querybatch")) {
      return { results: [{ vulns: [] }, { vulns: [] }] };
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  const result = await scanLockFileForVulnerabilities(lockJson, { fetchJsonImpl });
  assert.deepEqual(result, []);
});

test("scanLockFileForVulnerabilities: 脆弱性が見つかったパッケージのみdirectフラグ付きで返す", async () => {
  const lockJson = {
    packages: {
      "": { dependencies: { foo: "^1.0.0" } },
      "node_modules/foo": { version: "1.0.0" },
      "node_modules/bar": { version: "2.0.0" },
    },
  };
  const fetchJsonImpl = async (url) => {
    // extractAllPackagesはname昇順でソートするため、[bar, foo]の順でOSVへ照会される
    if (url.endsWith("/querybatch")) {
      return { results: [{ vulns: [] }, { vulns: [{ id: "GHSA-aaaa" }] }] };
    }
    if (url.endsWith("/vulns/GHSA-aaaa")) {
      return {
        id: "GHSA-aaaa",
        summary: "example",
        aliases: ["CVE-2024-00001"],
        database_specific: { severity: "CRITICAL" },
        severity: [],
      };
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  const result = await scanLockFileForVulnerabilities(lockJson, { fetchJsonImpl });
  assert.deepEqual(result, [
    {
      name: "foo",
      version: "1.0.0",
      direct: true,
      vulnerabilities: [
        {
          id: "GHSA-aaaa",
          cveIds: ["CVE-2024-00001"],
          summary: "example",
          severityRating: "CRITICAL",
          cvssVectors: [],
        },
      ],
    },
  ]);
});

test("scanLockFileForVulnerabilities: パッケージが1件も無い場合はネットワークアクセスせず空配列を返す", async () => {
  const lockJson = { packages: { "": { dependencies: {} } } };
  let called = false;
  const fetchJsonImpl = async () => {
    called = true;
    return { results: [] };
  };

  const result = await scanLockFileForVulnerabilities(lockJson, { fetchJsonImpl });
  assert.deepEqual(result, []);
  assert.equal(called, false);
});
