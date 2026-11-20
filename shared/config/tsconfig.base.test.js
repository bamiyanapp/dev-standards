import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonc as readJsoncFile } from "./readJsonc.js";

// tsconfigのベースは、コメントを含むJSONC。コメントを除いてから、JSONとして読む。
// 参照側がextendsで継承するため、壊れると、全参照側の型チェックが止まる（dev-standards#1376）
const dir = path.dirname(fileURLToPath(import.meta.url));

function readJsonc(name) {
  return readJsoncFile(path.join(dir, name));
}

for (const name of ["tsconfig.app.base.json", "tsconfig.node.base.json"]) {
  test(`${name}: 読み込めて、共通の必須設定を持つ`, () => {
    const { compilerOptions } = readJsonc(name);
    assert.equal(compilerOptions.strict, true);
    assert.equal(compilerOptions.noEmit, true);
    assert.equal(compilerOptions.moduleResolution, "bundler");
    assert.equal(compilerOptions.verbatimModuleSyntax, true);
  });

  test(`${name}: 継承元基準で解決される設定（include・files・exclude・tsBuildInfoFile・references）を持たない`, () => {
    const config = readJsonc(name);
    for (const key of ["include", "files", "exclude", "references"]) {
      assert.equal(key in config, false, `${key}はベースに書かず、参照側に残す`);
    }
    assert.equal("tsBuildInfoFile" in config.compilerOptions, false);
  });
}

test("tsconfig.app.base.json: symlink共有のプレーンJSXの解決に必要なallowJsとjsxを持つ", () => {
  const { compilerOptions } = readJsonc("tsconfig.app.base.json");
  assert.equal(compilerOptions.allowJs, true);
  assert.equal(compilerOptions.jsx, "react-jsx");
});
