#!/usr/bin/env node
"use strict";

// dev-standards#1334: 再利用ワークフロー（reusable-*.yml）が「呼び出し側へ要求するもの」を抽出し、
// docs/generated/reusable-workflow-contract.jsonとして記録する。
//
// GitHub Actionsは、呼び出し先の各jobが宣言するpermissionsを、jobのif:の評価結果に関わらず静的に検査する。
// 入力の既定値がfalseの任意の機能でも、権限を要求するjobを足すと、その権限を許可していない呼び出し元は
// startup_failure（job 0件）になる。失敗は、呼び出し元では気づきにくい（1件も起動しない）。
// そのため、要求が「増えた」変更を、dev-standards側で機械的に見えるようにする。
//
// 抽出するもの（ワークフローごと）:
//   - permissions: ワークフロー・全jobのpermissionsの和集合（同じ権限は、write > read > noneの強い方）
//   - requiredInputs: required: trueで、defaultの無い入力
//   - requiredSecrets: required: trueのsecrets
//
// 使い方:
//   node scripts/reusable-contract.js --write   契約ファイルを再生成する
//   node scripts/reusable-contract.js --check   コミット済みの契約ファイルが、現在のワークフローと一致するか検査する

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONTRACT_PATH = path.join("docs", "generated", "reusable-workflow-contract.json");
const LEVEL_RANK = { none: 0, read: 1, write: 2 };

function mergePermissions(target, permissions) {
  if (permissions === undefined || permissions === null) return;
  if (typeof permissions === "string") {
    // read-all・write-all。個別の権限へは展開せず、"*"として残す
    target["*"] = LEVEL_RANK[permissions.replace("-all", "")] >= LEVEL_RANK[target["*"] || "none"] ? permissions.replace("-all", "") : target["*"];
    return;
  }
  for (const [name, level] of Object.entries(permissions)) {
    if ((LEVEL_RANK[level] ?? 0) > LEVEL_RANK[target[name] || "none"]) target[name] = level;
    else if (!(name in target)) target[name] = level;
  }
}

function extractWorkflowContract(text) {
  const doc = yaml.load(text) || {};
  const call = doc.on && doc.on.workflow_call;
  const permissions = {};
  mergePermissions(permissions, doc.permissions);
  for (const job of Object.values(doc.jobs || {})) mergePermissions(permissions, job && job.permissions);
  const requiredInputs = [];
  const requiredSecrets = [];
  if (call && typeof call === "object") {
    for (const [name, spec] of Object.entries(call.inputs || {})) {
      if (spec && spec.required === true && spec.default === undefined) requiredInputs.push(name);
    }
    for (const [name, spec] of Object.entries(call.secrets || {})) {
      if (spec && spec.required === true) requiredSecrets.push(name);
    }
  }
  const sortedPermissions = Object.fromEntries(Object.entries(permissions).sort(([a], [b]) => a.localeCompare(b)));
  return { permissions: sortedPermissions, requiredInputs: requiredInputs.sort(), requiredSecrets: requiredSecrets.sort() };
}

function extractContract(workflowsDir) {
  const contract = {};
  const files = fs.readdirSync(workflowsDir).filter((name) => /^reusable-.*\.ya?ml$/.test(name)).sort();
  for (const name of files) contract[name] = extractWorkflowContract(fs.readFileSync(path.join(workflowsDir, name), "utf-8"));
  return contract;
}

// baseに無い、または強くなった要求を返す。参照側へ新しい要求が増えた変更を、見つけるために使う
function findAddedRequirements(base, head) {
  const added = [];
  for (const [file, next] of Object.entries(head)) {
    const prev = base[file] || { permissions: {}, requiredInputs: [], requiredSecrets: [] };
    for (const [name, level] of Object.entries(next.permissions)) {
      if ((LEVEL_RANK[level] ?? 0) > (LEVEL_RANK[prev.permissions[name] || "none"] ?? 0)) added.push(`${file}: permissions ${name}: ${level}`);
    }
    for (const input of next.requiredInputs) if (!prev.requiredInputs.includes(input)) added.push(`${file}: 必須入力 ${input}`);
    for (const secret of next.requiredSecrets) if (!prev.requiredSecrets.includes(secret)) added.push(`${file}: 必須secret ${secret}`);
  }
  return added;
}

function serialize(contract) {
  return `${JSON.stringify(contract, null, 2)}\n`;
}

function main(argv) {
  const workflowsDir = path.join(REPO_ROOT, ".github", "workflows");
  const contractPath = path.join(REPO_ROOT, CONTRACT_PATH);
  const generated = serialize(extractContract(workflowsDir));
  if (argv.includes("--write")) {
    fs.mkdirSync(path.dirname(contractPath), { recursive: true });
    fs.writeFileSync(contractPath, generated);
    console.log(`${CONTRACT_PATH} を更新しました`);
    return 0;
  }
  const committed = fs.existsSync(contractPath) ? fs.readFileSync(contractPath, "utf-8") : "";
  if (committed === generated) {
    console.log("再利用ワークフローの契約は、コミット済みの内容と一致しています");
    return 0;
  }
  console.error(`::error::${CONTRACT_PATH} が、現在の再利用ワークフローの内容と一致しません。node scripts/reusable-contract.js --write で再生成してください。`);
  console.error("呼び出し側への要求（permissions・必須入力・必須secret）が変わった場合、既存の参照側がstartup_failureになりうる破壊的変更です（dev-standards#1334）。");
  return 1;
}

module.exports = { extractWorkflowContract, extractContract, findAddedRequirements, serialize, CONTRACT_PATH };

if (require.main === module) process.exit(main(process.argv.slice(2)));
