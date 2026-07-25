"use strict";

// Markdown本文から```mermaid ... ```フェンスの中身を順番に抽出する純粋関数。
// 1ファイルに複数のmermaidブロックがあってもよい（出現順の配列で返す）
function extractMermaidBlocks(markdown) {
  const pattern = /```mermaid\r?\n([\s\S]*?)```/g;
  const blocks = [];
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push(match[1].replace(/\r?\n$/, ""));
  }
  return blocks;
}

module.exports = { extractMermaidBlocks };
