"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseConsumerRepositoriesTable,
  listConsumerRepositories,
  countConsumerRepositories,
} = require("./consumer-repositories.js");

const SAMPLE_MARKDOWN = [
  "# 参照側リポジトリ一覧",
  "",
  "説明文。",
  "",
  "## 一覧",
  "",
  "| リポジトリ | 参照方法 | 備考 |",
  "|---|---|---|",
  "| [bamiyanapp/dev-standards](https://github.com/bamiyanapp/dev-standards) | 自己参照（dogfooding） | 本リポジトリ自身 |",
  "| [bamiyanapp/karuta](https://github.com/bamiyanapp/karuta) | submodule + reusable workflow | カルタアプリ |",
  "| [bamiyanapp/Camp-Stock](https://github.com/bamiyanapp/Camp-Stock) | submodule + reusable workflow | キャンプ道具管理アプリ |",
  "",
  "## 一覧の更新",
  "",
  "新しい参照側リポジトリで利用を開始した場合を考える。",
].join("\n");

test("parseConsumerRepositoriesTable: 一覧セクションのテーブル行をパースする", () => {
  const rows = parseConsumerRepositoriesTable(SAMPLE_MARKDOWN);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    repo: "bamiyanapp/dev-standards",
    referenceMethod: "自己参照（dogfooding）",
    note: "本リポジトリ自身",
  });
  assert.equal(rows[1].repo, "bamiyanapp/karuta");
  assert.equal(rows[2].repo, "bamiyanapp/Camp-Stock");
});

test("parseConsumerRepositoriesTable: 「## 一覧の更新」セクション等、テーブル以外の文章は含めない", () => {
  const rows = parseConsumerRepositoriesTable(SAMPLE_MARKDOWN);
  assert.ok(rows.every((r) => !r.repo.includes("新しい参照側")));
});

test("listConsumerRepositories: dev-standards自身（自己参照行）を除外する", () => {
  const repos = listConsumerRepositories(SAMPLE_MARKDOWN);
  assert.deepEqual(
    repos.map((r) => r.repo),
    ["bamiyanapp/karuta", "bamiyanapp/Camp-Stock"],
  );
});

test("countConsumerRepositories: 自己参照を除いた件数を返す", () => {
  assert.equal(countConsumerRepositories(SAMPLE_MARKDOWN), 2);
});

test("parseConsumerRepositoriesTable: テーブルが無いMarkdownでは空配列を返す", () => {
  assert.deepEqual(parseConsumerRepositoriesTable("# タイトルのみ\n\n本文。\n"), []);
});

test("実際のdocs/consumer-repositories.mdをパースできる（回帰確認）", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const markdown = fs.readFileSync(path.join(__dirname, "..", "docs", "consumer-repositories.md"), "utf-8");
  const repos = listConsumerRepositories(markdown);
  assert.ok(repos.length > 0, "実際のドキュメントから1件以上の参照側リポジトリを取得できること");
  assert.ok(repos.some((r) => r.repo === "bamiyanapp/karuta"));
  assert.ok(!repos.some((r) => r.repo === "bamiyanapp/dev-standards"));
});
