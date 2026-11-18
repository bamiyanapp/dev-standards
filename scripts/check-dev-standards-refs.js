#!/usr/bin/env node
"use strict";

// dev-standards#1144・#1459: `uses: bamiyanapp/dev-standards/.github/workflows/reusable-X.yml@<ref>`と
// `self_ref: <ref>`（issue #1071で導入したself_refパターン）が、呼び出し元リポジトリ内で食い違って
// いないかを検証する。例えば、一部のjobだけバージョンを上げ忘れる、self_refだけ更新を忘れる、
// といったズレを検知する。Renovateは`uses:`行と`self_ref:`行を別々のPRとして提案しうるため、
// 片方だけ先にマージされるとずれる（bamiyanapp/shock-lab#451・karuta#1924）。
//
// 標準モジュール（fs・path）だけで動く。check-workflows.js（actionlintのnpmパッケージが必要）と違い、
// 参照側にその依存が無くても、submodule経由でそのまま実行できる（reusable-ci.ymlのstandards-checkが使う）。
// 使い方: node dev-standards/scripts/check-dev-standards-refs.js [リポジトリのルート]（省略時はカレント）

const fs = require("fs");
const path = require("path");

const USES_REF_PATTERN = /dev-standards\/\.github\/workflows\/reusable-[\w.-]+\.ya?ml@([\w./-]+)/g;
const SELF_REF_PATTERN = /self_ref:\s*["']?([\w./-]+)["']?/g;

/** YAMLの行末コメント（空白の後ろの#、または行頭の#）を取り除く。コメント内の`self_ref:`の誤検知を避ける */
function stripComment(line) {
  return line.replace(/(^|\s)#.*$/, "$1");
}

function stripComments(content) {
  return content.split("\n").map(stripComment).join("\n");
}

/**
 * workflowsDir内のfilesを読み、uses:とself_ref:のバージョンが揃っているかを検証する。
 * 揃っていなければ、ファイル名・種別・各バージョンを含むメッセージの配列を返す（揃っていれば空）。
 */
function checkVersionConsistency(files, workflowsDir, repoRoot) {
  const refs = []; // { ref, file, kind }

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    const relativePath = path.relative(repoRoot, filePath);
    const content = stripComments(fs.readFileSync(filePath, "utf8"));

    for (const match of content.matchAll(USES_REF_PATTERN)) {
      refs.push({ ref: match[1], file: relativePath, kind: "uses" });
    }
    for (const match of content.matchAll(SELF_REF_PATTERN)) {
      refs.push({ ref: match[1], file: relativePath, kind: "self_ref" });
    }
  }

  const distinctRefs = [...new Set(refs.map((r) => r.ref))];
  if (distinctRefs.length <= 1) {
    return [];
  }

  const details = refs.map((r) => `  - ${r.file}: ${r.kind} = ${r.ref}`).join("\n");
  return [
    `dev-standardsへの参照バージョンが揃っていません（${distinctRefs.length}種類: ${distinctRefs.join(", ")}）。\n${details}`,
  ];
}

/** repoRoot/.github/workflows/配下の.yml・.yamlの名前（ソート済み）。ディレクトリが無ければ空 */
function listWorkflowFiles(workflowsDir) {
  if (!fs.existsSync(workflowsDir)) return [];
  return fs
    .readdirSync(workflowsDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

function main() {
  const repoRoot = path.resolve(process.argv[2] || process.cwd());
  const workflowsDir = path.join(repoRoot, ".github", "workflows");
  const files = listWorkflowFiles(workflowsDir);
  if (files.length === 0) {
    console.log(".github/workflows にワークフローファイルが無いため、参照バージョンの検証をスキップします");
    return;
  }

  const issues = checkVersionConsistency(files, workflowsDir, repoRoot);
  for (const issue of issues) {
    console.error(issue);
  }
  if (issues.length > 0) {
    console.error(
      "\n`uses:`のタグと`self_ref:`を同じ値に揃えてください。Renovateが片方だけ更新した可能性があります（renovate.jsonのpackageRulesで同じPRへグループ化できます）。"
    );
    process.exit(1);
  }
  console.log(`dev-standardsへの参照バージョンは揃っています（${files.length}件のワークフローファイルを検証）`);
}

module.exports = { checkVersionConsistency, listWorkflowFiles, stripComment };

if (require.main === module) {
  main();
}
