"use strict";

// deploy-serverlessのOIDC対応（issue #1363）の、配線の契約を守る。
// 実際のOIDC認証はAWS側のロールが要るため、ここでは、action.ymlの構造だけを検証する
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const action = yaml.load(fs.readFileSync(path.join(__dirname, "action.yml"), "utf8"));
const steps = action.runs.steps;
const stepByName = (re) => steps.find((s) => re.test(s.name));

test("アクセスキーは必須でなくなり、OIDC用のinputが足されている", () => {
  const { inputs } = action;
  assert.notEqual(inputs["aws-access-key-id"].required, true);
  assert.notEqual(inputs["aws-secret-access-key"].required, true);
  assert.equal(inputs["role-to-assume"].default, "");
  assert.equal(inputs["aws-region"].default, "");
});

test("認証情報の検証が最初のstepで、どちらの認証情報も無ければ失敗させる", () => {
  assert.match(steps[0].name, /検証/);
  assert.match(steps[0].run, /role-to-assume（OIDC）か、aws-access-key-id と aws-secret-access-key/);
  // 既存の呼び出し（アクセスキーのみ）は、検証を通る
  assert.match(steps[0].run, /elif \[ -z "\$ACCESS_KEY_ID" \] \|\| \[ -z "\$SECRET_ACCESS_KEY" \]/);
});

test("OIDCのstepは、role-to-assumeが指定されたときだけ動き、バージョンを固定している", () => {
  const oidc = stepByName(/OIDC/);
  assert.equal(oidc.if, "inputs.role-to-assume != ''");
  assert.match(oidc.uses, /^aws-actions\/configure-aws-credentials@v\d+$/);
  assert.equal(oidc.with["role-to-assume"], "${{ inputs.role-to-assume }}");
  assert.equal(oidc.with["aws-region"], "${{ inputs.aws-region }}");
});

test("OIDCのとき、regionが無ければ失敗させ、アクセスキーとの併用は警告してOIDCを優先する", () => {
  const run = steps[0].run;
  assert.match(run, /role-to-assume（OIDC）を指定する場合は、aws-region も指定してください/);
  assert.match(run, /::warning::role-to-assume とアクセスキーの両方が指定されています/);
});

test("Deployのstepは、OIDCのとき、一時クレデンシャルを空のアクセスキーで上書きしない", () => {
  const deploy = stepByName(/^Deploy$/);
  assert.equal(
    deploy.env.AWS_ACCESS_KEY_ID,
    "${{ inputs.role-to-assume == '' && inputs.aws-access-key-id || env.AWS_ACCESS_KEY_ID }}"
  );
  assert.equal(
    deploy.env.AWS_SECRET_ACCESS_KEY,
    "${{ inputs.role-to-assume == '' && inputs.aws-secret-access-key || env.AWS_SECRET_ACCESS_KEY }}"
  );
});

test("OIDCのstepは、Deployより前にある", () => {
  const names = steps.map((s) => s.name);
  assert.ok(names.findIndex((n) => /OIDC/.test(n)) < names.findIndex((n) => /^Deploy$/.test(n)));
});
