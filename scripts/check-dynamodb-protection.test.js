"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const yaml = require("js-yaml");
const { check, buildSchema } = require("./check-dynamodb-protection.js");

const load = (text) => yaml.load(text, { schema: buildSchema(yaml) });

const PROTECTED = `
resources:
  Resources:
    UsersTable:
      Type: AWS::DynamoDB::Table
      DeletionPolicy: Retain
      UpdateReplacePolicy: Retain
      Properties:
        TableName: !Sub "\${AWS::StackName}-users"
        DeletionProtectionEnabled: true
        PointInTimeRecoverySpecification:
          PointInTimeRecoveryEnabled: true
`;

test("保護設定が揃ったテーブルは違反なし（!Sub等のタグも読める）", () => {
  const r = check(load(PROTECTED), "serverless.yml");
  assert.equal(r.checked, 1);
  assert.deepEqual(r.violations, []);
});

test("設定が無いテーブルは4項目すべてが違反になる", () => {
  const r = check(load("Resources:\n  T:\n    Type: AWS::DynamoDB::Table\n    Properties: { TableName: t }\n"), "t.yaml");
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].name, "T");
  assert.equal(r.violations[0].problems.length, 4);
});

test("TTLが有効なテーブルは対象外", () => {
  const r = check(load("Resources:\n  T:\n    Type: AWS::DynamoDB::Table\n    Properties:\n      TimeToLiveSpecification: { Enabled: true, AttributeName: expiresAt }\n"), "t.yaml");
  assert.deepEqual([r.checked, r.exempt, r.violations.length], [0, 1, 0]);
});

test("理由つきのMetadataで除外でき、理由が空なら違反になる", () => {
  const withReason = check(load("Resources:\n  T:\n    Type: AWS::DynamoDB::Table\n    Metadata:\n      DevStandardsProtectionExempt: キャッシュで再生成できる\n"), "t.yaml");
  assert.deepEqual([withReason.exempt, withReason.violations.length], [1, 0]);
  for (const bad of ['""', "true", "'  '"]) {
    const r = check(load(`Resources:\n  T:\n    Type: AWS::DynamoDB::Table\n    Metadata:\n      DevStandardsProtectionExempt: ${bad}\n`), "t.yaml");
    assert.equal(r.violations.length, 1);
    assert.ok(r.violations[0].problems[0].includes("理由"));
  }
});

test("SimpleTableは未検査として一覧にだけ出す", () => {
  const r = check(load("Resources:\n  S:\n    Type: AWS::Serverless::SimpleTable\n"), "t.yaml");
  assert.deepEqual(r.simpleTables, ["S"]);
  assert.deepEqual(r.violations, []);
});

test("serverless.ymlの変数・リスト形式のresourcesでもテーブルを見つける", () => {
  const r = check(load("resources:\n  - Resources:\n      T:\n        Type: AWS::DynamoDB::Table\n        Properties:\n          TableName: ${self:custom.table}\n"), "serverless.yml");
  assert.equal(r.violations.length, 1);
});

test("文字列のtrueも有効として扱う", () => {
  const r = check(load(PROTECTED.replace("DeletionProtectionEnabled: true", 'DeletionProtectionEnabled: "true"')), "s.yml");
  assert.deepEqual(r.violations, []);
});
