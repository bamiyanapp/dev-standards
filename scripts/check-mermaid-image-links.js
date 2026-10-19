"use strict";

const fs = require("node:fs");
const path = require("node:path");

// issue #1101。複数mermaid図を持つドキュメントで、図を追加・削除した際に本文側の
// 画像埋め込みリンク（render-mermaid-diagrams複合アクションが公開するPNGへの
// `![...](...)`リンク）の更新を手動で行う運用（documentation-format-conventions.md
// 「enable_mermaid_renderとの関係」参照）は、見落としを構造的に生みやすい。
// render-mermaid.js（L81）の命名規則（1個のみ: <name>.png、複数個: <name>-N.png）
// に対応する画像リンクが本文中に存在するかを検証し、CIで検知できるようにする

// 本文(markdown)中に、baseNameに対応する画像リンク（`<baseName>.png`または
// `<baseName>-N.png`、URLクエリ文字列によるキャッシュバスティング付与も許容する）
// が何件出現するかを数える
function countImageLinksForFile(markdown, baseName) {
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`!\\[[^\\]]*\\]\\([^)]*\\/${escaped}(?:-\\d+)?\\.png(?:\\?[^)]*)?\\)`, "g");
  const matches = markdown.match(pattern);
  return matches ? matches.length : 0;
}

// manifest.json（render-mermaid-diagramsの出力、[{ sourceFile, index, fileName }]）を
// sourceFileごとのブロック数（エントリ数）に集計する
function countBlocksBySourceFile(manifestEntries) {
  const counts = new Map();
  for (const entry of manifestEntries) {
    counts.set(entry.sourceFile, (counts.get(entry.sourceFile) ?? 0) + 1);
  }
  return counts;
}

// 戻り値: [{ sourceFile, blockCount, linkCount }]（blockCount !== linkCountのものだけ）。
// readFileImpl: テスト用に差し替え可能なファイル読み込み実装（既定はfs.readFileSync）
function findMismatches(manifestEntries, { readFileImpl = (p) => fs.readFileSync(p, "utf-8") } = {}) {
  const blockCounts = countBlocksBySourceFile(manifestEntries);
  const mismatches = [];
  for (const [sourceFile, blockCount] of blockCounts) {
    const baseName = path.basename(sourceFile, path.extname(sourceFile));
    const markdown = readFileImpl(sourceFile);
    const linkCount = countImageLinksForFile(markdown, baseName);
    if (linkCount !== blockCount) {
      mismatches.push({ sourceFile, blockCount, linkCount });
    }
  }
  return mismatches;
}

function main() {
  const [, , manifestPath] = process.argv;
  if (!manifestPath) {
    console.error("Usage: node check-mermaid-image-links.js <manifest.json>");
    process.exitCode = 1;
    return;
  }

  const manifestEntries = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const mismatches = findMismatches(manifestEntries);

  if (mismatches.length === 0) {
    console.log("全ファイルでmermaidブロック数と画像埋め込みリンク数が一致しています。");
    return;
  }

  console.error("以下のファイルでmermaidブロック数と画像埋め込みリンク数が一致しません（issue #1101）:");
  for (const m of mismatches) {
    console.error(`  ${m.sourceFile}: mermaidブロック${m.blockCount}個 / 画像リンク${m.linkCount}個`);
  }
  console.error("後から図を追加・削除した際、本文側の画像埋め込みリンク（`![...](...)`）の追従を忘れていないか確認してください。");
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  countImageLinksForFile,
  countBlocksBySourceFile,
  findMismatches,
};
