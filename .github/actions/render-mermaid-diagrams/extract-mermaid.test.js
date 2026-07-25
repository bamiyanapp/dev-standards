"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { extractMermaidBlocks } = require("./extract-mermaid.js");

test("extractMermaidBlocks: returns an empty array when there are no mermaid fences", () => {
  assert.deepEqual(extractMermaidBlocks("# Title\n\nno diagrams here\n"), []);
});

test("extractMermaidBlocks: extracts a single mermaid block", () => {
  const markdown = "# Title\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nsome text after\n";
  assert.deepEqual(extractMermaidBlocks(markdown), ["graph TD\n  A --> B"]);
});

test("extractMermaidBlocks: extracts multiple mermaid blocks in document order", () => {
  const markdown = [
    "```mermaid",
    "graph TD",
    "  A --> B",
    "```",
    "",
    "other content",
    "",
    "```mermaid",
    "sequenceDiagram",
    "  Alice->>Bob: Hi",
    "```",
  ].join("\n");
  assert.deepEqual(extractMermaidBlocks(markdown), ["graph TD\n  A --> B", "sequenceDiagram\n  Alice->>Bob: Hi"]);
});

test("extractMermaidBlocks: ignores non-mermaid fenced code blocks", () => {
  const markdown = "```js\nconst x = 1;\n```\n\n```mermaid\ngraph TD\n  A --> B\n```\n";
  assert.deepEqual(extractMermaidBlocks(markdown), ["graph TD\n  A --> B"]);
});
