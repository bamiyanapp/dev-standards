"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyUpdateType,
  extractDirectDependencyNames,
  packageNameFromKey,
  diffPackageLocks,
  summarizeDependencyChanges,
} = require("./dependency-update-info.js");

test("classifyUpdateType: major/minor/patchを正しく分類する", () => {
  assert.equal(classifyUpdateType("1.2.3", "2.0.0"), "major");
  assert.equal(classifyUpdateType("1.2.3", "1.3.0"), "minor");
  assert.equal(classifyUpdateType("1.2.3", "1.2.4"), "patch");
});

test("classifyUpdateType: プレフィックス・プレリリース付きバージョンも解釈する", () => {
  assert.equal(classifyUpdateType("^1.2.3", "^1.2.4"), "patch");
  assert.equal(classifyUpdateType("v1.2.3", "v1.3.0"), "minor");
  assert.equal(classifyUpdateType("1.2.3-beta.1", "1.3.0"), "minor");
});

test("classifyUpdateType: バージョン不変・ダウングレードはotherを返す", () => {
  assert.equal(classifyUpdateType("1.2.3", "1.2.3"), "other");
  assert.equal(classifyUpdateType("2.0.0", "1.9.9"), "other");
});

test("classifyUpdateType: semverとして解釈できない場合はotherを返す（gitコミットハッシュ指定等）", () => {
  assert.equal(classifyUpdateType("1.2.3", "abcdef1"), "other");
  assert.equal(classifyUpdateType(undefined, "1.2.3"), "other");
  assert.equal(classifyUpdateType("1.2.3", null), "other");
});

test("extractDirectDependencyNames: ルートのdependencies/devDependenciesを集める", () => {
  const lock = {
    packages: {
      "": {
        dependencies: { foo: "^1.0.0" },
        devDependencies: { bar: "^2.0.0" },
      },
    },
  };
  const names = extractDirectDependencyNames(lock);
  assert.deepEqual([...names].sort(), ["bar", "foo"]);
});

test("extractDirectDependencyNames: npm workspaces構成では各ワークスペースメンバーの依存も合算する（karuta実環境で発覚、bamiyanapp/dev-standards#720）", () => {
  const lock = {
    packages: {
      "": {
        workspaces: ["frontend", "backend"],
        devDependencies: { commitlint: "^21.0.0" },
      },
      frontend: {
        dependencies: { react: "^19.0.0" },
      },
      backend: {
        dependencies: { "@aws-sdk/client-polly": "^3.1146.0" },
      },
    },
  };
  const names = extractDirectDependencyNames(lock);
  assert.deepEqual([...names].sort(), ["@aws-sdk/client-polly", "commitlint", "react"]);
});

test("extractDirectDependencyNames: workspacesが無い通常構成の判定結果は変化しない", () => {
  const lock = {
    packages: {
      "": {
        dependencies: { foo: "^1.0.0" },
      },
    },
  };
  const names = extractDirectDependencyNames(lock);
  assert.deepEqual([...names], ["foo"]);
});

test("packageNameFromKey: スコープ付き・ネストしたパッケージ名を取り出す", () => {
  assert.equal(packageNameFromKey("node_modules/foo"), "foo");
  assert.equal(packageNameFromKey("node_modules/@scope/foo"), "@scope/foo");
  assert.equal(packageNameFromKey("node_modules/parent/node_modules/foo"), "foo");
});

test("diffPackageLocks: 直接依存のpatch更新を検出する", () => {
  const oldLock = {
    packages: {
      "": { dependencies: { foo: "^1.0.0" } },
      "node_modules/foo": { version: "1.0.0" },
    },
  };
  const newLock = {
    packages: {
      "": { dependencies: { foo: "^1.0.0" } },
      "node_modules/foo": { version: "1.0.1" },
    },
  };
  const changes = diffPackageLocks(oldLock, newLock);
  assert.deepEqual(changes, [
    { name: "foo", oldVersion: "1.0.0", newVersion: "1.0.1", updateType: "patch", direct: true },
  ]);
});

test("diffPackageLocks: 間接依存（direct: false）・major更新も検出する", () => {
  const oldLock = {
    packages: {
      "": { dependencies: { foo: "^1.0.0" } },
      "node_modules/foo": { version: "1.0.0" },
      "node_modules/bar": { version: "1.0.0" },
    },
  };
  const newLock = {
    packages: {
      "": { dependencies: { foo: "^1.0.0" } },
      "node_modules/foo": { version: "1.0.0" },
      "node_modules/bar": { version: "2.0.0" },
    },
  };
  const changes = diffPackageLocks(oldLock, newLock);
  assert.deepEqual(changes, [
    { name: "bar", oldVersion: "1.0.0", newVersion: "2.0.0", updateType: "major", direct: false },
  ]);
});

test("diffPackageLocks: バージョンが変化していないパッケージは含めない", () => {
  const lock = {
    packages: {
      "": { dependencies: { foo: "^1.0.0" } },
      "node_modules/foo": { version: "1.0.0" },
    },
  };
  assert.deepEqual(diffPackageLocks(lock, lock), []);
});

test("diffPackageLocks: 新規追加・削除のみ（片方にしか存在しない）パッケージは対象外とする", () => {
  const oldLock = {
    packages: {
      "": { dependencies: {} },
      "node_modules/removed": { version: "1.0.0" },
    },
  };
  const newLock = {
    packages: {
      "": { dependencies: {} },
      "node_modules/added": { version: "1.0.0" },
    },
  };
  assert.deepEqual(diffPackageLocks(oldLock, newLock), []);
});

test("summarizeDependencyChanges: 直接/間接・update type別に集計する", () => {
  const changes = [
    { name: "a", oldVersion: "1.0.0", newVersion: "1.0.1", updateType: "patch", direct: true },
    { name: "b", oldVersion: "1.0.0", newVersion: "1.1.0", updateType: "minor", direct: false },
    { name: "c", oldVersion: "1.0.0", newVersion: "2.0.0", updateType: "major", direct: false },
  ];
  assert.deepEqual(summarizeDependencyChanges(changes), {
    total: 3,
    direct: 1,
    transitive: 2,
    byUpdateType: { major: 1, minor: 1, patch: 1, other: 0 },
  });
});

test("summarizeDependencyChanges: 変更が無い場合は全て0件を返す", () => {
  assert.deepEqual(summarizeDependencyChanges([]), {
    total: 0,
    direct: 0,
    transitive: 0,
    byUpdateType: { major: 0, minor: 0, patch: 0, other: 0 },
  });
});
