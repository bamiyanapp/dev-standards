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

// sync-manifest.jsonはdev-standards本体が持つ唯一のマニフェストであり、全参照側
// リポジトリで共通に成立するパス（.clinerules/等）のみを収録する前提になっている。
// プロダクトごとにディレクトリ構成が異なる同期対象（例: examinationのapp/top/配下の
// ような、そのリポジトリだけに存在するパス）をここへ直接追加すると、他の参照側
// リポジトリでのbootstrap実行がそのリポジトリに存在しないパスを操作しようとして
// 壊れてしまう。そのため、参照側リポジトリ自身のルートに置く任意のローカル
// マニフェスト（sync-manifest.local.json）を追加で読み込めるようにし、
// プロダクト固有の同期対象はそちらに書けるようにする。ファイルが存在しない
// （＝ローカルマニフェストを使わないリポジトリ）場合はエラーにせず空として扱う
function loadLocalManifest(repoRoot) {
  const localManifestPath = path.join(repoRoot, "sync-manifest.local.json");
  if (!fs.existsSync(localManifestPath)) {
    return { symlinks: [], symlinkAllInDir: [], copies: [] };
  }
  const parsed = JSON.parse(fs.readFileSync(localManifestPath, "utf-8"));
  return {
    symlinks: parsed.symlinks || [],
    symlinkAllInDir: parsed.symlinkAllInDir || [],
    copies: parsed.copies || [],
  };
}

// dev-standards本体のマニフェストと参照側リポジトリのローカルマニフェストを
// 単純に連結する。source/targetの意味（sourceはdev-standardsディレクトリ相対、
// targetはリポジトリルート相対）はどちらのマニフェストのエントリでも変わらない
function mergeManifests(manifest, localManifest) {
  return {
    symlinks: [...(manifest.symlinks || []), ...(localManifest.symlinks || [])],
    symlinkAllInDir: [...(manifest.symlinkAllInDir || []), ...(localManifest.symlinkAllInDir || [])],
    copies: [...(manifest.copies || []), ...(localManifest.copies || [])],
  };
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

// コピー対象ファイルの一部を「dev-standards管理区間」として明示するマーカー。
// この区間で挟まれた内容のみを同期対象とし、区間外への追記（プロダクト固有の
// 追加エントリ等）はcopiesの完全一致チェックの対象外として許容する（issue #138）。
const MANAGED_REGION_START = "# --- dev-standards managed: start ---";
const MANAGED_REGION_END = "# --- dev-standards managed: end ---";

// テキスト中からマーカー区間（マーカー行自体を含む）を1つ取り出す。
// マーカーが無い、またはstart/endが揃っていない場合はnullを返す
// （＝この関数の呼び出し元は従来通りファイル全体の完全一致チェックにフォールバックする）。
function findManagedRegion(text) {
  const start = text.indexOf(MANAGED_REGION_START);
  if (start === -1) {
    return null;
  }
  const endMarkerStart = text.indexOf(MANAGED_REGION_END, start + MANAGED_REGION_START.length);
  if (endMarkerStart === -1) {
    return null;
  }
  const end = endMarkerStart + MANAGED_REGION_END.length;
  return { text: text.slice(start, end), start, end };
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

  const sourceText = fs.readFileSync(sourceAbsPath, "utf-8");
  const sourceRegion = findManagedRegion(sourceText);

  if (!sourceRegion) {
    // コピー元にマーカーが無い場合は従来通りファイル全体のバイト単位完全一致を要求する
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

  const targetText = fs.readFileSync(targetAbsPath, "utf-8");
  const targetRegion = findManagedRegion(targetText);

  if (!targetRegion) {
    return {
      type: "copy",
      target: targetRel,
      status: STATUS.DRIFTED,
      detail: `dev-standards管理区間（${MANAGED_REGION_START} 〜 ${MANAGED_REGION_END}）のマーカーがコピー先に見つかりません（手動で再同期してください）`,
      sourceAbsPath,
      targetAbsPath,
    };
  }

  if (targetRegion.text !== sourceRegion.text) {
    return {
      type: "copy",
      target: targetRel,
      status: STATUS.DRIFTED,
      // マーカーが両方に揃っており、区間の位置を安全に特定できるため、
      // 自動修正の対象にできることを示すフラグ（applyPlan参照）
      managed: true,
      detail: `dev-standards管理区間（マーカー行の間）の内容がdev-standards側と異なります`,
      sourceAbsPath,
      targetAbsPath,
    };
  }

  return { type: "copy", target: targetRel, status: STATUS.OK };
}

// dev-standards管理区間のみをコピー元の内容へ差し替える。区間外
// （プロダクト固有の追記）はそのまま維持する。target側にマーカーが
// 見つからない場合は安全に差し替え位置を特定できないためnullを返す
// （呼び出し側は自動修正を諦め、従来通りレポートのみに留める）。
function resyncManagedRegion(sourceAbsPath, targetAbsPath) {
  const sourceRegion = findManagedRegion(fs.readFileSync(sourceAbsPath, "utf-8"));
  const targetText = fs.readFileSync(targetAbsPath, "utf-8");
  const targetRegion = findManagedRegion(targetText);
  if (!sourceRegion || !targetRegion) {
    return null;
  }
  return targetText.slice(0, targetRegion.start) + sourceRegion.text + targetText.slice(targetRegion.end);
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

// computePlan()の結果のうち、修正可能な項目（symlinkのmissing/wrong-target、copyのmissing、
// および位置を安全に特定できるcopyのdrifted managed区間差分）を実際に直す。
// マーカーで区間を特定できないcopyのdrifted（ファイル全体の差分、または区間位置が
// 不明な差分）は、これまで通り自動上書きせず手動同期を促すレポートに留める。
function applyPlan(repoRoot, plan) {
  const results = [];

  for (const item of plan) {
    if (item.status === STATUS.OK || item.status === STATUS.BLOCKED) {
      results.push(item);
      continue;
    }

    if (item.type === "copy" && item.status === STATUS.DRIFTED) {
      if (item.managed) {
        const fixedText = resyncManagedRegion(item.sourceAbsPath, item.targetAbsPath);
        if (fixedText !== null) {
          fs.writeFileSync(item.targetAbsPath, fixedText, "utf-8");
          results.push({ ...item, status: STATUS.FIXED });
          continue;
        }
      }
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

  const manifest = mergeManifests(loadManifest(devStandardsDir), loadLocalManifest(repoRoot));
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
  loadLocalManifest,
  mergeManifests,
  computePlan,
  applyPlan,
  hasUnresolvedIssues,
};

if (require.main === module) {
  main();
}
