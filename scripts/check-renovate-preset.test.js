"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseConfig, extendsPreset, evaluate } = require("./check-renovate-preset.js");

test("extendsPreset: github>・local>のどちらも、#タグ・:プリセット名つきも、継承と認める", () => {
  for (const value of ["github>bamiyanapp/dev-standards", "local>bamiyanapp/dev-standards", "github>bamiyanapp/dev-standards#v2.0.0", "github>bamiyanapp/dev-standards:default"]) {
    assert.equal(extendsPreset({ extends: ["config:recommended", value] }), true, value);
  }
});

test("extendsPreset: 継承していない・名前が似た別リポジトリ・extendsが無い場合は、false", () => {
  assert.equal(extendsPreset({ extends: ["config:recommended"] }), false);
  assert.equal(extendsPreset({ extends: ["github>bamiyanapp/dev-standards-fork"] }), false);
  assert.equal(extendsPreset({ extends: ["github>other/dev-standards"] }), false);
  assert.equal(extendsPreset({}), false);
  assert.equal(extendsPreset({ extends: "github>bamiyanapp/dev-standards" }), false);
});

test("evaluate: 継承していれば警告なし。していなければ、導入のしかたとopt-outを示す", () => {
  assert.equal(evaluate({ extends: ["github>bamiyanapp/dev-standards"] }, null), null);
  const message = evaluate({ extends: ["config:recommended"] }, null);
  assert.match(message, /github>bamiyanapp\/dev-standards/);
  assert.match(message, /renovate-preset-opt-out\.json/);
});

test("evaluate: 理由つきのopt-outは警告なし。理由が空なら、理由を求める", () => {
  assert.equal(evaluate({ extends: [] }, { reason: "独自の設定で足りる" }), null);
  assert.match(evaluate({ extends: [] }, { reason: "  " }), /理由/);
  assert.match(evaluate({ extends: [] }, {}), /理由/);
});

test("parseConfig: JSON5のコメント・末尾カンマを許す（URLの//は壊さない）", () => {
  const text = `{
    // コメント
    "extends": ["github>bamiyanapp/dev-standards",], /* 末尾カンマ */
    "x": "https://example.com/a",
  }`;
  const config = parseConfig(text);
  assert.equal(extendsPreset(config), true);
  assert.equal(config.x, "https://example.com/a");
});
