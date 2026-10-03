"use strict";

const fs = require("node:fs");

// issue #646（OSS依存更新の自動安全判定基盤 Phase 1）Task A。
// Renovate PRのpackage-lock.json差分から、パッケージごとの更新情報
// （旧/新バージョン・update type・直接/間接依存か）を抽出する。
// 外部API（CVE/CVSS/EPSS/KEV）への問い合わせは後続タスクで別モジュールとして追加し、
// ここでは外部通信を伴わない「update type判定」「dependency変更数」の土台のみを扱う

// "^1.2.3"・"~1.2.3"・"1.2.3-beta.1"等のプレフィックス/プレリリース部を許容する簡易semver。
// 本格的なsemver仕様準拠（ビルドメタデータの扱い等）は不要で、
// major.minor.patchの3点比較ができれば十分なため、semverパッケージへの依存を追加しない
const SEMVER_PATTERN = /^[\^~]?v?(\d+)\.(\d+)\.(\d+)/;

function parseSemver(version) {
  if (typeof version !== "string") return null;
  const match = SEMVER_PATTERN.exec(version.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

// 戻り値: "major" | "minor" | "patch" | "other"
// "other"は、新旧いずれかがsemver形式として解釈できない場合（gitコミットハッシュ指定等）、
// およびバージョンが変化していない・ダウングレードの場合に使う
// （Risk判定側で「other」を保守的にHigh Risk相当として扱う想定、#647参照）
function classifyUpdateType(oldVersion, newVersion) {
  const oldSemver = parseSemver(oldVersion);
  const newSemver = parseSemver(newVersion);
  if (!oldSemver || !newSemver) return "other";

  if (newSemver.major > oldSemver.major) return "major";
  if (newSemver.major < oldSemver.major) return "other";

  if (newSemver.minor > oldSemver.minor) return "minor";
  if (newSemver.minor < oldSemver.minor) return "other";

  if (newSemver.patch > oldSemver.patch) return "patch";
  return "other";
}

// package-lock.json（npm lockfileVersion 3）のルートエントリ（packages[""]）から、
// 直接依存（dependencies/devDependencies/optionalDependencies/peerDependencies）の
// パッケージ名集合を取得する。npm workspaces構成（packages[""].workspaces、
// 例: ["frontend", "backend"]）の場合、各ワークスペースメンバー自身の
// package.jsonが宣言する依存はpackages[""]には現れず、packages["<ワークスペース
// パス>"]に現れる。これを合算しないと、workspaces構成の参照側リポジトリ
// （karuta等）では各ワークスペースの直接依存が常に「間接」と誤分類され、
// ブラスト半径判定（dependency-blast-radius.jsのchanges.filter((c) => c.direct)）が
// 直接依存の更新を一切対象にできなくなる（bamiyanapp/dev-standards#720）
function extractDirectDependencyNames(lockJson) {
  const root = lockJson?.packages?.[""] ?? {};
  const names = new Set();
  const addFieldsFrom = (entry) => {
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const name of Object.keys(entry[field] ?? {})) {
        names.add(name);
      }
    }
  };
  addFieldsFrom(root);
  for (const workspacePath of root.workspaces ?? []) {
    addFieldsFrom(lockJson?.packages?.[workspacePath] ?? {});
  }
  return names;
}

// package-lock.jsonの"node_modules/<name>"キーからパッケージ名を取り出す。
// スコープ付きパッケージ（"node_modules/@scope/name"）、ネストした依存
// （"node_modules/parent/node_modules/name"）のいずれも、末尾の実パッケージ名を返す
function packageNameFromKey(key) {
  const segments = key.split("node_modules/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last ? last.replace(/\/$/, "") : null;
}

// 2つのpackage-lock.json（更新前/更新後）を比較し、バージョンが変化した
// パッケージごとに { name, oldVersion, newVersion, updateType, direct } を返す。
// 追加・削除のみ（片方にしか存在しない）のパッケージは対象外とする
// （バージョン比較ができないため。dependency変更数の「追加/削除あり」自体は
// 呼び出し側でpackages差分の有無から別途判定できる）
function diffPackageLocks(oldLockJson, newLockJson) {
  const oldPackages = oldLockJson?.packages ?? {};
  const newPackages = newLockJson?.packages ?? {};
  const directNames = extractDirectDependencyNames(newLockJson);

  const changes = [];
  const seenNames = new Set();
  for (const [key, newEntry] of Object.entries(newPackages)) {
    if (key === "") continue;
    const oldEntry = oldPackages[key];
    if (!oldEntry || !newEntry) continue;
    if (oldEntry.version === newEntry.version) continue;

    const name = packageNameFromKey(key);
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);

    changes.push({
      name,
      oldVersion: oldEntry.version ?? null,
      newVersion: newEntry.version ?? null,
      updateType: classifyUpdateType(oldEntry.version, newEntry.version),
      direct: directNames.has(name),
    });
  }
  return changes.sort((a, b) => a.name.localeCompare(b.name));
}

// diffPackageLocksの結果から、Risk Summary生成（後続タスク）に渡す集計値を作る
function summarizeDependencyChanges(changes) {
  const summary = {
    total: changes.length,
    direct: 0,
    transitive: 0,
    byUpdateType: { major: 0, minor: 0, patch: 0, other: 0 },
  };
  for (const change of changes) {
    if (change.direct) summary.direct += 1;
    else summary.transitive += 1;
    summary.byUpdateType[change.updateType] += 1;
  }
  return summary;
}

function readJsonFile(path) {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

function main() {
  const [, , oldLockPath, newLockPath] = process.argv;
  if (!oldLockPath || !newLockPath) {
    console.error("Usage: node dependency-update-info.js <old-package-lock.json> <new-package-lock.json>");
    process.exitCode = 1;
    return;
  }

  const changes = diffPackageLocks(readJsonFile(oldLockPath), readJsonFile(newLockPath));
  const summary = summarizeDependencyChanges(changes);
  console.log(JSON.stringify({ summary, changes }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  parseSemver,
  classifyUpdateType,
  extractDirectDependencyNames,
  packageNameFromKey,
  diffPackageLocks,
  summarizeDependencyChanges,
};
