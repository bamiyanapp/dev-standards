"use strict";

const fs = require("node:fs");

// issue #1368 段階2。定期スキャン（full-scan・deprecation-scan）のlockfile_path入力を、
// 改行区切りの複数行・行ごとのglob（`**`・`*`）に対応させる。
// 単一パス（従来の指定）はそのまま動く（後方互換）。
// node_modules配下は常に除外する。結果は重複除去して昇順に並べる

function expandLockfileSpec(spec, { cwd = process.cwd(), globSync = fs.globSync } = {}) {
  const lines = String(spec ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const found = new Set();
  for (const line of lines) {
    if (/[*?[\]{}]/.test(line)) {
      for (const p of globSync(line, { cwd, exclude: (name) => name === "node_modules" })) found.add(p);
    } else {
      found.add(line);
    }
  }
  return [...found].filter((p) => !p.split("/").includes("node_modules")).sort();
}

// 複数lockfileのscan結果を name@version 単位で1件へ統合する。
// perLockfile: [{ lockfile, results: [{ name, version, direct, ... }] }]
// directは「いずれかのlockfileで直接依存」ならtrue、lockfilesは検知元の一覧。
// devOnlyの扱い（1箇所でも本番到達経路があれば対象）は、各lockfileのスキャン側で
// devOnlyを除外済みのため、和集合を取ることで満たされる
function mergeScanResults(perLockfile) {
  const byKey = new Map();
  for (const { lockfile, results } of perLockfile) {
    for (const r of results) {
      const key = `${r.name}@${r.version}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.direct = existing.direct || r.direct;
        if (!existing.lockfiles.includes(lockfile)) existing.lockfiles.push(lockfile);
        if (r.vulnerabilities) {
          const ids = new Set(existing.vulnerabilities.map((v) => v.id));
          for (const v of r.vulnerabilities) if (!ids.has(v.id)) existing.vulnerabilities.push(v);
        }
      } else {
        byKey.set(key, { ...r, lockfiles: [lockfile] });
      }
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
  );
}

module.exports = { expandLockfileSpec, mergeScanResults };
