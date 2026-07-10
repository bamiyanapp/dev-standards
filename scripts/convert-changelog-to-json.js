#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// バージョンヘッダーのマッチング (例: ## [1.1.0](...) (2025-01-04) または # 1.1.0 (2025-01-04))
const VERSION_HEADER_REGEX = /^#+ \[?([0-9.]+)\]?(?:\(.*\))? \(([0-9-]+)\)/gm;

// タグのコミット日時（実際のリリース時刻）を取得する。タグがまだ
// 存在しない/取得できない場合（リリース対象バージョン自身の実行時等）はnullを返す。
// 呼び出し側でCHANGELOG.mdの日付（日付のみ、時刻情報を持たない）にフォールバックする。
function getReleaseDate(version) {
  let dateStr;
  try {
    dateStr = execSync(`git log -1 --format=%ai v${version}`, { stdio: "pipe" }).toString().trim();
  } catch {
    // ignore
  }

  if (!dateStr) {
    try {
      dateStr = execSync(`git log -1 --format=%ai ${version}`, { stdio: "pipe" }).toString().trim();
    } catch {
      // ignore
    }
  }

  if (!dateStr) return null;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const H = String(date.getHours()).padStart(2, "0");
  const M = String(date.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${d} ${H}:${M}`;
}

function parseChangelogToEntries(content, resolveReleaseDate) {
  const regex = new RegExp(VERSION_HEADER_REGEX.source, VERSION_HEADER_REGEX.flags);
  const matches = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    matches.push({
      version: match[1],
      date: match[2],
      index: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  const entries = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    const start = current.endIndex;
    const end = next ? next.index : content.length;
    const body = content.substring(start, end).trim();
    const gitDate = resolveReleaseDate(current.version);

    entries.push({
      version: current.version,
      // タグのコミット時刻が取得できない場合、実際には無い時刻情報を「00:00」として
      // 補ってしまうと実時刻と見分けがつかなくなるため、日付のみを表示する
      date: gitDate || current.date.replace(/-/g, "/"),
      body,
    });
  }
  return entries;
}

function main() {
  const changelogPath = path.resolve(process.cwd(), process.env.CHANGELOG_SOURCE_PATH || "CHANGELOG.md");
  const outputPath = path.resolve(
    process.cwd(),
    process.env.CHANGELOG_JSON_OUTPUT_PATH || "frontend/src/changelog.json"
  );

  try {
    if (!fs.existsSync(changelogPath)) {
      console.log("CHANGELOG.md not found, skipping JSON generation.");
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, "[]");
      return;
    }

    const content = fs.readFileSync(changelogPath, "utf8");
    const entries = parseChangelogToEntries(content, getReleaseDate);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2));
    console.log(`Changelog converted to JSON: ${entries.length} entries`);
  } catch (error) {
    console.error("Error converting changelog:", error);
    process.exit(1);
  }
}

module.exports = { parseChangelogToEntries, getReleaseDate };

if (require.main === module) {
  main();
}
