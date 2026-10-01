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

// Risk Summaryへ追記するファンアウト注記のMarkdown断片を生成する。
// count === 0（一覧の解析に失敗した・一覧が空等）の場合は、誤って「影響なし」と
// 伝えないよう注記自体を省略する（呼び出し側でnullチェックする想定）
function renderFanOutNote(count) {
  if (count === 0) return null;
  return (
    "### ファンアウト\n\n" +
    `⚠️ この変更は複数リポジトリから参照される**dev-standards自体**への更新です。` +
    `既知の参照側リポジトリが**${count}件**あります` +
    "（[docs/consumer-repositories.md](https://github.com/bamiyanapp/dev-standards/blob/main/docs/consumer-repositories.md)参照）。" +
    "影響範囲が広い可能性があるため、通常より慎重な確認を推奨します。\n"
  );
}

function main() {
  const docPath = process.argv[2] ?? DEFAULT_DOC_PATH;
  const markdown = fs.readFileSync(docPath, "utf-8");
  const count = countConsumerRepositories(markdown);
  const note = renderFanOutNote(count);
  if (note) console.log(note);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseConsumerRepositoriesTable,
  listConsumerRepositories,
  countConsumerRepositories,
  renderFanOutNote,
};
