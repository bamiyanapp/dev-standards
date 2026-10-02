"use strict";

const fs = require("node:fs");
const path = require("node:path");

// issue #646（OSS依存更新の自動安全判定基盤 Phase 1）Task G（後半: GitHub Actions
// バージョン更新のリスク分類対応）。
//
// このOrgでは`uses: owner/repo@vX.Y.Z`形式のreusable workflow/action参照タグも
// Renovateが更新PRを作る実質的な依存である（issue #645「8-2」参照）。npmパッケージの
// semver（package-lock.json）とは別に、ワークフローファイル・composite action定義
// （.github/workflows/*.yml・.github/actions/*/action.yml）内の`uses:`行の
// バージョン変化を検出・分類する。
//
// GitHub Actionsのタグ付け慣習はnpmのような厳密なsemverではなく、`v7`のような
// メジャーバージョンのみのタグが広く使われる（例: actions/checkout@v7）。そのため
// dependency-update-info.jsのclassifyUpdateTypeはそのまま使えず、コンポーネント数が
// 不揃いでも比較できる専用のパーサーを用意する

// "owner/repo@ref"・"owner/repo/path/to/action@ref"のいずれにも対応する。
// クォート（'...'・"..."）で囲まれている場合は取り除く
const USES_PATTERN = /uses:\s*['"]?([^\s'"@]+)@([^\s'"]+)['"]?/g;

// YAML（ワークフロー・action.yml）の内容から`uses:`行を抽出する。
// 同一ファイル内で同じactionが複数回参照されることがあるため、呼び出し側で
// 重複排除・突合を行いやすいよう、出現順の配列としてそのまま返す
function extractActionReferences(yamlContent) {
  const refs = [];
  for (const match of yamlContent.matchAll(USES_PATTERN)) {
    refs.push({ action: match[1], ref: match[2] });
  }
  return refs;
}

// "v7"・"v7.1"・"v7.1.2"・"7.1.2"（vプレフィックス無し）を許容する。
// コミットSHA・ブランチ名等、数値から始まらない参照はnullを返す
function parseVersionComponents(ref) {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(ref ?? "");
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: match[2] != null ? Number(match[2]) : null,
    patch: match[3] != null ? Number(match[3]) : null,
  };
}

// 戻り値: "major" | "minor" | "patch" | "other"
// GitHub Actionsのタグはmajorのみ（v7）・major.minor（v7.1）・フルsemver（v7.1.2）が
// 混在するため、新旧で比較可能なコンポーネントが無い場合は"other"とする
function classifyActionRefUpdate(oldRef, newRef) {
  const oldV = parseVersionComponents(oldRef);
  const newV = parseVersionComponents(newRef);
  if (!oldV || !newV) return "other";

  if (newV.major !== oldV.major) {
    return newV.major > oldV.major ? "major" : "other";
  }
  if (oldV.minor == null || newV.minor == null) return "other";
  if (newV.minor !== oldV.minor) {
    return newV.minor > oldV.minor ? "minor" : "other";
  }
  if (oldV.patch == null || newV.patch == null) return "other";
  if (newV.patch !== oldV.patch) {
    return newV.patch > oldV.patch ? "patch" : "other";
  }
  return "other"; // 完全に同一バージョン（diffとして渡される想定では通常発生しない）
}

// 2つのYAML内容（更新前/更新後の同一ファイル）を比較し、refが変化した
// actionごとに{ action, oldRef, newRef, updateType }を返す。同一ファイル内で
// 同じactionが複数回・異なるrefで参照されるケース（通常は無い）は、出現順で
// 最後に見つかったものを採用する単純化を行っている
function diffActionReferences(oldContent, newContent) {
  const oldRefs = new Map(extractActionReferences(oldContent).map((r) => [r.action, r.ref]));
  const newRefs = new Map(extractActionReferences(newContent).map((r) => [r.action, r.ref]));

  const changes = [];
  for (const [action, newRef] of newRefs) {
    const oldRef = oldRefs.get(action);
    if (oldRef == null || oldRef === newRef) continue;
    changes.push({ action, oldRef, newRef, updateType: classifyActionRefUpdate(oldRef, newRef) });
  }
  return changes.sort((a, b) => a.action.localeCompare(b.action));
}

// CI組み込み用CLIエントリポイント（issue #666）。
// baseDir: 変更前のワークフロー・actionファイルを、リポジトリルートからの相対パスを
//   保ったまま配置したディレクトリ（reusable-ci.ymlの`git show <base_sha>:<path>`で生成）。
//   base時点でファイルが存在しなかった場合（新規追加ファイル）はdiff対象外とする
// changedFiles: 変更された.github/workflows/*.yml・.github/actions/*/action.ymlの
//   リポジトリルートからの相対パスの配列
function collectActionUpdates(baseDir, changedFiles) {
  const allChanges = [];
  for (const file of changedFiles) {
    const baseFilePath = path.join(baseDir, file);
    if (!fs.existsSync(baseFilePath) || !fs.existsSync(file)) continue;
    const oldContent = fs.readFileSync(baseFilePath, "utf-8");
    const newContent = fs.readFileSync(file, "utf-8");
    for (const change of diffActionReferences(oldContent, newContent)) {
      allChanges.push({ file, ...change });
    }
  }
  return allChanges;
}

function main() {
  const [, , baseDir, changedFilesJsonPath] = process.argv;
  if (!baseDir || !changedFilesJsonPath) {
    console.error("Usage: node github-actions-update-info.js <base-dir> <changed-files.json>");
    process.exitCode = 1;
    return;
  }
  const changedFiles = JSON.parse(fs.readFileSync(changedFilesJsonPath, "utf-8"));
  console.log(JSON.stringify(collectActionUpdates(baseDir, changedFiles), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  extractActionReferences,
  parseVersionComponents,
  classifyActionRefUpdate,
  diffActionReferences,
  collectActionUpdates,
};
