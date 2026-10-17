"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { scanForDeprecated } = require("./dependency-deprecation-scan.js");

function buildLock({ rootDependencies = {}, packages = {} } = {}) {
  return {
    packages: {
      "": { dependencies: rootDependencies },
      ...packages,
    },
  };
}

test("scanForDeprecated: 直接依存のdeprecatedパッケージのみを返す（既定directOnly=true）", async () => {
  const lockJson = buildLock({
    rootDependencies: { "aws-sdk": "^2.1691.0" },
    packages: {
      "node_modules/aws-sdk": { version: "2.1691.0" },
      "node_modules/transitive-only": { version: "1.0.0" },
    },
  });
  const fixtures = {
    "aws-sdk": { versions: { "2.1691.0": { deprecated: "maintenance mode" } } },
  };
  const fetchJsonImpl = async (url) => fixtures[url.split("/").pop()];
  const result = await scanForDeprecated(lockJson, { fetchJsonImpl });
  assert.deepEqual(result, [{ name: "aws-sdk", version: "2.1691.0", deprecated: "maintenance mode" }]);
});

test("scanForDeprecated: directOnly=falseの場合は間接依存も対象にする", async () => {
  const lockJson = buildLock({
    rootDependencies: {},
    packages: { "node_modules/transitive-only": { version: "1.0.0" } },
  });
  const fixtures = {
    "transitive-only": { versions: { "1.0.0": { deprecated: "use foo instead" } } },
  };
  const fetchJsonImpl = async (url) => fixtures[url.split("/").pop()];
  const result = await scanForDeprecated(lockJson, { directOnly: false, fetchJsonImpl });
  assert.deepEqual(result, [{ name: "transitive-only", version: "1.0.0", deprecated: "use foo instead" }]);
});

test("scanForDeprecated: deprecatedでないパッケージは結果に含めない", async () => {
  const lockJson = buildLock({
    rootDependencies: { lodash: "^4.17.21" },
    packages: { "node_modules/lodash": { version: "4.17.21" } },
  });
  const fetchJsonImpl = async () => ({ versions: { "4.17.21": {} } });
  const result = await scanForDeprecated(lockJson, { fetchJsonImpl });
  assert.deepEqual(result, []);
});

test("scanForDeprecated: npm registryへの問い合わせが失敗したパッケージは無視する（安全側）", async () => {
  const lockJson = buildLock({
    rootDependencies: { foo: "^1.0.0" },
    packages: { "node_modules/foo": { version: "1.0.0" } },
  });
  const fetchJsonImpl = async () => {
    throw new Error("network error");
  };
  const result = await scanForDeprecated(lockJson, { fetchJsonImpl });
  assert.deepEqual(result, []);
});

test("scanForDeprecated: 同名パッケージが複数バージョン存在する場合はバージョンごとに1件とする", async () => {
  const lockJson = buildLock({
    rootDependencies: { foo: "^2.0.0" },
    packages: {
      "node_modules/foo": { version: "2.0.0" },
      "node_modules/bar/node_modules/foo": { version: "1.0.0" },
    },
  });
  const fixtures = {
    foo: { versions: { "2.0.0": { deprecated: "v2 is deprecated" }, "1.0.0": { deprecated: "v1 is deprecated" } } },
  };
  const fetchJsonImpl = async (url) => fixtures[url.split("/").pop()];
  const result = await scanForDeprecated(lockJson, { fetchJsonImpl });
  assert.equal(result.length, 2);
  assert.ok(result.some((r) => r.version === "2.0.0" && r.deprecated === "v2 is deprecated"));
  assert.ok(result.some((r) => r.version === "1.0.0" && r.deprecated === "v1 is deprecated"));
});

test("scanForDeprecated: 対象パッケージが0件ならfetchを呼ばず空配列を返す", async () => {
  const lockJson = buildLock();
  let callCount = 0;
  const fetchJsonImpl = async () => {
    callCount++;
    return {};
  };
  const result = await scanForDeprecated(lockJson, { fetchJsonImpl });
  assert.deepEqual(result, []);
  assert.equal(callCount, 0);
});
