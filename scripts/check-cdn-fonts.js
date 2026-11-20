"use strict";

// 参照側リポジトリのHTML・CSS・JS/TSに、Google FontsのCDN（fonts.googleapis.com・fonts.gstatic.com）の
// 読み込みが残っていないかを検査する（issue #1511）。
// dev-standardsは、CDNを避けて、npmの@fontsourceで同梱することを推奨している
// （docs/render-blocking-resources-pattern.md）。同梱なら、CI・E2E・本番で同じフォントが使われ、
// 外部ドメインへの依存（CSP・到達性・遅延）も消える。
//
// 除外: 該当の行、または直前の行に、`dev-standards-allow-cdn-fonts`（理由を添える）と書く。
// テスト（*.test.*・*.spec.*）と、e2e・node_modules・dist等のディレクトリは、検査しない
// （E2Eが、外部ホストを遮断するために、ホスト名を書くことがあるため）。
//
// 使い方: node check-cdn-fonts.js <warn|fail> <パス>...（パスは、ファイルまたはディレクトリ）

const fs = require("node:fs");
const path = require("node:path");

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "out", ".dev-standards-actions", "dev-standards", "e2e", "test-results", "playwright-report"]);
const EXTENSIONS = new Set([".html", ".htm", ".css", ".scss", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte"]);
const HOST = /fonts\.(?:googleapis|gstatic)\.com/;
const ALLOW = "dev-standards-allow-cdn-fonts";

function isTarget(file) {
  if (!EXTENSIONS.has(path.extname(file))) return false;
  return !/\.(?:test|spec)\.[^.]+$/.test(path.basename(file));
}

function* walk(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (isTarget(target)) yield target;
    return;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(target, entry.name));
    } else if (isTarget(entry.name)) {
      yield path.join(target, entry.name);
    }
  }
}

// 1ファイルの本文から、CDNを参照している行（1始まり）を返す。許可の目印がある行は除く
function findCdnLines(text) {
  const lines = text.split("\n");
  const found = [];
  lines.forEach((line, i) => {
    if (!HOST.test(line)) return;
    if (line.includes(ALLOW) || (i > 0 && lines[i - 1].includes(ALLOW))) return;
    found.push(i + 1);
  });
  return found;
}

function check(targets) {
  const violations = [];
  let scanned = 0;
  for (const target of targets) {
    for (const file of walk(target)) {
      scanned++;
      for (const line of findCdnLines(fs.readFileSync(file, "utf8"))) violations.push({ file, line });
    }
  }
  return { violations, scanned };
}

function main() {
  const [mode, ...targets] = process.argv.slice(2);
  if (!["warn", "fail"].includes(mode) || targets.length === 0) {
    console.error("使い方: check-cdn-fonts.js <warn|fail> <パス>...");
    process.exit(2);
  }
  const { violations, scanned } = check(targets);
  console.log(`検査したファイル: ${scanned}件`);
  if (violations.length === 0) {
    console.log("Google FontsのCDN読み込みは、見つかりませんでした。");
    return;
  }
  for (const v of violations) {
    const message = "Google FontsのCDNを読み込んでいます。npmの@fontsourceで同梱してください（docs/render-blocking-resources-pattern.md）";
    console.log(`- ${v.file}:${v.line}: ${message}`);
    if (mode === "warn") console.log(`::warning file=${v.file},line=${v.line}::${message}`);
  }
  if (mode === "fail") process.exit(1);
  console.log("警告のみ（失敗にはしません）。移行後に、modeをfailへ切り替えてください。");
}

if (require.main === module) main();

module.exports = { check, findCdnLines, isTarget };
