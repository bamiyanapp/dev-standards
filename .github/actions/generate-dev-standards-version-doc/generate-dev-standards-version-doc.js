"use strict";

const fs = require("node:fs");
const path = require("node:path");

const START_MARKER = "<!-- dev-standards-version:start -->";
const END_MARKER = "<!-- dev-standards-version:end -->";

// issue #1197。karuta issue #1898/#1899の実装（scripts/docs/generate-dev-standards-version.js）を
// 一般化したもの。dev-standardsを参照する各リポジトリが、採用中のdev-standardsバージョンを
// 個別に調べる必要がないよう、`.github/workflows/*.yml`内の
// `uses: bamiyanapp/dev-standards/...@vX.Y.Z`参照を走査し、採用バージョンを収集する
function collectDevStandardsVersions(workflowsDir) {
  const versions = new Set();
  if (!fs.existsSync(workflowsDir)) return [];
  const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  for (const file of files) {
    const content = fs.readFileSync(path.join(workflowsDir, file), "utf-8");
    const matches = content.matchAll(/bamiyanapp\/dev-standards\/[^@\s]+@(v[0-9]+\.[0-9]+\.[0-9]+)/g);
    for (const match of matches) {
      versions.add(match[1]);
    }
  }
  return [...versions].sort();
}

// dev-standards#1144と同種の問題（バージョン不一致）をここでも検知する。
// 全ファイルで同一バージョンに揃っていることが前提の運用のため、
// 不一致を検知した場合はその旨を明示し、特定のバージョンに丸めない
function renderSection(versions) {
  if (versions.length === 0) {
    return "現在、workflowファイルにdev-standards参照が見つかりませんでした。";
  }
  if (versions.length === 1) {
    return `現在採用しているdev-standardsのバージョンは**${versions[0]}**です。`;
  }
  return [
    "⚠️ workflowファイル内でdev-standards参照バージョンが不一致です。以下のいずれかに揃える対応が必要です。",
    "",
    ...versions.map((v) => `- ${v}`),
  ].join("\n");
}

function updateMarkdownContent(markdownContent, sectionBody) {
  const startIndex = markdownContent.indexOf(START_MARKER);
  const endIndex = markdownContent.indexOf(END_MARKER);
  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`対象Markdownに${START_MARKER}〜${END_MARKER}のマーカーが見つかりませんでした。`);
  }
  const before = markdownContent.slice(0, startIndex + START_MARKER.length);
  const after = markdownContent.slice(endIndex);
  return `${before}\n${sectionBody}\n${after}`;
}

function main() {
  const [, , markdownPathArg, workflowsDirArg] = process.argv;
  const markdownPath = markdownPathArg || "README.md";
  const workflowsDir = workflowsDirArg || ".github/workflows";

  const versions = collectDevStandardsVersions(workflowsDir);
  const sectionBody = renderSection(versions);
  const markdownContent = fs.readFileSync(markdownPath, "utf-8");
  const updated = updateMarkdownContent(markdownContent, sectionBody);
  fs.writeFileSync(markdownPath, updated, "utf-8");

  console.log(`Updated ${markdownPath} (dev-standards version: ${versions.length === 1 ? versions[0] : versions.join(", ") || "不明"})`);
}

if (require.main === module) {
  main();
}

module.exports = {
  collectDevStandardsVersions,
  renderSection,
  updateMarkdownContent,
};
