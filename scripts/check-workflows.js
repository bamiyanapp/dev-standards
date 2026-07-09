#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { createLinter } = require("actionlint");

const repoRoot = path.resolve(__dirname, "..");
const workflowsDir = path.join(repoRoot, ".github", "workflows");

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

  const lint = await createLinter();
  let totalIssues = 0;

  for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    const relativePath = path.relative(repoRoot, filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const results = lint(content, relativePath);

    for (const result of results) {
      console.error(`${relativePath}:${result.line}:${result.column}: [${result.kind}] ${result.message}`);
    }
    totalIssues += results.length;
  }

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
