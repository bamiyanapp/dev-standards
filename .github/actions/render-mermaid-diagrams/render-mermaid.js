"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { extractMermaidBlocks } = require("./extract-mermaid.js");

// GitHub上でmermaidがネイティブレンダリングされない場面（PR差分ビュー、API経由での
// ファイル取得等、issue bamiyanapp/karuta#824参照）向けに、ドキュメント中の
// ```mermaid```ブロックを事前にSVG画像化しておく。ソース（Markdown内のmermaid記法）は
// このアクション自身では一切書き換えず、レンダリング結果（SVG）とその一覧（manifest.json）を
// output-dir配下に生成するだけに留める

function renderBlock(mermaidSource, outputSvgPath, actionDir) {
  const tmpMmdPath = `${outputSvgPath}.mmd`;
  fs.writeFileSync(tmpMmdPath, mermaidSource, "utf-8");
  try {
    execFileSync(
      path.join(actionDir, "node_modules", ".bin", "mmdc"),
      ["-i", tmpMmdPath, "-o", outputSvgPath, "-p", path.join(actionDir, "puppeteer-config.json")],
      { stdio: "inherit" }
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
      const fileName = blocks.length > 1 ? `${baseName}-${index + 1}.svg` : `${baseName}.svg`;
      const outputSvgPath = path.join(outputDir, fileName);
      renderBlock(block, outputSvgPath, actionDir);
      manifest.push({ sourceFile: markdownPath, index: index + 1, fileName });
    });
  }

  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Rendered ${manifest.length} mermaid diagram(s) into ${outputDir}`);
}

if (require.main === module) {
  run();
}

module.exports = { renderBlock };
