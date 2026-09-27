"use strict";

// site/apps.jsonから生成される内容と、実際にコミットされているREADME.mdの
// 「参照側アプリ一覧」セクションが一致しているかを検証する（issue #636）。
// site/apps.jsonを更新したのに`npm run generate:apps`を実行し忘れた場合、
// このテストが失敗して気づけるようにする。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  loadApps,
  renderReadmeAppsSection,
  README_START_MARKER,
  README_END_MARKER,
} = require("../site/scripts/generate.js");

const repoRoot = path.resolve(__dirname, "..");

function extractReadmeSection(readmeContent) {
  const startIndex = readmeContent.indexOf(README_START_MARKER);
  const endIndex = readmeContent.indexOf(README_END_MARKER);
  assert.notStrictEqual(startIndex, -1, `README.mdに${README_START_MARKER}が見つかりません`);
  assert.notStrictEqual(endIndex, -1, `README.mdに${README_END_MARKER}が見つかりません`);
  return readmeContent.slice(startIndex + README_START_MARKER.length, endIndex).trim();
}

test("README.mdの参照側アプリ一覧は site/apps.json から生成した内容と一致する", () => {
  const apps = loadApps();
  const expected = renderReadmeAppsSection(apps).trim();

  const readmeContent = fs.readFileSync(path.join(repoRoot, "README.md"), "utf-8");
  const actual = extractReadmeSection(readmeContent);

  assert.strictEqual(
    actual,
    expected,
    "README.mdの参照側アプリ一覧がsite/apps.jsonの内容と一致しません。`npm run generate:apps`を実行してコミットしてください。"
  );
});
