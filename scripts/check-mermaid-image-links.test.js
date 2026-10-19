"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { countImageLinksForFile, countBlocksBySourceFile, findMismatches } = require("./check-mermaid-image-links.js");

test("countImageLinksForFile: 単一図（無番号）のリンクを数える", () => {
  const markdown = "![Architecture (rendered)](https://raw.githubusercontent.com/x/y/docs-diagrams/latest/foo.png)";
  assert.equal(countImageLinksForFile(markdown, "foo"), 1);
});

test("countImageLinksForFile: 複数図（連番）のリンクを数える", () => {
  const markdown = [
    "![A (rendered)](https://raw.githubusercontent.com/x/y/docs-diagrams/latest/foo-1.png)",
    "![B (rendered)](https://raw.githubusercontent.com/x/y/docs-diagrams/latest/foo-2.png)",
  ].join("\n\n");
  assert.equal(countImageLinksForFile(markdown, "foo"), 2);
});

test("countImageLinksForFile: 無関係な他ファイルのリンクはカウントしない", () => {
  const markdown = "![other](https://raw.githubusercontent.com/x/y/docs-diagrams/latest/foobar.png)";
  assert.equal(countImageLinksForFile(markdown, "foo"), 0);
});

test("countImageLinksForFile: クエリ文字列付き（キャッシュバスティング）のリンクも数える", () => {
  const markdown = "![A](https://raw.githubusercontent.com/x/y/docs-diagrams/latest/foo-1.png?v=abc123)";
  assert.equal(countImageLinksForFile(markdown, "foo"), 1);
});

test("countImageLinksForFile: リンクが無ければ0を返す", () => {
  assert.equal(countImageLinksForFile("本文のみ", "foo"), 0);
});

test("countBlocksBySourceFile: sourceFileごとのエントリ数を集計する", () => {
  const manifest = [
    { sourceFile: "docs/a.md", index: 1, fileName: "a.png" },
    { sourceFile: "docs/b.md", index: 1, fileName: "b-1.png" },
    { sourceFile: "docs/b.md", index: 2, fileName: "b-2.png" },
  ];
  const counts = countBlocksBySourceFile(manifest);
  assert.equal(counts.get("docs/a.md"), 1);
  assert.equal(counts.get("docs/b.md"), 2);
});

test("findMismatches: ブロック数とリンク数が一致する場合は空配列を返す", () => {
  const manifest = [
    { sourceFile: "docs/a.md", index: 1, fileName: "a.png" },
    { sourceFile: "docs/b.md", index: 1, fileName: "b-1.png" },
    { sourceFile: "docs/b.md", index: 2, fileName: "b-2.png" },
  ];
  const files = {
    "docs/a.md": "![A](https://x/docs-diagrams/latest/a.png)",
    "docs/b.md": "![B1](https://x/docs-diagrams/latest/b-1.png)\n![B2](https://x/docs-diagrams/latest/b-2.png)",
  };
  const mismatches = findMismatches(manifest, { readFileImpl: (p) => files[p] });
  assert.deepEqual(mismatches, []);
});

test("findMismatches: ブロック数より画像リンク数が少ないファイルを検出する（issue #1101の再現ケース）", () => {
  const manifest = [
    { sourceFile: "docs/cicd-pipeline-specification.md", index: 1, fileName: "cicd-pipeline-specification-1.png" },
    { sourceFile: "docs/cicd-pipeline-specification.md", index: 2, fileName: "cicd-pipeline-specification-2.png" },
    { sourceFile: "docs/cicd-pipeline-specification.md", index: 3, fileName: "cicd-pipeline-specification-3.png" },
  ];
  const files = {
    "docs/cicd-pipeline-specification.md": "![Architecture](https://x/docs-diagrams/latest/cicd-pipeline-specification.png)",
  };
  const mismatches = findMismatches(manifest, { readFileImpl: (p) => files[p] });
  // stale（無番号のまま残った旧リンク）も`<baseName>.png`としてマッチするため1件と数える。
  // 3個のブロックに対し1件しかないため不一致として検出される
  assert.deepEqual(mismatches, [
    { sourceFile: "docs/cicd-pipeline-specification.md", blockCount: 3, linkCount: 1 },
  ]);
});

test("findMismatches: 複数ファイルのうち不一致のものだけを返す", () => {
  const manifest = [
    { sourceFile: "docs/a.md", index: 1, fileName: "a.png" },
    { sourceFile: "docs/b.md", index: 1, fileName: "b.png" },
  ];
  const files = {
    "docs/a.md": "![A](https://x/docs-diagrams/latest/a.png)",
    "docs/b.md": "リンク無し",
  };
  const mismatches = findMismatches(manifest, { readFileImpl: (p) => files[p] });
  assert.deepEqual(mismatches, [{ sourceFile: "docs/b.md", blockCount: 1, linkCount: 0 }]);
});
