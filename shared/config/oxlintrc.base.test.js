import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonc } from "./readJsonc.js";

// 参照側がextendsで継承するため、壊れると、全参照側のlintが止まる（dev-standards#1535）
const config = readJsonc(path.join(path.dirname(fileURLToPath(import.meta.url)), "oxlintrc.base.json"));

test("oxlintrc.base.json: 必要なプラグインを有効にする", () => {
  for (const plugin of ["react", "typescript", "oxc", "jsx-a11y"]) {
    assert.ok(config.plugins.includes(plugin), `${plugin}プラグインが必要`);
  }
});

test("oxlintrc.base.json: react/rules-of-hooksはerror", () => {
  assert.equal(config.rules["react/rules-of-hooks"], "error");
});

test("oxlintrc.base.json: labelと入力欄の関連付けの検査は、導入時に既存の違反が出るためwarnで始める", () => {
  assert.equal(config.rules["jsx-a11y/label-has-associated-control"], "warn");
});
