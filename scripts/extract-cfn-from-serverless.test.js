"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { extract, normalize } = require("./extract-cfn-from-serverless.js");

test("!Ref・!GetAtt等のタグを、CloudFormationの関数の形に直す", () => {
  assert.deepEqual(normalize({ "!Ref": "A" }), { Ref: "A" });
  assert.deepEqual(normalize({ P: { "!GetAtt": "B.Arn" } }), { P: { "Fn::GetAtt": "B.Arn" } });
  assert.deepEqual(normalize([{ "!Sub": "x" }]), [{ "Fn::Sub": "x" }]);
});

test("resources.Resourcesとprovider.iam.role.statementsを、1つのテンプレートにする", () => {
  const doc = {
    provider: { iam: { role: { statements: [{ Effect: "Allow", Action: ["s3:GetObject"], Resource: "*" }] } } },
    resources: { Resources: { Bucket: { Type: "AWS::S3::Bucket" } } },
  };
  const r = extract(doc);
  assert.equal(r.Bucket.Type, "AWS::S3::Bucket");
  assert.equal(r.ProviderRole.Type, "AWS::IAM::Role");
  assert.equal(r.ProviderRole.Properties.Policies[0].PolicyDocument.Statement[0].Resource, "*");
});

test("statementsが無ければ、ロールを作らない。複数ファイルは、接頭辞で衝突を避ける", () => {
  assert.deepEqual(extract({}), {});
  assert.deepEqual(Object.keys(extract({ resources: { Resources: { A: {} } } }, "F0")), ["F0A"]);
});
