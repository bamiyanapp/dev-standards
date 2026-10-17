"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detectDeprecation, fetchDeprecationInfo } = require("./dependency-deprecation-info.js");

test("detectDeprecation: deprecatedフィールドがある場合はメッセージを返す", () => {
  const packageJson = { versions: { "2.0.0": { deprecated: "このパッケージはサポート終了です" } } };
  assert.deepEqual(detectDeprecation(packageJson, "2.0.0"), { deprecated: "このパッケージはサポート終了です" });
});

test("detectDeprecation: deprecatedフィールドが無い場合はnullを返す", () => {
  const packageJson = { versions: { "2.0.0": {} } };
  assert.equal(detectDeprecation(packageJson, "2.0.0"), null);
});

test("detectDeprecation: バージョン情報自体が無い場合はnullを返す（判定不能）", () => {
  const packageJson = { versions: {} };
  assert.equal(detectDeprecation(packageJson, "2.0.0"), null);
});

test("fetchDeprecationInfo: oldVersion・newVersionのいずれかがdeprecatedのパッケージのみを返す", async () => {
  const changes = [
    { name: "aws-sdk", oldVersion: "2.1691.0", newVersion: "2.1692.0" },
    { name: "lodash", oldVersion: "4.17.20", newVersion: "4.17.21" },
  ];
  const fixtures = {
    "aws-sdk": {
      versions: {
        "2.1691.0": { deprecated: "aws-sdk v2 is in maintenance mode" },
        "2.1692.0": { deprecated: "aws-sdk v2 is in maintenance mode" },
      },
    },
    lodash: { versions: { "4.17.20": {}, "4.17.21": {} } },
  };
  const fetchJsonImpl = async (url) => fixtures[url.split("/").pop()];
  const result = await fetchDeprecationInfo(changes, { fetchJsonImpl });
  assert.deepEqual(result, [
    {
      name: "aws-sdk",
      oldVersion: "2.1691.0",
      newVersion: "2.1692.0",
      oldDeprecated: "aws-sdk v2 is in maintenance mode",
      newDeprecated: "aws-sdk v2 is in maintenance mode",
    },
  ]);
});

test("fetchDeprecationInfo: newVersionのみがdeprecatedの場合はnewDeprecatedのみを含む", async () => {
  const changes = [{ name: "foo", oldVersion: "1.0.0", newVersion: "2.0.0" }];
  const fixtures = {
    foo: { versions: { "1.0.0": {}, "2.0.0": { deprecated: "use bar instead" } } },
  };
  const fetchJsonImpl = async (url) => fixtures[url.split("/").pop()];
  const result = await fetchDeprecationInfo(changes, { fetchJsonImpl });
  assert.deepEqual(result, [{ name: "foo", oldVersion: "1.0.0", newVersion: "2.0.0", newDeprecated: "use bar instead" }]);
});

test("fetchDeprecationInfo: oldVersion/newVersionのいずれも無い変更は対象外とする", async () => {
  const changes = [{ name: "foo", oldVersion: null, newVersion: null }];
  let callCount = 0;
  const fetchJsonImpl = async () => {
    callCount++;
    return {};
  };
  const result = await fetchDeprecationInfo(changes, { fetchJsonImpl });
  assert.deepEqual(result, []);
  assert.equal(callCount, 0);
});

test("fetchDeprecationInfo: 変更が0件ならfetchを呼ばず空配列を返す", async () => {
  let callCount = 0;
  const fetchJsonImpl = async () => {
    callCount++;
    return {};
  };
  assert.deepEqual(await fetchDeprecationInfo([], { fetchJsonImpl }), []);
  assert.equal(callCount, 0);
});
