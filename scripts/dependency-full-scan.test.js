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

test("scanLockFileForVulnerabilities: issue #1111。パッケージ数がchunkSizeを超える場合、querybatchを複数回に分けて呼ぶ", async () => {
  const packages = { "": { dependencies: {} } };
  for (let i = 0; i < 5; i++) {
    packages[`node_modules/pkg${i}`] = { version: "1.0.0" };
  }
  const lockJson = { packages };

  const querybatchCalls = [];
  const fetchJsonImpl = async (url, options) => {
    if (url.endsWith("/querybatch")) {
      const body = JSON.parse(options.body);
      querybatchCalls.push(body.queries.length);
      return { results: body.queries.map(() => ({ vulns: [] })) };
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  const result = await scanLockFileForVulnerabilities(lockJson, { fetchJsonImpl, chunkSize: 2 });
  assert.deepEqual(result, []);
  // 5件を chunkSize=2 で分割すると 2, 2, 1 の3回に分かれる
  assert.deepEqual(querybatchCalls, [2, 2, 1]);
});

test("scanLockFileForVulnerabilities: チャンク分割後も脆弱性検知結果を正しくマージする", async () => {
  const packages = { "": { dependencies: {} } };
  for (let i = 0; i < 3; i++) {
    packages[`node_modules/pkg${i}`] = { version: "1.0.0" };
  }
  const lockJson = { packages };

  const fetchJsonImpl = async (url, options) => {
    if (url.endsWith("/querybatch")) {
      const body = JSON.parse(options.body);
      // pkg1（2回目のチャンク）にのみ脆弱性があるものとする
      return { results: body.queries.map((q) => (q.package.name === "pkg1" ? { vulns: [{ id: "GHSA-bbbb" }] } : { vulns: [] })) };
    }
    if (url.endsWith("/vulns/GHSA-bbbb")) {
      return { id: "GHSA-bbbb", summary: "example", aliases: [], database_specific: {}, severity: [] };
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  const result = await scanLockFileForVulnerabilities(lockJson, { fetchJsonImpl, chunkSize: 2 });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "pkg1");
});
