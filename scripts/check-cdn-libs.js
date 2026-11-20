"use strict";

// 参照側リポジトリのHTMLに、CDN経由で読み込むライブラリ（<script src>・<link href>）が無いかを警告する
// （issue #1372）。方針は、禁止して、npmで同梱することである（ユーザー判断、2026-11-20）。
// HTMLに直接書いたCDNのURLは、Renovate・依存更新のRisk判定・定期フルスキャンのどれにも掛からない。
//   - バージョンが古くなっても、更新PRが作られない
//   - 既知の脆弱性が公開されても、検知されない
//   - integrity属性（SRI）が無いと、CDN側で内容が差し替えられても、ブラウザが検知できない
// Google FontsのCDNは、別の検査（check-cdn-fonts.js、issue #1511）が見る。
//
// - 警告にとどめ、終了コードは常に0。既存の参照側が、段階的に移行できるようにする
// - 除外: 該当の行、または直前の行に、`dev-standards-allow-cdn`（理由を添える）と書く
// - HTMLだけを見る。テスト・e2e・node_modules・dist等のディレクトリは、見ない
//
// 使い方: node check-cdn-libs.js   （リポジトリのルートで実行）

const fs = require("node:fs");
const path = require("node:path");

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "out", "dev-standards", "e2e", "test-results", "ios", ".serverless"]);
const CDN_HOSTS = ["cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "code.jquery.com", "stackpath.bootstrapcdn.com", "maxcdn.bootstrapcdn.com", "cdn.skypack.dev", "esm.sh", "ajax.googleapis.com"];
const ALLOW = "dev-standards-allow-cdn";

// 1ファイル（HTML）の本文から、CDNを読み込むタグを返す: [{ line, url, hasIntegrity }]
function findCdnTags(text) {
  const lines = text.split("\n");
  const found = [];
  const tagPattern = /<(script|link)\b[^>]*>/gis;
  let match;
  while ((match = tagPattern.exec(text)) !== null) {
    const tag = match[0];
    const urlMatch = /\b(?:src|href)\s*=\s*["']?(https?:)?\/\/([^"'\s>/]+)([^"'\s>]*)/i.exec(tag);
    if (!urlMatch || !CDN_HOSTS.includes(urlMatch[2].toLowerCase())) continue;
    const line = text.slice(0, match.index).split("\n").length;
    const prev = lines[line - 2] || "";
    if (lines[line - 1].includes(ALLOW) || prev.includes(ALLOW)) continue;
    found.push({ line, url: `//${urlMatch[2]}${urlMatch[3]}`, hasIntegrity: /\bintegrity\s*=/i.test(tag) });
  }
  return found;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else if (/\.html?$/i.test(entry.name)) {
      yield path.join(dir, entry.name);
    }
  }
}

function describe(tag) {
  const sri = tag.hasIntegrity ? "" : "。integrity（SRI）も指定されていません";
  return `HTMLがCDNからライブラリを読み込んでいます（${tag.url}）。npmで同梱してください。Renovateと脆弱性スキャンの対象になります${sri}（docs/render-blocking-resources-pattern.md）`;
}

function main() {
  let scanned = 0;
  const findings = [];
  for (const file of walk(process.cwd())) {
    scanned++;
    for (const tag of findCdnTags(fs.readFileSync(file, "utf8"))) findings.push({ file: path.relative(process.cwd(), file), ...tag });
  }
  console.log(`検査したHTML: ${scanned}件`);
  if (findings.length === 0) {
    console.log("CDN経由のライブラリ読み込みは、見つかりませんでした。");
    return;
  }
  for (const f of findings) console.log(`::warning file=${f.file},line=${f.line}::${describe(f)}`);
}

if (require.main === module) main();

module.exports = { findCdnTags, CDN_HOSTS };
