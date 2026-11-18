#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { createLinter } = require("actionlint");
const { checkVersionConsistency } = require("./check-dev-standards-refs.js");

// 参照側リポジトリ（karuta等）はdev-standardsをsubmodule経由で取り込み、
// `node dev-standards/scripts/check-workflows.js`として本スクリプトを実行する
// （reusable-ci.yml内のコメント「参照側にcheck-workflows.js相当のチェックを
// 追加する」を参照）。__dirname基準（dev-standards/scripts/からの相対パス）で
// repoRootを決めていたため、参照側から実行してもdev-standards自身の
// .github/workflows/しか検証されず、参照側（karuta）自身のワークフロー
// ファイルが一度も検証されない不具合があった。カレントディレクトリ
// （省略時）、または明示的に渡された第1引数のディレクトリを対象にする
const repoRoot = path.resolve(process.argv[2] || process.cwd());
const workflowsDir = path.join(repoRoot, ".github", "workflows");

// dev-standards#1144・#1459: uses:とself_ref:のバージョン一致の検証は、actionlintに依存しない
// check-dev-standards-refs.jsへ切り出した（reusable-ci.ymlのstandards-checkが参照側で実行する）。

async function main() {
  if (!fs.existsSync(workflowsDir)) {
    console.log(".github/workflows が見つかりません（チェック対象なし）");
    return;
  }

  const files = fs
    .readdirSync(workflowsDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();

  if (files.length === 0) {
    console.log(".github/workflows 配下にワークフローファイルがありません");
    return;
  }

  let totalIssues = 0;

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    const relativePath = path.relative(repoRoot, filePath);
    const content = fs.readFileSync(filePath, "utf8");
    // ファイルごとに新しいlinterインスタンスを作る。同一インスタンスで複数ファイルを
    // 連続してlintすると、ローカルの相対パス参照（`uses: ./...`）を含むワークフローの
    // 組み合わせによってWASM内部状態が壊れ2件目以降がクラッシュする既知の問題があるため。
    const lint = await createLinter();
    const results = lint(content, relativePath);

    for (const result of results) {
      console.error(`${relativePath}:${result.line}:${result.column}: [${result.kind}] ${result.message}`);
    }
    totalIssues += results.length;
  }

  const versionIssues = checkVersionConsistency(files, workflowsDir, repoRoot);
  for (const issue of versionIssues) {
    console.error(issue);
  }
  totalIssues += versionIssues.length;

  if (totalIssues > 0) {
    console.error(`\nactionlint: ${totalIssues}件の問題が見つかりました`);
    process.exit(1);
  }

  console.log(`actionlint: ${files.length}件のワークフローファイルを検証し、問題は見つかりませんでした`);
}

main().catch((error) => {
  console.error("actionlintの実行に失敗しました:", error);
  process.exit(1);
});
