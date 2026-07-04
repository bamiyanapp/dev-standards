#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const errors = [];

function parseFrontmatter(content, filePath) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    errors.push(`${filePath}: frontmatter（--- ... ---）が見つかりません`);
    return {};
  }
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const fieldMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (fieldMatch) {
      fields[fieldMatch[1]] = fieldMatch[2].trim();
    }
  }
  return fields;
}

function validateClaudeMd() {
  const filePath = path.join(repoRoot, "CLAUDE.md");
  if (!fs.existsSync(filePath)) {
    errors.push("CLAUDE.md が見つかりません");
    return;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  if (content.trim().length === 0) {
    errors.push("CLAUDE.md が空です");
    return;
  }
  if (!content.trimStart().startsWith("#")) {
    errors.push("CLAUDE.md はMarkdownの見出し（# ...）から始まっている必要があります");
  }
}

function validateCommitlintConfig() {
  const filePath = path.join(repoRoot, "commitlint.config.cjs");
  if (!fs.existsSync(filePath)) {
    errors.push("commitlint.config.cjs が見つかりません");
    return;
  }
  let config;
  try {
    config = require(filePath);
  } catch (error) {
    errors.push(`commitlint.config.cjs の読み込みに失敗しました: ${error.message}`);
    return;
  }
  if (!config || typeof config !== "object" || (!config.extends && !config.rules)) {
    errors.push("commitlint.config.cjs は extends または rules を含むオブジェクトをexportする必要があります");
  }
}

function validateSkills() {
  const skillsDir = path.join(repoRoot, ".claude", "skills");
  if (!fs.existsSync(skillsDir)) {
    errors.push(".claude/skills が見つかりません");
    return;
  }
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skillDirs = entries.filter((entry) => entry.isDirectory());
  if (skillDirs.length === 0) {
    errors.push(".claude/skills 配下にスキルディレクトリが1つもありません");
    return;
  }
  for (const entry of skillDirs) {
    const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) {
      errors.push(`.claude/skills/${entry.name}/SKILL.md が見つかりません`);
      continue;
    }
    const content = fs.readFileSync(skillMdPath, "utf-8");
    const fields = parseFrontmatter(content, skillMdPath);
    if (!fields.name) {
      errors.push(`${skillMdPath}: frontmatterに name がありません`);
    } else if (fields.name !== entry.name) {
      errors.push(
        `${skillMdPath}: frontmatterのname「${fields.name}」がディレクトリ名「${entry.name}」と一致しません`
      );
    }
    if (!fields.description) {
      errors.push(`${skillMdPath}: frontmatterに description がありません`);
    }
  }
}

validateClaudeMd();
validateCommitlintConfig();
validateSkills();

if (errors.length > 0) {
  console.error("検証エラー:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("CLAUDE.md / commitlint.config.cjs / .claude/skills/*/SKILL.md の検証に成功しました");
