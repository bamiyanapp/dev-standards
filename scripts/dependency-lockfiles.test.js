"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { findLockfilePaths, baseFileName, mergeChanges, mergeAnomalies, diffAll } = require("./dependency-lockfiles.js");

test("任意の階層のpackage-lock.jsonを見つける。node_modules配下・似た名前は除く。重複なし・昇順", () => {
  const files = ["package-lock.json", "app/top/package-lock.json", "infra/x/package-lock.json", "app/top/src/a.js", "node_modules/pkg/package-lock.json", "app/top/node_modules/y/package-lock.json", "app/package-lock.json.bak", "my-package-lock.json", "package-lock.json"];
  assert.deepEqual(findLockfilePaths(files), ["app/top/package-lock.json", "infra/x/package-lock.json", "package-lock.json"]);
  assert.deepEqual(findLockfilePaths(["README.md"]), []);
});

test("ルートのみ: ['package-lock.json']になり、従来の判定と同じ", () => {
  assert.deepEqual(findLockfilePaths(["package-lock.json", "src/a.js"]), ["package-lock.json"]);
});

test("baseFileName: /を__へ置き換える", () => {
  assert.equal(baseFileName("app/top/package-lock.json"), "app__top__package-lock.json");
});

const change = (name, oldVersion, newVersion, extra = {}) => ({ name, oldVersion, newVersion, updateType: "minor", direct: false, production: false, ...extra });

test("vite更新が9アプリに同時に現れても、1件にまとめ、影響するlockfileを全部並べる（examination#673）", () => {
  const perLockfile = Array.from({ length: 9 }, (_, i) => ({ path: `app/a${i}/package-lock.json`, changes: [change("vite", "5.0.0", "5.1.0")] }));
  const merged = mergeChanges(perLockfile);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].lockfiles.length, 9);
});

test("異なる更新（新旧が違う）は別々の件にする", () => {
  const merged = mergeChanges([
    { path: "a/package-lock.json", changes: [change("vite", "5.0.0", "5.1.0")] },
    { path: "b/package-lock.json", changes: [change("vite", "4.0.0", "4.5.0")] },
  ]);
  assert.equal(merged.length, 2);
});

test("direct・productionは、いずれかのlockfileで真なら真（本番到達経路が1箇所でもあれば対象）", () => {
  const merged = mergeChanges([
    { path: "a/package-lock.json", changes: [change("x", "1.0.0", "1.1.0", { direct: false, production: false })] },
    { path: "b/package-lock.json", changes: [change("x", "1.0.0", "1.1.0", { direct: true, production: true })] },
  ]);
  assert.deepEqual([merged[0].direct, merged[0].production], [true, true]);
});

test("install scriptの異常も、同じものは1件にまとめる", () => {
  const a = { name: "esbuild", version: "0.20.0", kind: "new_package_with_install_script" };
  const merged = mergeAnomalies([{ path: "a/package-lock.json", anomalies: [a] }, { path: "b/package-lock.json", anomalies: [a, { ...a, name: "other" }] }]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.find((m) => m.name === "esbuild").lockfiles, ["a/package-lock.json", "b/package-lock.json"]);
});

test("diffAll: 実際のlockfileの組で、パスごとの差分を出す。base側が無い新規lockfileも扱える", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lock-"));
  const lock = (version) => ({ lockfileVersion: 3, packages: { "": { dependencies: { vite: "^5" } }, "node_modules/vite": { version } } });
  const cwd = process.cwd();
  try {
    process.chdir(dir);
    fs.mkdirSync("app/top", { recursive: true });
    fs.mkdirSync("app/new", { recursive: true });
    fs.mkdirSync("base");
    fs.writeFileSync("app/top/package-lock.json", JSON.stringify(lock("5.1.0")));
    fs.writeFileSync("base/app__top__package-lock.json", JSON.stringify(lock("5.0.0")));
    fs.writeFileSync("app/new/package-lock.json", JSON.stringify(lock("5.1.0")));
    const results = diffAll("base", ["app/new/package-lock.json", "app/top/package-lock.json"]);
    const top = results.find((r) => r.path === "app/top/package-lock.json");
    assert.deepEqual(top.changes.map((c) => [c.name, c.oldVersion, c.newVersion]), [["vite", "5.0.0", "5.1.0"]]);
    assert.ok(results.find((r) => r.path === "app/new/package-lock.json"));
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
