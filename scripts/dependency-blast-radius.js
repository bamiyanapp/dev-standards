"use strict";

const fs = require("node:fs");

// issue #689。dependency-cruiser（architecture-checkで導入済み）の出力
// （`--output-type json`）から、npm依存エッジ（dependencyTypesに"npm"を含むもの）を
// 抽出し、パッケージ名→import元ファイル一覧の逆引きマップ（ブラスト半径）を作る。
// dependency-cruiserはnode_modulesの実インストールに関わらず、import記法
// （相対パスでもNode coreモジュールでもない）だけでdependencyTypesをnpmと分類する
// （architecture-check jobがnpm install無しで既に動作していることからも実証済み）ため、
// このjobでも追加のnpm installは不要（実機確認済み）

// "@scope/pkg/sub/path" → "@scope/pkg"、"lodash/debounce" → "lodash"
function extractPackageName(moduleSpecifier) {
  if (moduleSpecifier.startsWith("@")) {
    return moduleSpecifier.split("/").slice(0, 2).join("/");
  }
  return moduleSpecifier.split("/")[0];
}

// depcruiseJson: dependency-cruiser --output-type jsonの出力（{ modules: [...] }）
// 戻り値: { [packageName]: string[]（import元ファイルパス、重複排除・ソート済み） }
function buildBlastRadiusMap(depcruiseJson) {
  const map = {};
  for (const mod of depcruiseJson.modules ?? []) {
    for (const dep of mod.dependencies ?? []) {
      if (!dep.dependencyTypes?.includes("npm")) continue;
      const packageName = extractPackageName(dep.module);
      if (!map[packageName]) map[packageName] = new Set();
      map[packageName].add(mod.source);
    }
  }
  return Object.fromEntries(Object.entries(map).map(([name, files]) => [name, [...files].sort()]));
}

// importerPath（プロダクトコードのファイルパス）が、宣言済みのcriticalPaths
// （パスのprefix文字列。globは使わない。シンプルさを優先した初期スコープ、issue #689）
// のいずれかに該当するか判定する
function matchesCriticalPath(importerPath, criticalPaths) {
  return criticalPaths.some((prefix) => importerPath.startsWith(prefix));
}

// changedDirectPackageNames: 今回の更新で変更された直接依存のパッケージ名一覧。
// 間接依存は対象外（issue #689の初期スコープ）
// 戻り値: { hasCriticalPathImpact: boolean, hits: [{ packageName, file, criticalPath }] }
function findCriticalPathImpact({ blastRadiusMap, changedDirectPackageNames, criticalPaths }) {
  const hits = [];
  for (const packageName of changedDirectPackageNames) {
    const importers = blastRadiusMap[packageName] ?? [];
    for (const importer of importers) {
      if (!matchesCriticalPath(importer, criticalPaths)) continue;
      const criticalPath = criticalPaths.find((prefix) => importer.startsWith(prefix));
      hits.push({ packageName, file: importer, criticalPath });
    }
  }
  return { hasCriticalPathImpact: hits.length > 0, hits };
}

// 重要パスの宣言・保守はプロダクト側（各参照側リポジトリ）の責務。ファイルが無い・
// 壊れている場合は空配列（＝昇格なし、現状どおりの判定）へ安全側にフォールバックする
function loadCriticalPaths(criticalPathsFilePath) {
  if (!criticalPathsFilePath || !fs.existsSync(criticalPathsFilePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(criticalPathsFilePath, "utf-8"));
    return Array.isArray(parsed.criticalPaths) ? parsed.criticalPaths : [];
  } catch {
    return [];
  }
}

function main() {
  const [, , depcruiseJsonPath, updateInfoPath, criticalPathsFilePath] = process.argv;
  if (!depcruiseJsonPath || !updateInfoPath) {
    console.error(
      "Usage: node dependency-blast-radius.js <depcruise-output.json> <dependency-update-info.json> [critical-paths.json]",
    );
    process.exitCode = 1;
    return;
  }

  const depcruiseJson = JSON.parse(fs.readFileSync(depcruiseJsonPath, "utf-8"));
  const { changes } = JSON.parse(fs.readFileSync(updateInfoPath, "utf-8"));
  const changedDirectPackageNames = changes.filter((c) => c.direct).map((c) => c.name);
  const criticalPaths = loadCriticalPaths(criticalPathsFilePath);

  const blastRadiusMap = buildBlastRadiusMap(depcruiseJson);
  const result = findCriticalPathImpact({ blastRadiusMap, changedDirectPackageNames, criticalPaths });

  console.log(JSON.stringify(result, null, 2));

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `hit=${result.hasCriticalPathImpact}\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  extractPackageName,
  buildBlastRadiusMap,
  matchesCriticalPath,
  findCriticalPathImpact,
  loadCriticalPaths,
};
