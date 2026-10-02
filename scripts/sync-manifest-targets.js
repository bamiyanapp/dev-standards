#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const {
  loadManifest,
  loadLocalManifest,
  mergeManifests,
  listDirEntryNames,
  resolveDevStandardsDir,
} = require("./bootstrap.js");

// bootstrap.jsのcheckSymlinkAllInDirEntryと同じ列挙ロジック（listDirEntryNames）で、
// symlinkAllInDirエントリ（ディレクトリ単位の指定）を実際のファイル・
// ディレクトリ一覧へ展開する
function expandSymlinkAllInDirTargets(devStandardsDir, sourceRel, targetRel) {
  const sourceDirAbsPath = path.join(devStandardsDir, sourceRel);
  if (!fs.existsSync(sourceDirAbsPath)) {
    return [];
  }
  return listDirEntryNames(sourceDirAbsPath).map((name) => path.join(targetRel, name));
}

// duplication-check（jscpd）は参照側リポジトリのproduct codeとdev-standardsの
// shared/とを比較できるようsubmodules: trueでdev-standards/配下もスキャン対象に
// 含める（issue #621）。symlink・copyで意図的に同一化しているファイルの組
// （例: frontend/src/hooks/useWakeLock.jsがdev-standards/shared/hooks/useWakeLock.js
// へのsymlink）まで「重複」として誤検知してしまうため、sync-manifest（本体＋
// ローカル）のtarget一覧をjscpdの-i（ignore）へ渡す除外対象として返す。これにより
// 「意図したsymlink/copyの組」を除外した上で、shared/と参照側リポジトリのそれ以外の
// 部分との重複（＝symlink化し忘れの実体コピー候補）だけが検知対象として残る
function listSyncManifestTargets(repoRoot, devStandardsDir) {
  const manifest = mergeManifests(loadManifest(devStandardsDir), loadLocalManifest(repoRoot));
  const targets = [];

  for (const entry of manifest.symlinks || []) {
    targets.push(entry.target);
  }
  for (const entry of manifest.symlinkAllInDir || []) {
    targets.push(...expandSymlinkAllInDirTargets(devStandardsDir, entry.source, entry.target));
  }
  for (const entry of manifest.copies || []) {
    targets.push(entry.target);
  }

  return targets;
}

function main() {
  const args = process.argv.slice(2);
  const { repoRoot, devStandardsDir } = resolveDevStandardsDir(args);

  // dev-standardsをsubmoduleとして持たないリポジトリ（dev-standards自身等）では
  // 除外対象が存在しないため、空文字列を返して呼び出し側（jscpdの-i構築）を
  // 素通りさせる
  if (!fs.existsSync(devStandardsDir) || !fs.existsSync(path.join(devStandardsDir, "sync-manifest.json"))) {
    process.stdout.write("");
    return;
  }

  const targets = listSyncManifestTargets(repoRoot, devStandardsDir);
  process.stdout.write(targets.join(","));
}

module.exports = { listSyncManifestTargets, expandSymlinkAllInDirTargets };

if (require.main === module) {
  main();
}
