"use strict";

// 参照側が、セキュリティ検査のenable_*を有効にしているかを確認する（issue #1612）。
// 「既定で有効、外すなら理由つきopt-out」の方針を、警告で担保する。
// reusable-ci.ymlの既定値は変えない（変えると破壊的変更になるため）。
//
// - 警告にとどめ、終了コードは常に0（check-periodic-scansと同じ運用）
// - 意図的に有効にしない場合は、`.github/security-checks-opt-out.json`に理由を書く
//     { "enable_iam_actions_check": "IAMを定義するserverless.ymlが無い" }
//   理由が空のopt-outは、無効として警告する
// - 対象条件（requires）を満たさない検査は、確認しない
// - 判定は、workflowのテキストで行う（コメントを除き、`enable_xxx: true`の有無を見る）
//
// 使い方: node check-security-checks.js   （参照側のリポジトリのルートで実行）

const fs = require("node:fs");
const path = require("node:path");
const { collectDeclarations } = require("./lambda-runtime-eol.js");

const CHECKS = [
  { name: "enable_secret_scan", label: "シークレット検知" },
  { name: "enable_email_scan", label: "メールアドレス検知", requires: "secret" },
  { name: "enable_workflow_security_check", label: "workflowの脆弱性検査" },
  { name: "enable_eslint_rules_check", label: "ESLintルールの検査" },
  // serverless*.ymlがあるリポジトリだけが対象
  { name: "enable_security_headers_check", label: "セキュリティヘッダーの検査", requires: "serverless" },
  { name: "enable_iam_actions_check", label: "IAM権限の検査", requires: "serverless" },
  { name: "enable_dynamodb_protection_check", label: "DynamoDB保護設定の検査", requires: "serverless" },
];
const OPT_OUT_FILE = ".github/security-checks-opt-out.json";

function stripComments(text) {
  return text.split("\n").map((line) => line.replace(/(^|\s)#.*$/, "")).join("\n");
}

// workflows: [{ file, text }]。optOut: { [検査名]: 理由 }。facts: { hasServerless }。
// 戻り値: [{ name, label, reason }]（警告にするもの）
function evaluate(workflows, optOut, facts = {}) {
  const bodies = workflows.map(({ text }) => stripComments(text));
  const enabled = (name) => bodies.some((b) => new RegExp(`^\\s*${name}:\\s*["']?true["']?\\s*$`, "m").test(b));
  const findings = [];
  for (const check of CHECKS) {
    if (check.requires === "serverless" && !facts.hasServerless) continue;
    if (check.requires === "secret" && !enabled("enable_secret_scan")) continue;
    const reason = optOut[check.name];
    if (typeof reason === "string" && reason.trim() !== "") continue;
    if (enabled(check.name)) continue;
    findings.push({
      ...check,
      reason: reason === undefined
        ? `${check.label}（${check.name}: true）が有効ではありません。有効にするか、${OPT_OUT_FILE}に理由を書いてください`
        : `${OPT_OUT_FILE}の${check.name}に、理由（空でない文字列）を書いてください`,
    });
  }
  return findings;
}

function readOptOut() {
  try {
    const parsed = JSON.parse(fs.readFileSync(OPT_OUT_FILE, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function main() {
  const dir = ".github/workflows";
  if (!fs.existsSync(dir)) return;
  const workflows = fs
    .readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => ({ file: path.posix.join(dir, f), text: fs.readFileSync(path.join(dir, f), "utf8") }));
  const hasServerless = collectDeclarations(process.cwd()).length > 0;
  const findings = evaluate(workflows, readOptOut(), { hasServerless });
  if (findings.length === 0) {
    console.log("セキュリティ検査は、有効か、理由つきで無効と明示されています。");
    return;
  }
  for (const f of findings) console.log(`::warning::セキュリティ検査が未有効: ${f.reason}`);
}

if (require.main === module) main();

module.exports = { evaluate, CHECKS, OPT_OUT_FILE };
