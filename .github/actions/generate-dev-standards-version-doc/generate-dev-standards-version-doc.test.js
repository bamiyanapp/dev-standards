"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { collectDevStandardsVersions, renderSection, updateMarkdownContent } = require("./generate-dev-standards-version-doc.js");

function mkWorkflowsDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-standards-version-doc-"));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, "utf-8");
  }
  return dir;
}

test("collectDevStandardsVersions: 複数workflowファイルから重複排除しソート済みで返す", () => {
  const dir = mkWorkflowsDir({
    "ci.yml": "uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@v2.107.0\n",
    "cd.yml": "uses: bamiyanapp/dev-standards/.github/workflows/reusable-cd.yml@v2.107.0\n",
  });
  assert.deepEqual(collectDevStandardsVersions(dir), ["v2.107.0"]);
});

test("collectDevStandardsVersions: バージョン不一致を検知する", () => {
  const dir = mkWorkflowsDir({
    "ci.yml": "uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@v2.107.0\n",
    "cd.yml": "uses: bamiyanapp/dev-standards/.github/workflows/reusable-cd.yml@v2.106.1\n",
  });
  assert.deepEqual(collectDevStandardsVersions(dir), ["v2.106.1", "v2.107.0"]);
});

test("collectDevStandardsVersions: .yml/.yaml以外のファイルは対象外とする", () => {
  const dir = mkWorkflowsDir({
    "ci.yml": "uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@v2.107.0\n",
    "README.md": "bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@v9.9.9\n",
  });
  assert.deepEqual(collectDevStandardsVersions(dir), ["v2.107.0"]);
});

test("collectDevStandardsVersions: workflowsディレクトリが存在しない場合は空配列を返す", () => {
  assert.deepEqual(collectDevStandardsVersions("/no/such/dir"), []);
});

test("renderSection: dev-standards参照が無い場合", () => {
  assert.equal(renderSection([]), "現在、workflowファイルにdev-standards参照が見つかりませんでした。");
});

test("renderSection: 単一バージョンの場合", () => {
  assert.equal(renderSection(["v2.107.0"]), "現在採用しているdev-standardsのバージョンは**v2.107.0**です。");
});

test("renderSection: 複数バージョン（不一致）の場合は一覧で示す", () => {
  const result = renderSection(["v2.106.1", "v2.107.0"]);
  assert.match(result, /不一致/);
  assert.match(result, /v2\.106\.1/);
  assert.match(result, /v2\.107\.0/);
});

test("updateMarkdownContent: マーカー間を書き換える", () => {
  const markdown = ["# Title", "", "<!-- dev-standards-version:start -->", "古い内容", "<!-- dev-standards-version:end -->", ""].join("\n");
  const updated = updateMarkdownContent(markdown, "新しい内容");
  assert.match(updated, /新しい内容/);
  assert.doesNotMatch(updated, /古い内容/);
});

test("updateMarkdownContent: マーカーが無い場合は例外を投げる", () => {
  assert.throws(() => updateMarkdownContent("# Title", "本文"), /マーカーが見つかりませんでした/);
});
