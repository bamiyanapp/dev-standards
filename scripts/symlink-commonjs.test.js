"use strict";

// symlinkで共有したCommonJSファイルの、名前付きexportが、`--preserve-symlinks`で消える問題の再現（issue #1297）。
// 参照側が"type": "module"で、NODE_OPTIONS=--preserve-symlinksを使い、shared/lambdaの.jsを、
// symlinkで取り込み、名前付きimportすると、Node.jsがexportを検出できない。
// 確認した事実を固定するため、一時ディレクトリで再現する（Node.js v22で確認）。
// 実体を.cjsにすれば、モジュール種別が、周囲のpackage.jsonに依存しないため、どの組み合わせでも読める。
// 互換用の1行の.js（module.exports = require("./x.cjs")）は、--preserve-symlinksで壊れるため、採らない。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function setup(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "symlink-cjs-"));
  const shared = path.join(root, "shared");
  const app = path.join(root, "app");
  fs.mkdirSync(shared);
  fs.mkdirSync(app);
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ type: "module" }));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(shared, name), content);
  return { root, shared, app };
}

// 参照側のESMから、symlink経由で名前付きimportできるかを返す
function canImportNamed({ shared, app }, target, preserveSymlinks) {
  fs.symlinkSync(path.join(shared, target), path.join(app, target));
  fs.writeFileSync(path.join(app, "main.mjs"), `import { a } from "./${target}";\nconsole.log(typeof a);\n`);
  const env = { ...process.env, NODE_OPTIONS: preserveSymlinks ? "--preserve-symlinks" : "" };
  const result = spawnSync(process.execPath, ["main.mjs"], { cwd: app, env, encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() === "function";
}

const CJS = "module.exports = { a() { return 1; } };\n";

test("実体が.js: --preserve-symlinksなしなら読めるが、ありだと名前付きimportできない", () => {
  const dir = setup({ "x.js": CJS });
  try {
    assert.equal(canImportNamed(dir, "x.js", false), true);
    fs.rmSync(path.join(dir.app, "x.js"));
    assert.equal(canImportNamed(dir, "x.js", true), false);
  } finally {
    fs.rmSync(dir.root, { recursive: true, force: true });
  }
});

test("実体が.cjs: --preserve-symlinksの有無によらず、名前付きimportできる", () => {
  const dir = setup({ "x.cjs": CJS });
  try {
    assert.equal(canImportNamed(dir, "x.cjs", false), true);
    fs.rmSync(path.join(dir.app, "x.cjs"));
    assert.equal(canImportNamed(dir, "x.cjs", true), true);
  } finally {
    fs.rmSync(dir.root, { recursive: true, force: true });
  }
});

test("互換用の1行の.js（require(\"./x.cjs\")）は、--preserve-symlinksで壊れる", () => {
  const dir = setup({ "x.cjs": CJS, "x.js": 'module.exports = require("./x.cjs");\n' });
  try {
    assert.equal(canImportNamed(dir, "x.js", true), false);
  } finally {
    fs.rmSync(dir.root, { recursive: true, force: true });
  }
});
