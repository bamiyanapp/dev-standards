"use strict";

const fs = require("node:fs");
const path = require("node:path");

// 複数のlockfileを持つ構成で、ブラスト半径の判定（dependency-cruiserの実行）をする対象を決める（issue #1381）。
// 変更された「直接依存」を持つlockfileのディレクトリだけを対象にする。9アプリ分の依存インストールを避け、
// 実行時間を抑えるため。間接依存だけの更新は、ブラスト半径の判定対象外（issue #689の初期スコープ）。
//
// dependency-update-info.jsonのchanges[]は、dependency-lockfiles.jsのmergeChangesの結果で、
// lockfiles[]（影響するlockfileのパス）を持つ。directは、いずれかのlockfileで直接依存なら真である。
// そのため、同じパッケージが、あるアプリでは直接、別のアプリでは間接のときは、両方を対象にする（安全側）。
//
// 戻り値: { dir, target }[]。dirは依存をインストールする場所、targetはdependency-cruiserに渡す場所。
// targetは、`<dir>/src`があればそれ、無ければdir。ルートのlockfileは、`src`があればそれを対象にする
// （ルート全体を渡すと、他のアプリの配下まで解析してしまうため）。

function lockfileDir(lockfilePath) {
  const dir = path.posix.dirname(lockfilePath);
  return dir === "." ? "." : dir;
}

function selectTargets(updateInfo, exists = (p) => fs.existsSync(p)) {
  const dirs = new Set();
  for (const change of updateInfo.changes ?? []) {
    if (!change.direct) continue;
    for (const lockfile of change.lockfiles ?? []) dirs.add(lockfileDir(lockfile));
  }
  const targets = [];
  for (const dir of [...dirs].sort()) {
    const src = dir === "." ? "src" : `${dir}/src`;
    if (exists(src)) targets.push({ dir, target: src });
    else if (dir !== "." && exists(dir)) targets.push({ dir, target: dir });
  }
  return targets;
}

function main() {
  const [file] = process.argv.slice(2);
  if (!file) {
    console.error("Usage: node dependency-blast-radius-dirs.js <dependency-update-info.json>");
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(selectTargets(JSON.parse(fs.readFileSync(file, "utf-8"))), null, 2));
}

if (require.main === module) main();

module.exports = { selectTargets, lockfileDir };
