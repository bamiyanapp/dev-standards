"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { diffInstallScripts } = require("./dependency-package-anomaly-info.js");

function lock(packages) {
  return { lockfileVersion: 3, packages: { "": {}, ...packages } };
}

test("diffInstallScripts: 既存パッケージがバージョン更新に伴いinstall scriptを新規に持つ場合を検知する", () => {
  const oldLock = lock({ "node_modules/foo": { version: "1.0.0" } });
  const newLock = lock({ "node_modules/foo": { version: "1.1.0", hasInstallScript: true } });
  assert.deepEqual(diffInstallScripts(oldLock, newLock), [
    { name: "foo", version: "1.1.0", kind: "existing_package_gained_install_script" },
  ]);
});

test("diffInstallScripts: 新規追加されたパッケージがinstall scriptを持つ場合を検知する", () => {
  const oldLock = lock({});
  const newLock = lock({ "node_modules/foo": { version: "1.0.0", hasInstallScript: true } });
  assert.deepEqual(diffInstallScripts(oldLock, newLock), [
    { name: "foo", version: "1.0.0", kind: "new_package_with_install_script" },
  ]);
});

test("diffInstallScripts: 既存のままinstall scriptを持ち続けている場合は検知しない", () => {
  const oldLock = lock({ "node_modules/foo": { version: "1.0.0", hasInstallScript: true } });
  const newLock = lock({ "node_modules/foo": { version: "1.1.0", hasInstallScript: true } });
  assert.deepEqual(diffInstallScripts(oldLock, newLock), []);
});

test("diffInstallScripts: install scriptを失う変化（より安全）は検知しない", () => {
  const oldLock = lock({ "node_modules/foo": { version: "1.0.0", hasInstallScript: true } });
  const newLock = lock({ "node_modules/foo": { version: "1.1.0" } });
  assert.deepEqual(diffInstallScripts(oldLock, newLock), []);
});

test("diffInstallScripts: install scriptを持たないパッケージの追加・更新は検知しない", () => {
  const oldLock = lock({});
  const newLock = lock({ "node_modules/foo": { version: "1.0.0" } });
  assert.deepEqual(diffInstallScripts(oldLock, newLock), []);
});

test("diffInstallScripts: 複数件を名前順で返す", () => {
  const oldLock = lock({});
  const newLock = lock({
    "node_modules/zeta": { version: "1.0.0", hasInstallScript: true },
    "node_modules/alpha": { version: "1.0.0", hasInstallScript: true },
  });
  assert.deepEqual(
    diffInstallScripts(oldLock, newLock).map((a) => a.name),
    ["alpha", "zeta"],
  );
});

test("CLI: 2つのpackage-lock.jsonファイルを受け取りJSON配列を出力する", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dependency-package-anomaly-info-test-"));
  const oldLockPath = path.join(tmpDir, "old.json");
  const newLockPath = path.join(tmpDir, "new.json");
  fs.writeFileSync(oldLockPath, JSON.stringify(lock({})));
  fs.writeFileSync(newLockPath, JSON.stringify(lock({ "node_modules/foo": { version: "1.0.0", hasInstallScript: true } })));

  const output = execFileSync(process.execPath, [path.join(__dirname, "dependency-package-anomaly-info.js"), oldLockPath, newLockPath], {
    encoding: "utf-8",
  });
  assert.deepEqual(JSON.parse(output), [{ name: "foo", version: "1.0.0", kind: "new_package_with_install_script" }]);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("実際のpackage-lock.json同士（自己比較）では検知0件になる（回帰確認）", () => {
  const selfLock = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package-lock.json"), "utf-8"));
  assert.deepEqual(diffInstallScripts(selfLock, selfLock), []);
});
