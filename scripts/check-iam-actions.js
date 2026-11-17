"use strict";

// バックエンドのソースが使うDynamoDBのコマンド（new XxxCommand(）に対応するIAM Actionが、
// serverless.ymlのIAMステートメントにあるかを検査する（issue #1419）。
// 単体テストはDynamoDBクライアントをモックするため権限は検証されず、デプロイも成功する。
// 失敗を捕捉する実装では、Errorsアラームにも5xxアラームにも現れない。
//
// 対象外（何も報告しない。誤検知で落とさないため）:
//   - IAMステートメントが見つからない構成
//   - 関数ごとにiamRoleStatementsを持つ構成
//   - SAMテンプレート
// TransactWrite・TransactGetは、内包する操作のActionが要る。コマンド名からは決まらないため、
// 案内を出すだけで、違反にはしない。
//
// 使い方: node check-iam-actions.js <warn|fail> <serverless.yml> <ソースのディレクトリ>...
// js-yamlは呼び出し側が用意する（NODE_PATHで解決する）。

const fs = require("node:fs");
const path = require("node:path");
const { buildSchema } = require("./check-dynamodb-protection.js");

// コマンド名（Commandを除く）→ IAM Action。他のサービスは、この表へ足せば広げられる
const DYNAMODB_ACTIONS = {
  Get: "dynamodb:GetItem",
  GetItem: "dynamodb:GetItem",
  Put: "dynamodb:PutItem",
  PutItem: "dynamodb:PutItem",
  Update: "dynamodb:UpdateItem",
  UpdateItem: "dynamodb:UpdateItem",
  Delete: "dynamodb:DeleteItem",
  DeleteItem: "dynamodb:DeleteItem",
  Query: "dynamodb:Query",
  Scan: "dynamodb:Scan",
  BatchWrite: "dynamodb:BatchWriteItem",
  BatchWriteItem: "dynamodb:BatchWriteItem",
  BatchGet: "dynamodb:BatchGetItem",
  BatchGetItem: "dynamodb:BatchGetItem",
};
const TRANSACT = new Set(["TransactWrite", "TransactWriteItems", "TransactGet", "TransactGetItems"]);

const SOURCE_EXT = /\.(?:js|mjs|cjs|ts)$/;
const TEST_FILE = /\.(?:test|spec)\.[a-z]+$/;
const SKIP_DIR = new Set(["node_modules", "test", "tests", "__tests__", ".git", "coverage", "dist", "build", ".serverless"]);

function listSources(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) listSources(full, out);
    } else if (SOURCE_EXT.test(entry.name) && !TEST_FILE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// ソースの文字列から、使われているコマンド名（Commandを除く）を集める
function findCommands(source) {
  const names = new Set();
  for (const m of source.matchAll(/new\s+([A-Z][A-Za-z]*)Command\s*\(/g)) names.add(m[1]);
  return names;
}

const asArray = (v) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

// 戻り値: null（対象外）、または許可されているActionの配列
function allowedActions(doc) {
  const provider = doc?.provider || {};
  const statements = [...asArray(provider.iamRoleStatements), ...asArray(provider.iam?.role?.statements)];
  const perFunction = Object.values(doc?.functions || {}).some((f) => f && f.iamRoleStatements);
  if (statements.length === 0 || perFunction) return null;
  const actions = [];
  for (const s of statements) {
    if (s && s.Effect !== "Deny") actions.push(...asArray(s.Action).filter((a) => typeof a === "string"));
  }
  return actions;
}

function isAllowed(action, allowed) {
  const lower = action.toLowerCase();
  return allowed.some((a) => {
    const x = a.toLowerCase();
    return x === "*" || x === "dynamodb:*" || x === lower;
  });
}

// commands: コマンド名の集合。戻り値: { missing: [{ command, action }], transact: boolean }
function check(allowed, commands) {
  const missing = [];
  const seen = new Set();
  for (const name of commands) {
    const action = DYNAMODB_ACTIONS[name];
    if (action && !seen.has(action) && !isAllowed(action, allowed)) {
      seen.add(action);
      missing.push({ command: `${name}Command`, action });
    }
  }
  return { missing, transact: [...commands].some((c) => TRANSACT.has(c)) };
}

function main() {
  const [mode, serverlessFile, ...dirs] = process.argv.slice(2);
  if (!["warn", "fail"].includes(mode) || !serverlessFile || dirs.length === 0) {
    console.error("使い方: check-iam-actions.js <warn|fail> <serverless.yml> <ソースのディレクトリ>...");
    process.exit(2);
  }
  if (!fs.existsSync(serverlessFile)) {
    console.log(`${serverlessFile}が無いため、対象外です。`);
    return;
  }
  const yaml = require("js-yaml");
  const allowed = allowedActions(yaml.load(fs.readFileSync(serverlessFile, "utf8"), { schema: buildSchema(yaml) }));
  if (!allowed) {
    console.log("IAMステートメントが見つからない、または関数ごとに定義されている構成のため、対象外です。");
    return;
  }
  const commands = new Set();
  for (const dir of dirs) for (const file of listSources(dir)) for (const c of findCommands(fs.readFileSync(file, "utf8"))) commands.add(c);
  const { missing, transact } = check(allowed, commands);
  console.log(`使われているDynamoDBコマンド: ${[...commands].filter((c) => DYNAMODB_ACTIONS[c]).sort().join("、") || "なし"}`);
  if (transact) console.log("TransactWrite・TransactGetが使われています。内包する操作のActionもIAMへ必要です。確認してください。");
  if (missing.length === 0) {
    console.log("IAMステートメントに、不足しているActionは見つかりませんでした。");
    return;
  }
  for (const m of missing) {
    console.log(`- ${m.command}が使われていますが、${serverlessFile}に${m.action}（または dynamodb:*）がありません`);
    if (mode === "warn") console.log(`::warning file=${serverlessFile}::${m.action}がIAMステートメントにありません（${m.command}を使用）`);
  }
  if (mode === "fail") process.exit(1);
  console.log("警告のみ（失敗にはしません）。是正後に、modeをfailへ切り替えてください。");
}

if (require.main === module) main();

module.exports = { findCommands, allowedActions, check, isAllowed, listSources };
