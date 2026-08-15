"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { extractMermaidBlocks } = require("./extract-mermaid.js");

// GitHub上でmermaidがネイティブレンダリングされない場面（PR差分ビュー、API経由での
// ファイル取得等、issue bamiyanapp/karuta#824参照）向けに、ドキュメント中の
// ```mermaid```ブロックを事前に画像化しておく。ソース（Markdown内のmermaid記法）は
// このアクション自身では一切書き換えず、レンダリング結果とその一覧（manifest.json）を
// output-dir配下に生成するだけに留める
//
// 出力形式はPNG（ラスター画像）を使う。当初はSVGだったが、GitHubモバイルアプリの
// 画像タップ拡大表示がSVGに対応しておらずエラーになる問題（issue
// bamiyanapp/karuta#837）があり、モバイルの標準的な画像ビューアとの互換性が高い
// PNGへ切り替えた

// mmdc（内部でPuppeteer/Chromiumを起動する）が稀に応答不能になり、execFileSyncの
// timeout未指定（＝無期限待機）のままだとジョブ全体がGitHub Actionsのjobデフォルト
// タイムアウト（360分）まで停止し続ける事故が実際に発生した
// （bamiyanapp/dev-standards#223）。1図あたりのレンダリングが数分を超えることは
// 想定していないため、余裕を持たせつつ確実に検知できる値としてtimeoutを設定する
const RENDER_TIMEOUT_MS = 120_000;

function renderBlock(mermaidSource, outputImagePath, actionDir) {
  const tmpMmdPath = `${outputImagePath}.mmd`;
  fs.writeFileSync(tmpMmdPath, mermaidSource, "utf-8");
  try {
    execFileSync(
      path.join(actionDir, "node_modules", ".bin", "mmdc"),
      ["-i", tmpMmdPath, "-o", outputImagePath, "-p", path.join(actionDir, "puppeteer-config.json")],
      { stdio: "inherit", timeout: RENDER_TIMEOUT_MS }
    );
  } finally {
    fs.unlinkSync(tmpMmdPath);
  }
}

function run() {
  const markdownPaths = (process.env.MARKDOWN_PATHS || "")
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const outputDir = process.env.OUTPUT_DIR;
  const actionDir = __dirname;

  fs.mkdirSync(outputDir, { recursive: true });

  const manifest = [];
  for (const markdownPath of markdownPaths) {
    const markdown = fs.readFileSync(markdownPath, "utf-8");
    const blocks = extractMermaidBlocks(markdown);
    const baseName = path.basename(markdownPath, path.extname(markdownPath));

    blocks.forEach((block, index) => {
      const fileName = blocks.length > 1 ? `${baseName}-${index + 1}.png` : `${baseName}.png`;
      const outputImagePath = path.join(outputDir, fileName);
      renderBlock(block, outputImagePath, actionDir);
      manifest.push({ sourceFile: markdownPath, index: index + 1, fileName });
    });
  }

  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Rendered ${manifest.length} mermaid diagram(s) into ${outputDir}`);
}

if (require.main === module) {
  run();
}

module.exports = { renderBlock, RENDER_TIMEOUT_MS };
