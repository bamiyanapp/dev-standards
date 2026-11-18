"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yaml = require("js-yaml");
const { buildSchema } = require("./check-dynamodb-protection.js");
const { findCommands, allowedActions, check, listSources, readSource } = require("./check-iam-actions.js");

const load = (text) => yaml.load(text, { schema: buildSchema(yaml) });
const names = (...n) => new Set(n);

const OLD_STATE = `
provider:
  iamRoleStatements:
    - Effect: Allow
      Action: [dynamodb:GetItem, dynamodb:PutItem, dynamodb:Query, dynamodb:Scan]
      Resource: !GetAtt Table.Arn
`;

test("UpdateItemが欠けた状態（Electric-Chair-Arenaの修正前）を検知する", () => {
  const r = check(allowedActions(load(OLD_STATE)), names("Get", "Put", "Update", "Query"));
  assert.deepEqual(r.missing, [{ command: "UpdateCommand", action: "dynamodb:UpdateItem" }]);
});

test("Actionが足りている場合・dynamodb:*の場合は報告しない", () => {
  assert.deepEqual(check(allowedActions(load(OLD_STATE)), names("Get", "Put", "Query")).missing, []);
  const wild = load("provider:\n  iamRoleStatements:\n    - Effect: Allow\n      Action: dynamodb:*\n      Resource: '*'\n");
  assert.deepEqual(check(allowedActions(wild), names("Update", "BatchWrite")).missing, []);
});

test("provider.iam.role.statementsの形式も読む。Denyは許可に数えない", () => {
  const doc = load("provider:\n  iam:\n    role:\n      statements:\n        - Effect: Allow\n          Action: dynamodb:UpdateItem\n        - Effect: Deny\n          Action: dynamodb:DeleteItem\n");
  const allowed = allowedActions(doc);
  assert.deepEqual(check(allowed, names("Update")).missing, []);
  assert.equal(check(allowed, names("Delete")).missing.length, 1);
});

test("対象外の構成（ステートメント無し・関数ごとのロール）はnullを返し、何も報告しない", () => {
  assert.equal(allowedActions(load("service: x\n")), null);
  assert.equal(allowedActions(load(OLD_STATE + "functions:\n  a:\n    iamRoleStatements:\n      - Effect: Allow\n        Action: dynamodb:GetItem\n")), null);
});

test("Transactは違反にせず、案内だけを返す", () => {
  const r = check(allowedActions(load(OLD_STATE)), names("TransactWrite"));
  assert.deepEqual(r.missing, []);
  assert.equal(r.transact, true);
});

test("ソースからコマンド名を抽出し、テスト・node_modulesは読まない", () => {
  assert.deepEqual([...findCommands("const a = new UpdateCommand({}); const b = new  QueryCommand ({});")].sort(), ["Query", "Update"]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iam-"));
  fs.writeFileSync(path.join(dir, "a.js"), "new PutCommand({})");
  fs.writeFileSync(path.join(dir, "a.test.js"), "new ScanCommand({})");
  fs.mkdirSync(path.join(dir, "node_modules"));
  fs.writeFileSync(path.join(dir, "node_modules", "b.js"), "new DeleteCommand({})");
  assert.deepEqual(listSources(dir).map((f) => path.basename(f)), ["a.js"]);
});

test("壊れたsymlinkなど、読めないファイルは、例外を投げずnullを返す（#1493）", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iam-"));
  const link = path.join(dir, "shared.js");
  fs.symlinkSync(path.join(dir, "missing-submodule", "shared.js"), link);
  const originalLog = console.log;
  const logged = [];
  console.log = (line) => logged.push(line);
  try {
    assert.equal(readSource(link), null);
  } finally {
    console.log = originalLog;
  }
  assert.match(logged[0], /::warning file=.*shared\.js::読めないため/);
});

test("読めるファイルは、内容を返す（#1493）", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iam-"));
  const file = path.join(dir, "a.js");
  fs.writeFileSync(file, "new PutCommand({})");
  assert.equal(readSource(file), "new PutCommand({})");
});
