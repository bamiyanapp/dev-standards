"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { listSyncManifestTargets } = require("./sync-manifest-targets.js");

// dev-standards本体（リンク元）と参照側リポジトリ（リンク先）を模した一時ディレクトリ構成を作る。
function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sync-manifest-targets-test-"));
  const repoRoot = path.join(root, "consumer-repo");
  const devStandardsDir = path.join(repoRoot, "dev-standards");

  fs.mkdirSync(path.join(devStandardsDir, ".claude", "skills", "skill-a"), { recursive: true });
  fs.mkdirSync(path.join(devStandardsDir, ".claude", "skills", "skill-b"), { recursive: true });
  fs.mkdirSync(path.join(devStandardsDir, "shared", "hooks"), { recursive: true });
  fs.writeFileSync(path.join(devStandardsDir, "shared", "hooks", "useWakeLock.js"), "export function useWakeLock() {}\n");
  fs.writeFileSync(path.join(devStandardsDir, "commitlint.config.cjs"), "module.exports = {};\n");
  fs.writeFileSync(path.join(devStandardsDir, ".gitignore"), "node_modules\n");
  fs.writeFileSync(
    path.join(devStandardsDir, "sync-manifest.json"),
    JSON.stringify({
      symlinks: [{ source: "commitlint.config.cjs", target: "commitlint.config.cjs" }],
      symlinkAllInDir: [{ source: ".claude/skills", target: ".claude/skills" }],
      copies: [{ source: ".gitignore", target: ".gitignore" }],
    }),
  );

  return { repoRoot, devStandardsDir };
}

test("listSyncManifestTargets: symlinks・copiesのtargetをそのまま返す", () => {
  const { repoRoot, devStandardsDir } = makeFixture();

  const targets = listSyncManifestTargets(repoRoot, devStandardsDir);

  assert.ok(targets.includes("commitlint.config.cjs"));
  assert.ok(targets.includes(".gitignore"));
});

test("listSyncManifestTargets: symlinkAllInDirは実際のディレクトリ内容へ展開される", () => {
  const { repoRoot, devStandardsDir } = makeFixture();

  const targets = listSyncManifestTargets(repoRoot, devStandardsDir);

  assert.ok(targets.includes(path.join(".claude/skills", "skill-a")));
  assert.ok(targets.includes(path.join(".claude/skills", "skill-b")));
});

test("listSyncManifestTargets: 参照側リポジトリ自身のsync-manifest.local.jsonのエントリも含む", () => {
  const { repoRoot, devStandardsDir } = makeFixture();
  fs.writeFileSync(
    path.join(repoRoot, "sync-manifest.local.json"),
    JSON.stringify({
      symlinks: [{ source: "shared/hooks/useWakeLock.js", target: "frontend/src/hooks/useWakeLock.js" }],
    }),
  );

  const targets = listSyncManifestTargets(repoRoot, devStandardsDir);

  assert.ok(targets.includes("frontend/src/hooks/useWakeLock.js"));
});

test("listSyncManifestTargets: symlinkAllInDirのリンク元ディレクトリが存在しない場合は空配列として扱う", () => {
  const { repoRoot, devStandardsDir } = makeFixture();
  fs.rmSync(path.join(devStandardsDir, ".claude"), { recursive: true, force: true });

  assert.doesNotThrow(() => listSyncManifestTargets(repoRoot, devStandardsDir));
});
