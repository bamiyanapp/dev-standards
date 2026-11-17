"use strict";

// カバレッジの計測対象（分母）の急変と、想定外のパスの混入を検知する（issue #1366）。
// 率（%）だけを見ると、計測対象が意図せず広がっても、率が下がった回だけが「閾値割れ」として現れる。
// bamiyanapp/examination#1360では、entryFilterの穴で他アプリのコードが混入し、Branchesの分母が
// 通常約123から8177へ跳ね上がった。原因の特定に約1週間かかり、再実行で流していた。
// 副作用（fs・process.exit）を持たない純粋関数として、判定ロジックだけをテストできるようにする。

const path = require("path");

const METRICS = ["lines", "statements", "functions", "branches"];

// json-summaryのファイルのキーを、working-directoryからの相対パスにそろえる（絶対パスで出る場合がある）
function relativeKey(file, cwd) {
  const normalized = String(file).replace(/\\/g, "/");
  if (!path.isAbsolute(normalized)) return normalized.replace(/^\.\//, "");
  const rel = path.relative(cwd, normalized).replace(/\\/g, "/");
  return rel;
}

/**
 * 集計対象に、想定外のパスが含まれているかを調べる。
 * node_modulesを含むパスと、allowedPrefixes（既定: src/）以外で始まるパスを返す。
 * 1件でもあれば、警告する（#1360は、これがあれば初回で原因が分かった）。
 */
function findUnexpectedPaths(summaryJson, { cwd = process.cwd(), allowedPrefixes = ["src/"] } = {}) {
  const unexpected = [];
  for (const file of Object.keys(summaryJson)) {
    if (file === "total") continue;
    const rel = relativeKey(file, cwd);
    const inNodeModules = rel.includes("node_modules/");
    const outside = rel.startsWith("../") || !allowedPrefixes.some((p) => rel.startsWith(p));
    if (inNodeModules || outside) unexpected.push({ file: rel, reason: inNodeModules ? "node_modules" : "想定外のパス" });
  }
  return unexpected;
}

/** ファイル別の内訳を、分母（statements）の大きい順に、上位limit件だけ表にする。残りは件数で示す */
function buildFileBreakdown(summaryJson, label, { limit = 20 } = {}) {
  const rows = Object.entries(summaryJson)
    .filter(([file]) => file !== "total")
    .map(([file, c]) => ({ file, statements: c.statements?.total ?? 0, branches: c.branches?.total ?? 0, pct: c.statements?.pct ?? 0 }))
    .sort((a, b) => b.statements - a.statements || b.branches - a.branches);
  if (rows.length === 0) return "";
  let md = `\n### 集計対象のファイル（${label}）: ${rows.length}件\n\n| File | statements（分母） | branches（分母） | statements率 |\n|---|---|---|---|\n`;
  for (const r of rows.slice(0, limit)) md += `| ${r.file} | ${r.statements} | ${r.branches} | ${r.pct}% |\n`;
  if (rows.length > limit) md += `\n他${rows.length - limit}件\n`;
  return md;
}

/**
 * 各指標の分母（total）を、ベースラインと比べる。
 * warnRatio（既定2）倍超または1/warnRatio未満で警告、failRatio（既定5）倍超または1/failRatio未満で失敗。
 * ベースラインが無い、または分母が0のときは、その指標の判定をスキップする。
 * PRがテスト対象のソースを大きく増減させた場合は、正当な変化である。そのため、警告を主にする。
 */
function compareTotals(current, baseline, { warnRatio = 2, failRatio = 5 } = {}) {
  const results = [];
  if (!baseline) return results;
  for (const metric of METRICS) {
    const cur = current?.[metric]?.total;
    const base = baseline?.[metric]?.total;
    if (typeof cur !== "number" || typeof base !== "number" || base === 0 || cur === 0) continue;
    const ratio = cur / base;
    const worst = ratio >= 1 ? ratio : 1 / ratio;
    const level = worst > failRatio ? "fail" : worst > warnRatio ? "warn" : "ok";
    results.push({ metric, current: cur, baseline: base, ratio, level });
  }
  return results;
}

function describeComparison(results) {
  const flagged = results.filter((r) => r.level !== "ok");
  if (flagged.length === 0) return "";
  let md = "\n### 計測対象（分母）の急変\n\n| Metric | ベースライン | 今回 | 倍率 |\n|---|---|---|---|\n";
  for (const r of flagged) md += `| ${r.metric} | ${r.baseline} | ${r.current} | ${r.ratio.toFixed(2)}倍（${r.level === "fail" ? "失敗" : "警告"}） |\n`;
  md += "\n正当な変化（テスト対象のソースを大きく増減させた）の場合は、PRにその旨を書いてください。mainへマージすれば、ベースラインが更新されます。\n";
  return md;
}

module.exports = { findUnexpectedPaths, buildFileBreakdown, compareTotals, describeComparison, relativeKey };
