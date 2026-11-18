"use strict";

// カバレッジに含まれていないソースファイル（未計測ファイル）を検知する（issue #1461）。
// Vitestの既定は、テストから読み込まれたファイルだけを集計する。テストの無いファイルは0%としても
// 数えられず、一覧からも消える。このため、閾値を満たしていても、中核のコードが計測外のままになる
// （bamiyanapp/shock-lab#450: 約330行のVehicleCanvas.tsx等が計測外のまま、Statements 92%と表示された）。
// 分母の急変検知（coverage-anomaly.js、#1366）は、この逆方向（テスト対象であるべきファイルが
// レポートに無い）を検知できない。
// globの展開は、新しい依存を足さず、Nodeのバージョン（fs.globSync・path.matchesGlobは新しい版のみ）にも
// 依存しないよう、本ファイルの簡易なglob→正規表現変換で行う。

const fs = require("fs");
const path = require("path");
const { relativeKey } = require("./coverage-anomaly.js");

const SKIPPED_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

/** `{a,b}`の展開（入れ子なし）。`src/**\/*.{ts,tsx}` → ['src/**\/*.ts', 'src/**\/*.tsx'] */
function expandBraces(glob) {
  const match = glob.match(/\{([^{}]*)\}/);
  if (!match) return [glob];
  return match[1].split(",").flatMap((alt) => expandBraces(glob.slice(0, match.index) + alt + glob.slice(match.index + match[0].length)));
}

/** 1つのglob（`**`・`*`・`?`のみ対応。`{}`は事前に展開する）を正規表現へ変換する */
function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      // `**/`は0個以上のディレクトリ、それ以外の`**`は任意の文字列
      if (glob[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (ch === "*") {
      source += "[^/]*";
    } else if (ch === "?") {
      source += "[^/]";
    } else {
      source += ch.replace(/[.+^$()|[\]\\{}]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/** カンマ区切りのglobのうち、`{}`の中のカンマは区切りとして扱わずに分割する */
function splitGlobList(value) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of String(value || "")) {
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function makeMatcher(globList) {
  const regexps = splitGlobList(globList).flatMap(expandBraces).map(globToRegExp);
  return (file) => regexps.some((regexp) => regexp.test(file));
}

/** cwd配下のファイルを、cwdからの相対パスで再帰的に列挙する（node_modules等は辿らない） */
function listFiles(cwd, dir = "") {
  const entries = fs.readdirSync(path.join(cwd, dir), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : listFiles(cwd, rel);
    return entry.isFile() ? [rel] : [];
  });
}

/**
 * sourceGlobsに一致し、ignoreGlobsに一致しないファイルのうち、サマリーにキーが無いものを返す。
 * 副作用はlistFilesの注入で差し替えられる（テスト用）。
 */
function findUnmeasuredFiles(summaryJson, { cwd = process.cwd(), sourceGlobs, ignoreGlobs = "", files = listFiles(cwd) } = {}) {
  const isSource = makeMatcher(sourceGlobs);
  const isIgnored = makeMatcher(ignoreGlobs);
  const measured = new Set(Object.keys(summaryJson).filter((key) => key !== "total").map((key) => relativeKey(key, cwd)));
  return files.filter((file) => isSource(file) && !isIgnored(file) && !measured.has(file)).sort();
}

function countLines(file, cwd) {
  try {
    return fs.readFileSync(path.join(cwd, file), "utf-8").split("\n").length;
  } catch {
    return 0;
  }
}

/** Job Summary用の表。未計測ファイルが無ければ空文字 */
function describeUnmeasured(unmeasured, label, cwd = process.cwd()) {
  if (unmeasured.length === 0) return "";
  const rows = unmeasured.map((file) => `| ${file} | ${countLines(file, cwd)} |`).join("\n");
  return (
    `\n### カバレッジに含まれていないソースファイル（${label}）: ${unmeasured.length}件\n\n| File | 行数 |\n|---|---|\n${rows}\n\n` +
    "Vitestの`coverage.include`に`src/**/*.{ts,tsx}`を指定してください。テストの無いファイルも0%として計測されます。\n"
  );
}

module.exports = { expandBraces, globToRegExp, splitGlobList, makeMatcher, listFiles, findUnmeasuredFiles, describeUnmeasured };
