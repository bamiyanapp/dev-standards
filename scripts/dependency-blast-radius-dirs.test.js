"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { selectTargets, lockfileDir } = require("./dependency-blast-radius-dirs.js");

const change = (name, direct, lockfiles) => ({ name, oldVersion: "1.0.0", newVersion: "1.1.0", direct, lockfiles });
const existsIn = (...paths) => (p) => paths.includes(p);

test("lockfileDir: ルートは'.'、それ以外は親ディレクトリ", () => {
  assert.equal(lockfileDir("package-lock.json"), ".");
  assert.equal(lockfileDir("app/top/package-lock.json"), "app/top");
});

test("直接依存の更新があるlockfileのディレクトリだけを、対象にする", () => {
  const info = { changes: [change("vite", true, ["app/top/package-lock.json", "app/line-link/package-lock.json"]), change("esbuild", false, ["app/voice-practice/package-lock.json"])] };
  const exists = existsIn("app/top/src", "app/line-link/src", "app/voice-practice/src");
  assert.deepEqual(selectTargets(info, exists), [
    { dir: "app/line-link", target: "app/line-link/src" },
    { dir: "app/top", target: "app/top/src" },
  ]);
});

test("srcが無ければディレクトリ自体を対象にする。ディレクトリも無ければ除く", () => {
  const info = { changes: [change("a", true, ["infra/bot-stack/package-lock.json", "gone/package-lock.json"])] };
  assert.deepEqual(selectTargets(info, existsIn("infra/bot-stack")), [{ dir: "infra/bot-stack", target: "infra/bot-stack" }]);
});

test("ルートのlockfileは、srcがあるときだけ対象にする（ルート全体は渡さない）", () => {
  const info = { changes: [change("a", true, ["package-lock.json"])] };
  assert.deepEqual(selectTargets(info, existsIn("src")), [{ dir: ".", target: "src" }]);
  assert.deepEqual(selectTargets(info, existsIn()), []);
});

test("直接依存の更新が無い・lockfilesが無いときは、空", () => {
  assert.deepEqual(selectTargets({ changes: [change("a", false, ["app/x/package-lock.json"])] }, () => true), []);
  assert.deepEqual(selectTargets({ changes: [{ name: "a", direct: true }] }, () => true), []);
  assert.deepEqual(selectTargets({}, () => true), []);
});
