"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate, CHECKS } = require("./check-security-checks.js");

const ci = (names) => `jobs:\n  ci:\n    uses: x/reusable-ci.yml@v1\n    with:\n${names.map((n) => `      ${n}: true`).join("\n")}\n`;
const all = CHECKS.map((c) => c.name);
const run = (names, optOut = {}, facts = { hasServerless: true }) => evaluate([{ file: "ci.yml", text: ci(names) }], optOut, facts);

test("すべて有効なら、警告しない", () => {
  assert.deepEqual(run(all), []);
});

test("無効なものを、警告する", () => {
  const f = run(["enable_secret_scan"]);
  assert.deepEqual(f.map((x) => x.name), all.filter((n) => n !== "enable_secret_scan"));
  assert.match(f[0].reason, /security-checks-opt-out\.json/);
});

test("serverlessが無ければ、IAM・DynamoDB・ヘッダー検査は対象外", () => {
  const f = run(["enable_secret_scan", "enable_email_scan", "enable_workflow_security_check", "enable_eslint_rules_check"], {}, { hasServerless: false });
  assert.deepEqual(f, []);
});

test("secret_scanが無効なら、email_scanは対象外（secret_scan側を警告する）", () => {
  const f = run([], {}, { hasServerless: false });
  assert.deepEqual(f.map((x) => x.name), ["enable_secret_scan", "enable_workflow_security_check", "enable_eslint_rules_check"]);
});

test("コメントアウトや false は、有効と見なさない", () => {
  const text = "with:\n  # enable_secret_scan: true\n  enable_eslint_rules_check: false\n";
  const f = evaluate([{ file: "a.yml", text }], {}, { hasServerless: false });
  assert.deepEqual(f.map((x) => x.name), ["enable_secret_scan", "enable_workflow_security_check", "enable_eslint_rules_check"]);
});

test("理由つきopt-outは警告しない。理由が空なら理由を求める", () => {
  const f = run(["enable_secret_scan"], { enable_email_scan: "対象外の理由", enable_eslint_rules_check: "  " });
  assert.equal(f.some((x) => x.name === "enable_email_scan"), false);
  const e = f.find((x) => x.name === "enable_eslint_rules_check");
  assert.match(e.reason, /理由（空でない文字列）/);
});
