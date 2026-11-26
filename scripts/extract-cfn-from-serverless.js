"use strict";

// serverless.ymlから、CloudFormationの静的検査ツールへ渡すテンプレートを取り出す（issue #1614）。
// `serverless package`は、${aws:accountId}の解決にAWS認証が要るため、CIの検査では使えない。
// そのため、次の2つを集めて、1つのテンプレートにする。
//   - resources.Resources（そのまま）
//   - provider.iam.role.statements（合成したAWS::IAM::Roleのインラインポリシーとして）
// !Ref等のタグは、{ "Ref": ... }・{ "Fn::...": ... }の形に直す。Serverlessの${...}変数は解決しない。
//
// 使い方: node extract-cfn-from-serverless.js <出力先.json> <serverless.yml>...
// js-yamlは呼び出し側が用意する（NODE_PATHで解決する）。

const fs = require("node:fs");
const { buildSchema } = require("./check-dynamodb-protection.js");

// { "!Ref": x } → { "Ref": x }、{ "!GetAtt": x } → { "Fn::GetAtt": x }
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0].startsWith("!")) {
      const tag = keys[0].slice(1);
      return { [tag === "Ref" || tag === "Condition" ? tag : `Fn::${tag}`]: normalize(value[keys[0]]) };
    }
    return Object.fromEntries(keys.map((k) => [k, normalize(value[k])]));
  }
  return value;
}

function extract(doc, prefix = "") {
  const resources = {};
  for (const [id, res] of Object.entries(doc?.resources?.Resources ?? {})) resources[`${prefix}${id}`] = normalize(res);
  const statements = doc?.provider?.iam?.role?.statements;
  if (Array.isArray(statements) && statements.length > 0) {
    resources[`${prefix}ProviderRole`] = {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }],
        },
        Policies: [{ PolicyName: "provider-iam", PolicyDocument: { Version: "2012-10-17", Statement: normalize(statements) } }],
      },
    };
  }
  return resources;
}

function main(argv) {
  const [out, ...files] = argv;
  if (!out || files.length === 0) {
    console.error("使い方: node extract-cfn-from-serverless.js <出力先.json> <serverless.yml>...");
    process.exit(2);
  }
  const yaml = require("js-yaml");
  const schema = buildSchema(yaml);
  const Resources = {};
  files.forEach((file, i) => {
    const doc = yaml.load(fs.readFileSync(file, "utf8"), { schema });
    Object.assign(Resources, extract(doc, files.length > 1 ? `F${i}` : ""));
  });
  fs.writeFileSync(out, JSON.stringify({ AWSTemplateFormatVersion: "2010-09-09", Resources }, null, 2));
  console.log(`${Object.keys(Resources).length}件のリソースを${out}へ書き出しました`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { extract, normalize };
