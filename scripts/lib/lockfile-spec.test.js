"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { expandLockfileSpec, mergeScanResults } = require("./lockfile-spec.js");

test("単一パスはそのまま返す（後方互換）", () => {
  assert.deepEqual(expandLockfileSpec("package-lock.json"), ["package-lock.json"]);
});

test("改行区切り・空行・重複を整理する", () => {
  assert.deepEqual(expandLockfileSpec("b/package-lock.json\n\n a/package-lock.json \nb/package-lock.json\n"), [
    "a/package-lock.json",
    "b/package-lock.json",
  ]);
});

test("globは展開し、node_modules配下は除外する", () => {
  const globSync = () => ["x/package-lock.json", "node_modules/y/package-lock.json", "z/package-lock.json"];
  assert.deepEqual(expandLockfileSpec("**/package-lock.json", { globSync }), ["x/package-lock.json", "z/package-lock.json"]);
});

test("空指定は空配列", () => {
  assert.deepEqual(expandLockfileSpec(""), []);
  assert.deepEqual(expandLockfileSpec(undefined), []);
});

test("mergeScanResults: 同一name@versionを統合し、lockfilesとdirectを合成する", () => {
  const merged = mergeScanResults([
    { lockfile: "a/package-lock.json", results: [{ name: "x", version: "1.0.0", direct: false, vulnerabilities: [{ id: "V1" }] }] },
    {
      lockfile: "b/package-lock.json",
      results: [
        { name: "x", version: "1.0.0", direct: true, vulnerabilities: [{ id: "V1" }, { id: "V2" }] },
        { name: "a", version: "2.0.0", direct: false, vulnerabilities: [{ id: "V3" }] },
      ],
    },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].name, "a");
  const x = merged[1];
  assert.equal(x.direct, true);
  assert.deepEqual(x.lockfiles, ["a/package-lock.json", "b/package-lock.json"]);
  assert.deepEqual(x.vulnerabilities.map((v) => v.id), ["V1", "V2"]);
});

test("mergeScanResults: 結果が無ければ空配列", () => {
  assert.deepEqual(mergeScanResults([{ lockfile: "a", results: [] }]), []);
});
