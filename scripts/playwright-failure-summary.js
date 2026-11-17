"use strict";

// PlaywrightのJSONレポーター出力（results.json）から、失敗したテストの題名・エラーメッセージ・
// 該当行を取り出し、Job SummaryとPRコメント向けのMarkdownにする（issue #1365）。
// スマホオンリー環境では、HTMLレポート（zip）を閲覧できないため、失敗の理由をテキストで出す。
//
// - suitesは入れ子（ファイル→describe）なので、再帰でたどる
// - 最終結果が成功したテスト（flaky）は「失敗」に含めず、件数だけを別枠で出す。最終結果は、
//   tests[].status（unexpected・flaky・expected・skipped）で判定する
// - エラーメッセージのANSIエスケープシーケンスを除去する
// - 1件あたりの文字数と、件数に上限を設ける（Job Summaryは1MB、PRコメントは65,536文字が上限）
// - secretsの値（E2E_SECRETS_JSON由来）がメッセージに含まれていたら、伏せ字にする。
//   PRコメントのAPI投稿本文は、::add-mask::でマスクされないため
//
// 使い方: node playwright-failure-summary.js <results.json> <出力するmd>
//   results.jsonが無いときは、警告を出して何もしない（終了コード0）。失敗が無いときも、何も出力しない。

const fs = require("node:fs");

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const MAX_FAILURES = 20;
const MAX_MESSAGE_CHARS = 1500;
const MAX_TOTAL_CHARS = 60000;

function maskSecrets(text, secrets) {
  let out = text;
  for (const value of secrets) {
    // 短すぎる値は、無関係な文字列まで伏せてしまうため対象にしない
    if (typeof value === "string" && value.length >= 4) out = out.split(value).join("***");
  }
  return out;
}

function collectTests(suite, titles, out) {
  const path = suite.title && !/\.(?:[cm]?[jt]sx?)$/.test(suite.title) ? [...titles, suite.title] : titles;
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) out.push({ spec, test, path: [...path, spec.title] });
  }
  for (const child of suite.suites || []) collectTests(child, path, out);
}

function errorOf(test) {
  const last = (test.results || []).at(-1) || {};
  const err = (last.errors && last.errors[0]) || last.error || {};
  return err.message || err.stack || "(エラーメッセージが無い)";
}

// secrets: 伏せ字にする値の配列。戻り値: { markdown, failed, flaky }（失敗もflakyも無ければmarkdownは空）
function summarize(report, { secrets = [] } = {}) {
  const tests = [];
  for (const suite of report.suites || []) collectTests(suite, [], tests);
  const failed = tests.filter((t) => t.test.status === "unexpected");
  const flaky = tests.filter((t) => t.test.status === "flaky");
  if (failed.length === 0) return { markdown: "", failed: 0, flaky: flaky.length };

  let markdown = `### E2Eテストの失敗（${failed.length}件）\n\n`;
  for (const { spec, test, path } of failed.slice(0, MAX_FAILURES)) {
    const message = maskSecrets(errorOf(test).replace(ANSI, ""), secrets).trim();
    const clipped = message.length > MAX_MESSAGE_CHARS ? `${message.slice(0, MAX_MESSAGE_CHARS)}\n…（以降は省略）` : message;
    const where = spec.file ? `${spec.file}${spec.line ? `:${spec.line}` : ""}` : "";
    const project = test.projectName ? ` [${test.projectName}]` : "";
    const entry = `**${path.join(" › ")}**${project}${where ? ` — \`${where}\`` : ""}\n\n\`\`\`\n${clipped}\n\`\`\`\n\n`;
    if (markdown.length + entry.length > MAX_TOTAL_CHARS) {
      markdown += "…（文字数の上限のため、以降の失敗は省略）\n\n";
      break;
    }
    markdown += entry;
  }
  if (failed.length > MAX_FAILURES) markdown += `ほか${failed.length - MAX_FAILURES}件の失敗は、件数が多いため省略した。\n\n`;
  if (flaky.length > 0) markdown += `再試行で成功したテスト（flaky）: ${flaky.length}件\n`;
  return { markdown, failed: failed.length, flaky: flaky.length };
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("使い方: playwright-failure-summary.js <results.json> <出力するmd>");
    process.exit(2);
  }
  if (!fs.existsSync(input)) {
    console.log(`::warning::${input}が無いため、E2Eの失敗の概要をスキップしました（Playwrightの設定にjsonレポーターが必要です。docs/e2e-coverage-pattern.mdを参照）`);
    return;
  }
  let secrets = [];
  try {
    secrets = Object.values(JSON.parse(process.env.E2E_SECRETS_JSON || "{}")).map(String);
  } catch {
    /* secretsが無い・JSONでない場合は、伏せ字にする値が無いものとして扱う */
  }
  const { markdown, failed } = summarize(JSON.parse(fs.readFileSync(input, "utf8")), { secrets });
  if (markdown) fs.writeFileSync(output, markdown);
  console.log(failed > 0 ? `失敗したテスト: ${failed}件` : "失敗したテストはありません。");
}

if (require.main === module) main();

module.exports = { summarize, maskSecrets };
