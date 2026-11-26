"use strict";

// デプロイ後に、本番のURLへリクエストし、セキュリティヘッダーを実測する（issue #1615）。
// 静的検査（check-security-headers.js）は、IaCの関連付けを見る。本スクリプトは、実際のレスポンスを見る。
// 関連付けの付け漏れ（動的エンドポイントの別ビヘイビア等）や、デプロイの失敗を検知する。
//
// 使い方: node verify-security-headers.js <warn|fail> <URL>...
// warn: 不足があっても終了コード0（::warningを出す）。fail: 不足があれば終了コード1。
// 結果は、標準出力と、GITHUB_STEP_SUMMARY（あれば）へ表で出す。

const fs = require("node:fs");

const HSTS_MIN_MAX_AGE = 15552000; // 180日

// headers: { 小文字のヘッダー名: 値 }。戻り値: 不足の説明の配列（空なら全て満たす）
function evaluate(headers) {
  const problems = [];
  const csp = headers["content-security-policy"];
  if (!csp) problems.push("Content-Security-Policyが無い");
  const hsts = headers["strict-transport-security"];
  if (!hsts) {
    problems.push("Strict-Transport-Securityが無い");
  } else {
    const m = /max-age=(\d+)/i.exec(hsts);
    if (!m || Number(m[1]) < HSTS_MIN_MAX_AGE) problems.push(`Strict-Transport-Securityのmax-ageが${HSTS_MIN_MAX_AGE}秒未満`);
  }
  if ((headers["x-content-type-options"] ?? "").toLowerCase() !== "nosniff") problems.push("X-Content-Type-Optionsがnosniffではない");
  if (!headers["referrer-policy"]) problems.push("Referrer-Policyが無い");
  const hasFrameAncestors = typeof csp === "string" && /(^|;)\s*frame-ancestors\s/i.test(csp);
  if (!headers["x-frame-options"] && !hasFrameAncestors) problems.push("X-Frame-Optionsも、CSPのframe-ancestorsも無い");
  return problems;
}

function toLowerMap(headers) {
  const out = {};
  for (const [k, v] of headers.entries()) out[k.toLowerCase()] = v;
  return out;
}

async function check(url, fetchFn = fetch) {
  try {
    const res = await fetchFn(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    return { url, status: res.status, problems: evaluate(toLowerMap(res.headers)) };
  } catch (e) {
    return { url, status: null, problems: [`取得できない（${e.cause?.code ?? e.name}）`] };
  }
}

function renderTable(results) {
  const rows = results.map((r) => `| ${r.url} | ${r.status ?? "-"} | ${r.problems.length === 0 ? "OK" : r.problems.join("、")} |`);
  return ["| URL | ステータス | 結果 |", "| --- | --- | --- |", ...rows].join("\n");
}

async function main(argv) {
  const [mode, ...urls] = argv;
  if (!["warn", "fail"].includes(mode) || urls.length === 0) {
    console.error("使い方: node verify-security-headers.js <warn|fail> <URL>...");
    process.exit(2);
  }
  const results = [];
  for (const url of urls) results.push(await check(url));
  const table = renderTable(results);
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 本番のセキュリティヘッダーの実測\n\n${table}\n`);
  const bad = results.filter((r) => r.problems.length > 0);
  for (const r of bad) console.log(`::warning::セキュリティヘッダーの不足: ${r.url}: ${r.problems.join("、")}`);
  if (bad.length > 0 && mode === "fail") process.exit(1);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { evaluate, check, renderTable, HSTS_MIN_MAX_AGE };
