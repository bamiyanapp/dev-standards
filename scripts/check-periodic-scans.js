"use strict";

// 参照側に、定期スキャン系のreusable workflowを呼ぶworkflowがあるかを確認する（issue #1369 対応2）。
// 定期スキャンは、reusable workflowが`workflow_call`のみで、scheduleトリガーは呼び出し側が用意する設計である。
// 呼び出し側が用意したかを確認する仕組みが無く、導入していないリポジトリでは、
// 「Renovateの更新PRが来るまで何も検知しない」弱点が、そのまま残る。
//
// - 警告にとどめ、終了コードは常に0（consumer-check・check-tmp-workflowsと同じ運用）
// - 意図的に導入しない場合は、`.github/periodic-scans-opt-out.json`で、理由つきで明示する
//     { "runtime-version-scan": "Lambdaが無いため、検査するエンドポイントが無い" }
//   理由が空のopt-outは、無効として警告する
// - 判定は、workflowのテキストで行う。scheduleを持つworkflowが、reusable workflowを`uses:`で呼ぶこと。
//   別の仕組みで定期実行している場合は、誤って警告するため、opt-outで明示する
//
// 使い方: node check-periodic-scans.js   （参照側のリポジトリのルートで実行）

const fs = require("node:fs");
const path = require("node:path");

const SCANS = [
  { name: "dependency-full-scan", label: "依存フル脆弱性スキャン" },
  { name: "dependency-deprecation-scan", label: "依存deprecatedスキャン" },
  { name: "runtime-version-scan", label: "ランタイムのバージョン遅延スキャン" },
  { name: "secret-full-scan", label: "シークレット遡及スキャン" },
];
const OPT_OUT_FILE = ".github/periodic-scans-opt-out.json";

function stripComments(text) {
  return text.split("\n").map((line) => line.replace(/(^|\s)#.*$/, "")).join("\n");
}

// workflows: [{ file, text }]。optOut: { [scanName]: 理由 }。
// 戻り値: [{ name, label, reason }]（警告にするもの）
function evaluate(workflows, optOut) {
  const findings = [];
  const scheduled = workflows
    .map(({ file, text }) => ({ file, body: stripComments(text) }))
    .filter(({ body }) => /^\s*schedule:\s*$/m.test(body));
  for (const scan of SCANS) {
    const reason = optOut[scan.name];
    if (typeof reason === "string" && reason.trim() !== "") continue;
    const called = scheduled.some(({ body }) => new RegExp(`uses:\\s*\\S*reusable-${scan.name}\\.yml`).test(body));
    if (called) continue;
    findings.push({
      ...scan,
      reason: reason === undefined
        ? `${scan.label}（reusable-${scan.name}.yml）を、scheduleトリガーで呼ぶworkflowが見つかりません。導入するか、${OPT_OUT_FILE}に理由を書いてください`
        : `${OPT_OUT_FILE}の${scan.name}に、理由（空でない文字列）を書いてください`,
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
  const findings = evaluate(workflows, readOptOut());
  if (findings.length === 0) {
    console.log("定期スキャンは、導入済みか、理由つきで導入しないと明示されています。");
    return;
  }
  for (const f of findings) console.log(`::warning::定期スキャン未導入: ${f.reason}`);
}

if (require.main === module) main();

module.exports = { evaluate, SCANS, OPT_OUT_FILE };
