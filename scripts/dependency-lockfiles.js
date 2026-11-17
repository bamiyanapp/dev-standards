"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { diffPackageLocks, summarizeDependencyChanges } = require("./dependency-update-info.js");
const { diffInstallScripts } = require("./dependency-package-anomaly-info.js");

// ルート以外にpackage-lock.jsonを持つ構成（examinationは計13個）で、依存更新のRisk Summaryを動かす
// ための土台（issue #1368）。以前は、変更判定がルートのpackage-lock.jsonの完全一致だけで、
// app/top/package-lock.json等の変更は、CVE・install script・メンテナ変化のどの判定も受けずに
// マージされていた（examination#673: viteの更新、9アプリのlockfileを変更）。
//
// 既存のスクリプト（dependency-update-info.js等）は、base側とhead側のlockfileを1組受け取る作りのまま
// 変えない。ここでは、パスごとに呼んで、結果を連結する。同じパッケージの同じ更新が複数のlockfileに
// 現れる（vite更新が9アプリ同時）ため、`name@旧→新`で重複排除し、「影響するlockfile」を並べる。
// 重複排除しないと、コメントが9倍になる。

const LOCKFILE = /(^|\/)package-lock\.json$/;

/** 変更されたファイルの一覧から、package-lock.jsonのパスを返す（node_modules配下は除く）。重複なし・昇順 */
function findLockfilePaths(filenames) {
  return [...new Set(filenames.filter((f) => LOCKFILE.test(f) && !f.split("/").includes("node_modules")))].sort();
}

/** base側のlockfileを置いたファイル名（パスの/を__へ置き換える） */
function baseFileName(lockfilePath) {
  return lockfilePath.replace(/\//g, "__");
}

/**
 * パスごとの更新情報を、1つへ集約する。perLockfile: [{ path, changes }]（changesはdiffPackageLocksの結果）。
 * 同じ`name@旧→新`は1件にまとめ、lockfilesへ全パスを並べる。
 * direct・productionは、いずれかのlockfileで真なら真（「1箇所でも本番到達経路があれば対象」と同じ考え方）。
 */
function mergeChanges(perLockfile) {
  const merged = new Map();
  for (const { path: lockfile, changes } of perLockfile) {
    for (const change of changes) {
      const key = `${change.name}@${change.oldVersion}→${change.newVersion}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...change, lockfiles: [lockfile] });
      } else {
        existing.lockfiles.push(lockfile);
        existing.direct = existing.direct || change.direct;
        existing.production = existing.production || change.production;
      }
    }
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name) || String(a.newVersion).localeCompare(String(b.newVersion)));
}

/** install scriptの異常（dependency-package-anomaly-info.jsの結果）を、パスごとに集約する。同じ異常は1件にまとめる */
function mergeAnomalies(perLockfile) {
  const merged = new Map();
  for (const { path: lockfile, anomalies } of perLockfile) {
    for (const a of anomalies) {
      const key = `${a.name}@${a.version}:${a.kind}`;
      if (!merged.has(key)) merged.set(key, { ...a, lockfiles: [lockfile] });
      else merged.get(key).lockfiles.push(lockfile);
    }
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

// diff: 各パスのbase側（<baseDir>/<パスの/を__へ置き換えたもの>）とhead側（作業ツリーのパス）を比べる。
// base側が無い（このPRで新しく追加されたlockfile）ときは、空のlockfileとして扱う
function diffAll(baseDir, paths) {
  const empty = { packages: {} };
  const read = (file) => (fs.existsSync(file) ? readJson(file) : empty);
  return paths.map((p) => {
    const base = read(path.join(baseDir, baseFileName(p)));
    const head = read(p);
    return { path: p, changes: diffPackageLocks(base, head), anomalies: diffInstallScripts(base, head) };
  });
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "paths") {
    // 使い方: node dependency-lockfiles.js paths <変更されたファイル名のJSON配列のファイル>
    console.log(JSON.stringify(findLockfilePaths(readJson(args[0]))));
  } else if (command === "update-info" || command === "anomaly-info") {
    // 使い方: node dependency-lockfiles.js update-info|anomaly-info <baseDir> <パスのJSON配列のファイル>
    const results = diffAll(args[0], readJson(args[1]));
    if (command === "update-info") {
      const changes = mergeChanges(results);
      console.log(JSON.stringify({ summary: summarizeDependencyChanges(changes), changes, lockfiles: results.map((r) => r.path) }, null, 2));
    } else {
      console.log(JSON.stringify(mergeAnomalies(results), null, 2));
    }
  } else {
    console.error("Usage: node dependency-lockfiles.js paths <files.json> | update-info|anomaly-info <baseDir> <paths.json>");
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { findLockfilePaths, baseFileName, mergeChanges, mergeAnomalies, diffAll };
