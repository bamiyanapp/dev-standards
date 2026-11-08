"use strict";

const fs = require("node:fs");
const path = require("node:path");

// issue #646（OSS依存更新の自動安全判定基盤 Phase 1）Task G（前半: ファンアウト判定）。
// docs/consumer-repositories.md（参照側リポジトリの正）を解析し、dev-standardsを
// 参照している既知のリポジトリ数（ファンアウト数）を取得する。
//
// issue #645「8-1」参照: dev-standardsは複数リポジトリから参照される共有基盤であり、
// dev-standards自身の依存更新は、単一リポジトリ内で完結する更新と異なり
// 「影響リポジトリ数」という次元を持つ。パッケージ単位で「このパッケージの挙動が
// 実際に参照側へ波及するか」を判定することはPhase 1のスコープでは難しいため、
// 「dev-standardsリポジトリ自身への変更である」という事実だけを根拠に、
// 既知の参照側リポジトリ数を一律で注記する（判定の単純さを優先し、より精密な
// 影響範囲特定は見送った）

const DEFAULT_DOC_PATH = path.join(__dirname, "..", "docs", "consumer-repositories.md");

// docs/consumer-repositories.mdの"## 一覧"セクションにあるMarkdownテーブルを
// パースする。ヘッダ行・区切り行（|---|...|）は除外する
function parseConsumerRepositoriesTable(markdown) {
  const lines = markdown.split("\n");
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    if (!line.trim().startsWith("|")) {
      if (inTable) break; // テーブルの終端
      continue;
    }
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    if (/^リポジトリ$/.test(cells[0])) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (/^:?-+:?$/.test(cells[0])) continue; // 区切り行（| --- | :--- | ---: |等）

    const linkMatch = /\[([^\]]+)\]/.exec(cells[0]);
    const repo = linkMatch ? linkMatch[1] : cells[0];
    rows.push({ repo, referenceMethod: cells[1] ?? "", note: cells[2] ?? "" });
  }
  return rows;
}

// dev-standards自身の行（自己参照）を除いた、実際の参照側リポジトリ一覧を返す
function listConsumerRepositories(markdown) {
  return parseConsumerRepositoriesTable(markdown).filter((row) => row.repo !== "bamiyanapp/dev-standards");
}

function countConsumerRepositories(markdown) {
  return listConsumerRepositories(markdown).length;
}

// issue #1330。changes（dependency-update-info.jsの出力）が全てproduction: falseの
// 場合、ファンアウト件数を0扱いにする。dev-standards自身のdevDependency（テスト専用
// 等、実例: jsdomとその間接依存）の更新は、参照側リポジトリがdev-standardsの
// npm依存を一切継承しない（scripts/・workflowファイルのsymlink/参照のみ）ため、
// 参照側には影響しない。changesが空（GitHub Actions参照の更新のみ等）の場合は
// 判定材料が無いため、安全側に倒して除外しない（従来通りcountをそのまま使う）
function isProductionImpacting(changes) {
  if (!changes || changes.length === 0) return true;
  return changes.some((c) => c.production !== false);
}

// Risk Summaryへ追記するファンアウト注記のMarkdown断片を生成する。
// count === 0（一覧の解析に失敗した・一覧が空等）の場合は、誤って「影響なし」と
// 伝えないよう注記自体を省略する（呼び出し側でnullチェックする想定）
function renderFanOutNote(count) {
  if (count === 0) return null;
  // issue #1323: 適用リスク（このPRを適用すること自体の危険度）の判定材料にのみ
  // 使われる情報のため、適用リスク見出しの下位セクションとして#### にする
  return (
    "#### ファンアウト\n\n" +
    `⚠️ この変更は複数リポジトリから参照される**dev-standards自体**への更新です。` +
    `既知の参照側リポジトリが**${count}件**あります` +
    "（[docs/consumer-repositories.md](https://github.com/bamiyanapp/dev-standards/blob/main/docs/consumer-repositories.md)参照）。" +
    "影響範囲が広い可能性があるため、通常より慎重な確認を推奨します。\n"
  );
}

// issue #647（Phase 2 Task 2）。dependency-risk-classifier.js（Risk Engine）が
// ファンアウト件数を判定材料として使うため、GITHUB_OUTPUT経由でも件数を渡す
// （Markdown注記本文はdependency-risk-classifier.jsにとって不要で、数値のみで十分）
function main() {
  const docPath = process.argv[2] ?? DEFAULT_DOC_PATH;
  const dependencyUpdateInfoPath = process.argv[3];
  const markdown = fs.readFileSync(docPath, "utf-8");
  let count = countConsumerRepositories(markdown);
  if (dependencyUpdateInfoPath && fs.existsSync(dependencyUpdateInfoPath)) {
    const { changes } = JSON.parse(fs.readFileSync(dependencyUpdateInfoPath, "utf-8"));
    if (!isProductionImpacting(changes)) count = 0;
  }
  const note = renderFanOutNote(count);
  if (note) console.log(note);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `count=${count}\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseConsumerRepositoriesTable,
  listConsumerRepositories,
  countConsumerRepositories,
  isProductionImpacting,
  renderFanOutNote,
};
