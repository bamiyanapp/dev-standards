"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detectMaintainerChange, fetchMaintainerAnomalies } = require("./dependency-maintainer-info.js");

test("detectMaintainerChange: 公開者が異なる場合は異常として返す", () => {
  const packageJson = {
    versions: {
      "1.0.0": { _npmUser: { name: "alice" } },
      "1.1.0": { _npmUser: { name: "bob" } },
    },
  };
  assert.deepEqual(detectMaintainerChange(packageJson, "1.0.0", "1.1.0"), { oldPublisher: "alice", newPublisher: "bob" });
});

test("detectMaintainerChange: 公開者が同じ場合はnullを返す", () => {
  const packageJson = {
    versions: {
      "1.0.0": { _npmUser: { name: "alice" } },
      "1.1.0": { _npmUser: { name: "alice" } },
    },
  };
  assert.equal(detectMaintainerChange(packageJson, "1.0.0", "1.1.0"), null);
});

test("detectMaintainerChange: いずれかのバージョンの公開者情報が無い場合はnullを返す（判定不能）", () => {
  const packageJson = { versions: { "1.1.0": { _npmUser: { name: "bob" } } } };
  assert.equal(detectMaintainerChange(packageJson, "1.0.0", "1.1.0"), null);
});

test("fetchMaintainerAnomalies: 公開者が変化したパッケージのみを返す", async () => {
  const changes = [
    { name: "foo", oldVersion: "1.0.0", newVersion: "1.1.0", updateType: "minor", direct: true },
    { name: "bar", oldVersion: "2.0.0", newVersion: "2.0.1", updateType: "patch", direct: false },
  ];
  const fixtures = {
    foo: { versions: { "1.0.0": { _npmUser: { name: "alice" } }, "1.1.0": { _npmUser: { name: "mallory" } } } },
    bar: { versions: { "2.0.0": { _npmUser: { name: "carol" } }, "2.0.1": { _npmUser: { name: "carol" } } } },
  };
  const fetchJsonImpl = async (url) => {
    const name = url.split("/").pop();
    return fixtures[name];
  };
  const result = await fetchMaintainerAnomalies(changes, { fetchJsonImpl });
  assert.deepEqual(result, [{ name: "foo", oldVersion: "1.0.0", newVersion: "1.1.0", oldPublisher: "alice", newPublisher: "mallory" }]);
});

test("fetchMaintainerAnomalies: oldVersion/newVersionが無い変更（新規追加等）は対象外とする", async () => {
  const changes = [{ name: "foo", oldVersion: null, newVersion: "1.0.0", updateType: "other", direct: true }];
  let callCount = 0;
  const fetchJsonImpl = async () => {
    callCount++;
    return {};
  };
  const result = await fetchMaintainerAnomalies(changes, { fetchJsonImpl });
  assert.deepEqual(result, []);
  assert.equal(callCount, 0);
});

test("fetchMaintainerAnomalies: 変更が0件ならfetchを呼ばず空配列を返す", async () => {
  let callCount = 0;
  const fetchJsonImpl = async () => {
    callCount++;
    return {};
  };
  assert.deepEqual(await fetchMaintainerAnomalies([], { fetchJsonImpl }), []);
  assert.equal(callCount, 0);
});
