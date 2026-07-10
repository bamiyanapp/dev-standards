#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const STATUS = {
  OK: "ok",
  CREATED: "created",
  FIXED: "fixed",
  MISSING: "missing",
  WRONG_TARGET: "wrong-target",
  DRIFTED: "drifted",
  BLOCKED: "blocked",
};

// レポート専用（実際には何もしない）状態。applyPlan()で修正済みのものと区別する。
const REPORT_ONLY_STATUSES = new Set([STATUS.MISSING, STATUS.WRONG_TARGET, STATUS.DRIFTED]);

function loadManifest(devStandardsDir) {
  const manifestPath = path.join(devStandardsDir, "sync-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`sync-manifest.json が見つかりません: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
}

function relativeSymlinkValue(repoRoot, targetRelPath, sourceAbsPath) {
  const targetDir = path.dirname(path.join(repoRoot, targetRelPath));
  return path.relative(targetDir, sourceAbsPath);
}

function checkSymlinkEntry(repoRoot, devStandardsDir, sourceRel, targetRel) {
  const sourceAbsPath = path.join(devStandardsDir, sourceRel);
  const targetAbsPath = path.join(repoRoot, targetRel);
  const expectedLinkValue = relativeSymlinkValue(repoRoot, targetRel, sourceAbsPath);

  if (!fs.existsSync(sourceAbsPath)) {
    return {
      type: "symlink",
      target: targetRel,
      status: STATUS.BLOCKED,
      detail: `リンク元が存在しません: ${path.relative(repoRoot, sourceAbsPath)}`,
    };
  }

  if (!fs.existsSync(targetAbsPath) && !fs.lstatSync.length) {
    // no-op（下のlstat分岐で判定する。ここには到達しない）
  }

  let lstat;
  try {
    lstat = fs.lstatSync(targetAbsPath);
  } catch {
    return {
      type: "symlink",
      target: targetRel,
      status: STATUS.MISSING,
      detail: `シンボリックリンクがありません（作成先: ${expectedLinkValue}）`,
      expectedLinkValue,
      sourceAbsPath,
      targetAbsPath,
    };
  }

  if (!lstat.isSymbolicLink()) {
    return {
      type: "symlink",
      target: targetRel,
      status: STATUS.BLOCKED,
      detail: `${targetRel} はシンボリックリンクではない実ファイル/ディレクトリのため上書きしません`,
    };
  }

  const actualLinkValue = fs.readlinkSync(targetAbsPath);
  if (actualLinkValue !== expectedLinkValue) {
    return {
      type: "symlink",
      target: targetRel,
      status: STATUS.WRONG_TARGET,
      detail: `リンク先が不正です（現在: ${actualLinkValue} / 期待値: ${expectedLinkValue}）`,
      expectedLinkValue,
      sourceAbsPath,
      targetAbsPath,
    };
  }

  return { type: "symlink", target: targetRel, status: STATUS.OK };
}

function checkSymlinkAllInDirEntry(repoRoot, devStandardsDir, sourceRel, targetRel) {
  const sourceDirAbsPath = path.join(devStandardsDir, sourceRel);
  if (!fs.existsSync(sourceDirAbsPath)) {
    return [
      {
        type: "symlink",
        target: targetRel,
        status: STATUS.BLOCKED,
        detail: `リンク元ディレクトリが存在しません: ${path.relative(repoRoot, sourceDirAbsPath)}`,
      },
    ];
  }

  const names = fs
    .readdirSync(sourceDirAbsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return names.map((name) =>
    checkSymlinkEntry(repoRoot, devStandardsDir, path.join(sourceRel, name), path.join(targetRel, name))
  );
}

function checkCopyEntry(repoRoot, devStandardsDir, sourceRel, targetRel) {
  const sourceAbsPath = path.join(devStandardsDir, sourceRel);
  const targetAbsPath = path.join(repoRoot, targetRel);

  if (!fs.existsSync(sourceAbsPath)) {
    return {
      type: "copy",
      target: targetRel,
      status: STATUS.BLOCKED,
      detail: `コピー元が存在しません: ${path.relative(repoRoot, sourceAbsPath)}`,
    };
  }

  if (!fs.existsSync(targetAbsPath)) {
    return {
      type: "copy",
      target: targetRel,
      status: STATUS.MISSING,
      detail: `コピー先がありません（コピー元: ${path.relative(repoRoot, sourceAbsPath)}）`,
      sourceAbsPath,
      targetAbsPath,
    };
  }

  const sourceContent = fs.readFileSync(sourceAbsPath);
  const targetContent = fs.readFileSync(targetAbsPath);
  if (!sourceContent.equals(targetContent)) {
    return {
      type: "copy",
      target: targetRel,
      status: STATUS.DRIFTED,
      detail: `内容がdev-standards側と異なります（手動で再同期してください）`,
      sourceAbsPath,
      targetAbsPath,
    };
  }

  return { type: "copy", target: targetRel, status: STATUS.OK };
}

// リポジトリの現状とマニフェストを突き合わせ、各エントリの状態一覧を返す（副作用なし）。
function computePlan(repoRoot, devStandardsDir, manifest) {
  const plan = [];

  for (const entry of manifest.symlinks || []) {
    plan.push(checkSymlinkEntry(repoRoot, devStandardsDir, entry.source, entry.target));
  }

  for (const entry of manifest.symlinkAllInDir || []) {
    plan.push(...checkSymlinkAllInDirEntry(repoRoot, devStandardsDir, entry.source, entry.target));
  }

  for (const entry of manifest.copies || []) {
    plan.push(checkCopyEntry(repoRoot, devStandardsDir, entry.source, entry.target));
  }

  return plan;
}

// computePlan()の結果のうち、修正可能な項目（symlinkのmissing/wrong-target、copyのmissing）を実際に直す。
// copyのdrifted（内容差分）は自動上書きせず、手動同期を促すレポートに留める。
function applyPlan(repoRoot, plan) {
  const results = [];

  for (const item of plan) {
    if (item.status === STATUS.OK || item.status === STATUS.BLOCKED || item.status === STATUS.DRIFTED) {
      results.push(item);
      continue;
    }

    if (item.type === "symlink") {
      fs.mkdirSync(path.dirname(item.targetAbsPath), { recursive: true });
      if (fs.existsSync(item.targetAbsPath) || isBrokenSymlink(item.targetAbsPath)) {
        fs.unlinkSync(item.targetAbsPath);
      }
      fs.symlinkSync(item.expectedLinkValue, item.targetAbsPath);
      results.push({
        ...item,
        status: item.status === STATUS.MISSING ? STATUS.CREATED : STATUS.FIXED,
      });
      continue;
    }

    if (item.type === "copy" && item.status === STATUS.MISSING) {
      fs.mkdirSync(path.dirname(item.targetAbsPath), { recursive: true });
      fs.copyFileSync(item.sourceAbsPath, item.targetAbsPath);
      results.push({ ...item, status: STATUS.CREATED });
      continue;
    }

    results.push(item);
  }

  return results;
}

function isBrokenSymlink(targetAbsPath) {
  try {
    fs.lstatSync(targetAbsPath);
    return true;
  } catch {
    return false;
  }
}

function printReport(results) {
  for (const item of results) {
    if (item.status === STATUS.OK) continue;
    console.log(`[${item.status}] ${item.target}${item.detail ? " - " + item.detail : ""}`);
  }
  const okCount = results.filter((r) => r.status === STATUS.OK).length;
  console.log(`\n${okCount}/${results.length} 件がOKです。`);
}

function hasUnresolvedIssues(results) {
  return results.some((item) => REPORT_ONLY_STATUSES.has(item.status) || item.status === STATUS.BLOCKED);
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const submoduleDirArg = args.find((arg) => arg.startsWith("--submodule-dir="));
  const submoduleDirName = submoduleDirArg ? submoduleDirArg.split("=")[1] : "dev-standards";

  const repoRoot = process.cwd();
  const devStandardsDir = path.resolve(repoRoot, submoduleDirName);

  if (!fs.existsSync(devStandardsDir)) {
    console.error(`dev-standards submoduleが見つかりません: ${devStandardsDir}`);
    console.error("リポジトリルートで実行しているか、--submodule-dir=<path> を指定してください。");
    process.exit(1);
  }

  const manifest = loadManifest(devStandardsDir);
  const plan = computePlan(repoRoot, devStandardsDir, manifest);

  if (checkOnly) {
    printReport(plan);
    process.exit(hasUnresolvedIssues(plan) ? 1 : 0);
  }

  const results = applyPlan(repoRoot, plan);
  printReport(results);
  process.exit(hasUnresolvedIssues(results) ? 1 : 0);
}

module.exports = {
  STATUS,
  loadManifest,
  computePlan,
  applyPlan,
  hasUnresolvedIssues,
};

if (require.main === module) {
  main();
}
