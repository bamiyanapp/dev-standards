"use strict";

// 参照側のESLint設定が、docs/code-quality-conventions.mdの必須ルールを満たしているかを検査する
// （issue #1421）。ESLint設定は参照側が個別に持つため、規約へルールを足しても、参照側へ届かない。
// `npx eslint --print-config <代表ファイル>`の出力を見るため、設定ファイルの書き方に依存しない。
// 必須ルールの一覧は、scripts/eslint-required-rules.jsonの1か所で管理する。
//
// 使い方: node check-eslint-rules.js <warn|fail> <package-dir> [代表ファイル]
// 代表ファイルを省略すると、git ls-filesから、src/配下の最初のJS・TSファイルを選ぶ。
// ESLint本体は、package-dirにインストール済みのものを使う（npx eslint）。

const { execFileSync } = require("node:child_process");
const path = require("node:path");
const required = require("./eslint-required-rules.json");

// severityが、error（2または"error"）か。warn（1・"warn"）やoff（0・"off"）は、満たさない
function isError(entry) {
  const level = Array.isArray(entry) ? entry[0] : entry;
  return level === 2 || level === "error";
}

function isWarn(entry) {
  const level = Array.isArray(entry) ? entry[0] : entry;
  return level === 1 || level === "warn";
}

// config: eslint --print-configの出力（{ rules: { name: [severity, ...] } }）。戻り値: 満たしていないルールの配列
function evaluateRules(config, rules = required.rules) {
  const enabled = config?.rules || {};
  const missing = [];
  for (const rule of rules) {
    const ok = rule.prefix
      ? Object.entries(enabled).some(([name, entry]) => name.startsWith(rule.prefix) && isError(entry))
      : (rule.anyOf || []).some((name) => enabled[name] !== undefined && isError(enabled[name]));
    if (!ok) {
      const warnOnly = rule.prefix
        ? Object.entries(enabled).some(([name, entry]) => name.startsWith(rule.prefix) && isWarn(entry))
        : (rule.anyOf || []).some((name) => enabled[name] !== undefined && isWarn(enabled[name]));
      missing.push({ id: rule.id, doc: rule.doc, reason: warnOnly ? "error重要度ではありません（warnなど）" : "有効になっていません" });
    }
  }
  return missing;
}

function pickRepresentativeFile(cwd) {
  const files = execFileSync("git", ["ls-files", "--", "src"], { cwd, encoding: "utf8" }).split("\n").filter(Boolean);
  return files.find((f) => /\.(?:[cm]?[jt]sx?)$/.test(f) && !/\.(?:test|spec)\./.test(f)) || null;
}

function main() {
  const [mode, dir, fileArg] = process.argv.slice(2);
  if (!["warn", "fail"].includes(mode) || !dir) {
    console.error("使い方: check-eslint-rules.js <warn|fail> <package-dir> [代表ファイル]");
    process.exit(2);
  }
  const cwd = path.resolve(dir);
  const file = fileArg || pickRepresentativeFile(cwd);
  if (!file) {
    console.log(`${dir}にsrc/配下のJS・TSファイルが無いため、検査をスキップします。`);
    return;
  }
  let config;
  try {
    config = JSON.parse(execFileSync("npx", ["--no-install", "eslint", "--print-config", file], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  } catch (error) {
    console.log(`::warning::ESLintの設定を読めませんでした（${dir}、${file}）: ${String(error.message).split("\n")[0]}`);
    return;
  }
  const missing = evaluateRules(config);
  console.log(`検査したファイル: ${dir}/${file}`);
  if (missing.length === 0) {
    console.log("規約の必須ルールは、すべてerror重要度で有効です。");
    return;
  }
  for (const m of missing) {
    console.log(`- ${m.id}（${m.doc}）: ${m.reason}`);
    if (mode === "warn") console.log(`::warning::ESLintの必須ルール${m.id}が、${m.reason}（docs/code-quality-conventions.md）`);
  }
  console.log("既にしきい値を超えるファイルがある場合は、現状値を上限にして、段階的に下げてください（docs/code-quality-conventions.md）。");
  if (mode === "fail") process.exit(1);
  console.log("警告のみ（失敗にはしません）。是正後に、modeをfailへ切り替えてください。");
}

if (require.main === module) main();

module.exports = { evaluateRules, isError };
