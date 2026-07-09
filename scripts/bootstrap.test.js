"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { STATUS, loadManifest, computePlan, applyPlan, hasUnresolvedIssues } = require("./bootstrap.js");

// dev-standards本体（リンク元）と参照側リポジトリ（リンク先）を模した一時ディレクトリ構成を作る。
function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-test-"));
  const repoRoot = path.join(root, "consumer-repo");
  const devStandardsDir = path.join(repoRoot, "dev-standards");

  fs.mkdirSync(path.join(devStandardsDir, ".clinerules"), { recursive: true });
  fs.mkdirSync(path.join(devStandardsDir, ".claude", "skills", "skill-a"), { recursive: true });
  fs.mkdirSync(path.join(devStandardsDir, ".claude", "skills", "skill-b"), { recursive: true });
  fs.writeFileSync(path.join(devStandardsDir, ".clinerules", "01-rule.md"), "rule content\n");
  fs.writeFileSync(path.join(devStandardsDir, "commitlint.config.cjs"), "module.exports = {};\n");
  fs.writeFileSync(path.join(devStandardsDir, ".gitignore"), "node_modules\n");
  fs.writeFileSync(
    path.join(devStandardsDir, "sync-manifest.json"),
    JSON.stringify({
      symlinks: [
        { source: ".clinerules/01-rule.md", target: ".clinerules/01-rule.md" },
        { source: "commitlint.config.cjs", target: "commitlint.config.cjs" },
      ],
      symlinkAllInDir: [{ source: ".claude/skills", target: ".claude/skills" }],
      copies: [{ source: ".gitignore", target: ".gitignore" }],
    })
  );

  return { root, repoRoot, devStandardsDir };
}

test("computePlan reports missing symlinks and copies on a fresh repo", () => {
  const { repoRoot, devStandardsDir } = makeFixture();
  const manifest = loadManifest(devStandardsDir);
  const plan = computePlan(repoRoot, devStandardsDir, manifest);

  const byTarget = Object.fromEntries(plan.map((item) => [item.target, item]));
  assert.equal(byTarget[".clinerules/01-rule.md"].status, STATUS.MISSING);
  assert.equal(byTarget["commitlint.config.cjs"].status, STATUS.MISSING);
  assert.equal(byTarget[path.join(".claude/skills", "skill-a")].status, STATUS.MISSING);
  assert.equal(byTarget[path.join(".claude/skills", "skill-b")].status, STATUS.MISSING);
  assert.equal(byTarget[".gitignore"].status, STATUS.MISSING);
  assert.equal(hasUnresolvedIssues(plan), true);
});

test("applyPlan creates the missing symlinks and copy, and a second run is a clean no-op", () => {
  const { repoRoot, devStandardsDir } = makeFixture();
  const manifest = loadManifest(devStandardsDir);

  const firstResults = applyPlan(repoRoot, computePlan(repoRoot, devStandardsDir, manifest));
  assert.equal(hasUnresolvedIssues(firstResults), false);

  assert.equal(
    fs.readlinkSync(path.join(repoRoot, ".clinerules", "01-rule.md")),
    path.join("..", "dev-standards", ".clinerules", "01-rule.md")
  );
  assert.equal(
    fs.readlinkSync(path.join(repoRoot, ".claude", "skills", "skill-a")),
    path.join("..", "..", "dev-standards", ".claude", "skills", "skill-a")
  );
  assert.equal(fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf-8"), "node_modules\n");

  // 2回目の実行はすべてOKで、修正対象がないこと（冪等性）
  const secondPlan = computePlan(repoRoot, devStandardsDir, manifest);
  assert.ok(secondPlan.every((item) => item.status === STATUS.OK));
});

test("detects a symlink pointing at the wrong target and fixes it without deleting real files", () => {
  const { repoRoot, devStandardsDir } = makeFixture();
  const manifest = loadManifest(devStandardsDir);
  applyPlan(repoRoot, computePlan(repoRoot, devStandardsDir, manifest));

  // リンク先を意図的に壊す
  const linkPath = path.join(repoRoot, "commitlint.config.cjs");
  fs.unlinkSync(linkPath);
  fs.symlinkSync("./somewhere/else.cjs", linkPath);

  const plan = computePlan(repoRoot, devStandardsDir, manifest);
  const item = plan.find((entry) => entry.target === "commitlint.config.cjs");
  assert.equal(item.status, STATUS.WRONG_TARGET);

  const results = applyPlan(repoRoot, plan);
  const fixed = results.find((entry) => entry.target === "commitlint.config.cjs");
  assert.equal(fixed.status, STATUS.FIXED);
  // commitlint.config.cjs はrepoRoot直下にあり、dev-standardsもrepoRoot直下のため、
  // リンク値に ../ プレフィックスは付かない（.clinerules配下のケースとは階層が異なる）
  assert.equal(fs.readlinkSync(linkPath), path.join("dev-standards", "commitlint.config.cjs"));
});

test("never overwrites a real (non-symlink) file or directory occupying the target path", () => {
  const { repoRoot, devStandardsDir } = makeFixture();
  const manifest = loadManifest(devStandardsDir);

  const targetPath = path.join(repoRoot, "commitlint.config.cjs");
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.writeFileSync(targetPath, "// user's own real file, must not be touched\n");

  const plan = computePlan(repoRoot, devStandardsDir, manifest);
  const item = plan.find((entry) => entry.target === "commitlint.config.cjs");
  assert.equal(item.status, STATUS.BLOCKED);

  const results = applyPlan(repoRoot, plan);
  assert.equal(hasUnresolvedIssues(results), true);
  assert.equal(fs.readFileSync(targetPath, "utf-8"), "// user's own real file, must not be touched\n");
  assert.equal(fs.lstatSync(targetPath).isSymbolicLink(), false);
});

test("flags a copy target whose content has drifted from the source, without overwriting it", () => {
  const { repoRoot, devStandardsDir } = makeFixture();
  const manifest = loadManifest(devStandardsDir);
  applyPlan(repoRoot, computePlan(repoRoot, devStandardsDir, manifest));

  const gitignorePath = path.join(repoRoot, ".gitignore");
  fs.writeFileSync(gitignorePath, "node_modules\n!.env.example\n");

  const plan = computePlan(repoRoot, devStandardsDir, manifest);
  const item = plan.find((entry) => entry.target === ".gitignore");
  assert.equal(item.status, STATUS.DRIFTED);

  const results = applyPlan(repoRoot, plan);
  const afterApply = results.find((entry) => entry.target === ".gitignore");
  assert.equal(afterApply.status, STATUS.DRIFTED, "drifted copies are reported, not auto-overwritten");
  assert.equal(fs.readFileSync(gitignorePath, "utf-8"), "node_modules\n!.env.example\n");
});
