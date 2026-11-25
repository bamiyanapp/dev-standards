"use strict";

// serverless.yml等に宣言されたLambdaのランタイムが、サポート終了に近いか、過ぎていないかを警告する
// （issue #1371）。サポートが切れたランタイムは、セキュリティパッチが止まり、やがて関数の更新もできなくなる。
// 依存の脆弱性スキャンでは、ランタイム自体の期限は見えないため、宣言から静的に読む。
//
// 情報源: endoflife.date の aws-lambda API（https://endoflife.date/api/aws-lambda.json）。
//   { cycle: "nodejs22.x", support: "2027-05-30", eol: "2027-08-31" } の配列で、
//   supportは、AWSの非推奨日（セキュリティパッチの停止）、eolは、関数の更新ができなくなる日である。
//   警告の基準は、パッチが止まるsupportの日とする。eolを過ぎたものは、さらに強い警告にする。
//
// - 警告にとどめ、終了コードは常に0（取得に失敗した時も、警告にとどめる）
// - 警告を始める日数は、環境変数LAMBDA_EOL_WARN_DAYSで変える（既定90日）
// - Lambdaのランタイムだけを対象にする。.nvmrc・package.jsonのengines・workflowのnode-versionは、
//   CIの設定で、Lambdaのランタイムではないため、対象外である
//
// 使い方: node lambda-runtime-eol.js [--json]   （リポジトリのルートで実行）

const fs = require("node:fs");
const path = require("node:path");

const API_URL = "https://endoflife.date/api/aws-lambda.json";
const DAY_MS = 24 * 60 * 60 * 1000;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", ".serverless"]);

// serverless*.yml の中の、リテラルのruntime指定を拾う。CloudFormationのタグ（!Ref等）があっても、行単位で読める。
// 変数（${self:provider.runtime}等）は、リテラルではないため、拾わない
function extractRuntimes(text) {
  const found = [];
  text.split("\n").forEach((line, index) => {
    const match = /^\s*runtime:\s*["']?([a-z0-9][a-z0-9.\-_]*)["']?\s*(?:#.*)?$/.exec(line);
    if (match) found.push({ runtime: match[1], line: index + 1 });
  });
  return found;
}

function utcDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T00:00:00Z`) : null;
}

// entry: { cycle, support, eol }。戻り値: { level: "ok"|"soon"|"deprecated"|"blocked"|"unknown", ... }
// ランタイム名から、Node.jsのメジャー版を取り出す（"nodejs26.x" → 26）。Node.js以外は、nullを返す
function nodeMajor(runtime) {
  const m = /^nodejs(\d+)\.x$/.exec(runtime);
  return m ? Number(m[1]) : null;
}

// endoflife.dateに載っていない、最新のNode.jsより新しいランタイムは、AWSが公開した直後で、期限の掲載待ちである。
// 「確認できない」警告にすると、新しいランタイムへ移したプロダクトに、誤警報のIssueが立つ（dev-standards#1621）。
// 載っている最新より新しい場合だけ、問題なしとして扱う。古い版や、Node.js以外が載っていない場合は、従来どおり警告する
function isNewerThanKnown(runtime, entries) {
  const major = nodeMajor(runtime);
  if (major === null) return false;
  const known = (entries || []).map((e) => nodeMajor(e.cycle)).filter((n) => n !== null);
  return known.length > 0 && major > Math.max(...known);
}

function judge(runtime, entry, now, warnDays, entries) {
  if (!entry && isNewerThanKnown(runtime, entries)) return { level: "ok", message: "" };
  if (!entry) return { level: "unknown", message: `${runtime}は、endoflife.dateのaws-lambdaに載っていません。期限を確認できません` };
  const support = utcDate(entry.support);
  const eol = utcDate(entry.eol);
  if (eol && now >= eol) {
    return { level: "blocked", message: `${runtime}は、${entry.eol}に、関数の作成・更新ができなくなっています。新しいランタイムへ移してください` };
  }
  if (support && now >= support) {
    return { level: "deprecated", message: `${runtime}は、${entry.support}にサポートが終わり、セキュリティパッチが止まっています（更新の停止は${entry.eol}）。新しいランタイムへ移してください` };
  }
  if (support) {
    const daysLeft = Math.ceil((support - now) / DAY_MS);
    if (daysLeft <= warnDays) {
      return { level: "soon", message: `${runtime}は、${entry.support}にサポートが終わります（あと${daysLeft}日）。移行を計画してください` };
    }
  }
  return { level: "ok", message: "" };
}

// declarations: [{ file, runtime, line }]。entries: endoflife.dateの配列。戻り値: [{ file, line, runtime, level, message }]
function evaluate(declarations, entries, now, warnDays) {
  const byCycle = new Map((entries || []).map((e) => [e.cycle, e]));
  return declarations
    .map((d) => ({ ...d, ...judge(d.runtime, byCycle.get(d.runtime), now, warnDays, entries) }))
    .filter((r) => r.level !== "ok");
}

function listServerlessFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...listServerlessFiles(path.join(dir, entry.name)));
    } else if (/^serverless.*\.ya?ml$/.test(entry.name)) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

async function fetchEntries(fetchImpl = fetch) {
  const res = await fetchImpl(API_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`endoflife.dateの取得に失敗しました: HTTP ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error("endoflife.dateの応答の形が想定と違います（配列ではありません）");
  return body;
}

function collectDeclarations(cwd) {
  return listServerlessFiles(cwd).flatMap((file) =>
    extractRuntimes(fs.readFileSync(file, "utf8")).map((d) => ({ file: path.relative(cwd, file), ...d }))
  );
}

// 宣言を集め、期限を取得して判定する。取得に失敗したときは、fetchFailed: true にする（検知なしとは区別する）。
// 戻り値: { declarations, findings, fetchFailed, error }
async function scan({ cwd = process.cwd(), now = new Date(), warnDays = 90, fetchEntriesImpl = fetchEntries } = {}) {
  const declarations = collectDeclarations(cwd);
  if (declarations.length === 0) return { declarations, findings: [], fetchFailed: false, error: "" };
  let entries;
  try {
    entries = await fetchEntriesImpl();
  } catch (error) {
    return { declarations, findings: [], fetchFailed: true, error: error.message };
  }
  return { declarations, findings: evaluate(declarations, entries, now, warnDays), fetchFailed: false, error: "" };
}

async function main() {
  const warnDays = Number(process.env.LAMBDA_EOL_WARN_DAYS || "90");
  const result = await scan({ warnDays });
  // --json: 定期スキャン（reusable-lambda-runtime-eol-scan.yml）用。結果を構造化して出す
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ checked: result.declarations.length, findings: result.findings, fetchFailed: result.fetchFailed, error: result.error }));
    return;
  }
  if (result.declarations.length === 0) {
    console.log("Lambdaのランタイムの宣言（serverless*.yml）は、見つかりませんでした。");
    return;
  }
  if (result.fetchFailed) {
    console.log(`::warning::Lambdaのランタイムの期限を確認できませんでした（${result.error}）。検査をスキップします`);
    return;
  }
  if (result.findings.length === 0) {
    console.log(`Lambdaのランタイム${result.declarations.length}件は、サポート終了まで${warnDays}日以上あります。`);
    return;
  }
  for (const f of result.findings) console.log(`::warning file=${f.file},line=${f.line}::${f.message}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.log(`::warning::Lambdaのランタイムの検査で、想定外のエラーが起きました: ${error.message}`);
  });
}

module.exports = { extractRuntimes, judge, evaluate, fetchEntries, collectDeclarations, scan, API_URL };
