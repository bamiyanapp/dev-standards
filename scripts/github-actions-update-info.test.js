"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractActionReferences,
  parseVersionComponents,
  classifyActionRefUpdate,
  diffActionReferences,
} = require("./github-actions-update-info.js");

test("extractActionReferences: 複数のuses:行を抽出する", () => {
  const yaml = [
    "steps:",
    "  - uses: actions/checkout@v7",
    "  - uses: actions/setup-node@v7",
    "    with:",
    "      node-version: 24",
    "  - uses: peaceiris/actions-gh-pages@v4",
  ].join("\n");
  assert.deepEqual(extractActionReferences(yaml), [
    { action: "actions/checkout", ref: "v7" },
    { action: "actions/setup-node", ref: "v7" },
    { action: "peaceiris/actions-gh-pages", ref: "v4" },
  ]);
});

test("extractActionReferences: dev-standards自身のcomposite action参照（owner/repo/path@ref）も扱う", () => {
  const yaml = "uses: bamiyanapp/dev-standards/.github/actions/deploy-github-pages@v1.0.0\n";
  assert.deepEqual(extractActionReferences(yaml), [
    { action: "bamiyanapp/dev-standards/.github/actions/deploy-github-pages", ref: "v1.0.0" },
  ]);
});

test("extractActionReferences: uses:行が無ければ空配列を返す", () => {
  assert.deepEqual(extractActionReferences("name: CI\non: push\n"), []);
});

test("parseVersionComponents: v7（メジャーのみ）・v7.1.2（フルsemver）いずれも解釈する", () => {
  assert.deepEqual(parseVersionComponents("v7"), { major: 7, minor: null, patch: null });
  assert.deepEqual(parseVersionComponents("v7.1"), { major: 7, minor: 1, patch: null });
  assert.deepEqual(parseVersionComponents("v7.1.2"), { major: 7, minor: 1, patch: 2 });
  assert.deepEqual(parseVersionComponents("7.1.2"), { major: 7, minor: 1, patch: 2 });
});

test("parseVersionComponents: コミットSHA・ブランチ名等はnullを返す", () => {
  assert.equal(parseVersionComponents("main"), null);
  assert.equal(parseVersionComponents("a1b2c3d"), null);
  assert.equal(parseVersionComponents(undefined), null);
});

test("classifyActionRefUpdate: メジャーのみタグ同士のmajor更新を検出する", () => {
  assert.equal(classifyActionRefUpdate("v7", "v8"), "major");
});

test("classifyActionRefUpdate: フルsemver同士のminor/patch更新を検出する", () => {
  assert.equal(classifyActionRefUpdate("v7.1.0", "v7.2.0"), "minor");
  assert.equal(classifyActionRefUpdate("v7.1.0", "v7.1.1"), "patch");
  assert.equal(classifyActionRefUpdate("v7.1.0", "v8.0.0"), "major");
});

test("classifyActionRefUpdate: コンポーネント数が不揃いで比較できない場合はotherを返す", () => {
  assert.equal(classifyActionRefUpdate("v7", "v7.1.0"), "other");
  assert.equal(classifyActionRefUpdate("v7.1.0", "v7"), "other");
});

test("classifyActionRefUpdate: ダウングレード・解釈不能な参照はotherを返す", () => {
  assert.equal(classifyActionRefUpdate("v8", "v7"), "other");
  assert.equal(classifyActionRefUpdate("v7", "main"), "other");
  assert.equal(classifyActionRefUpdate("main", "a1b2c3d"), "other");
});

test("diffActionReferences: refが変化したactionのみを検出する", () => {
  const oldYaml = [
    "- uses: actions/checkout@v7",
    "- uses: actions/setup-node@v7",
  ].join("\n");
  const newYaml = [
    "- uses: actions/checkout@v8",
    "- uses: actions/setup-node@v7",
  ].join("\n");
  assert.deepEqual(diffActionReferences(oldYaml, newYaml), [
    { action: "actions/checkout", oldRef: "v7", newRef: "v8", updateType: "major" },
  ]);
});

test("diffActionReferences: 新規追加されたuses:（旧版に存在しない）は対象外とする", () => {
  const oldYaml = "- uses: actions/checkout@v7\n";
  const newYaml = "- uses: actions/checkout@v7\n- uses: actions/setup-node@v7\n";
  assert.deepEqual(diffActionReferences(oldYaml, newYaml), []);
});

test("diffActionReferences: 複数のactionが同時に更新された場合はaction名順で返す", () => {
  const oldYaml = "- uses: actions/checkout@v7\n- uses: actions/setup-node@v6\n";
  const newYaml = "- uses: actions/checkout@v8\n- uses: actions/setup-node@v7\n";
  const changes = diffActionReferences(oldYaml, newYaml);
  assert.deepEqual(
    changes.map((c) => c.action),
    ["actions/checkout", "actions/setup-node"],
  );
});
