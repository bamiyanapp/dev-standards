"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createLinter } = require("actionlint");
const { filterKnownFalsePositives } = require("./lint-workflow-results.js");

const workflow = (expression) => `name: t
on: workflow_dispatch
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - run: echo "\${{ ${expression} }}"
`;

async function lintFiltered(expression) {
  const lint = await createLinter();
  return filterKnownFalsePositives(lint(workflow(expression), "t.yml"));
}

test("vars（リポジトリ変数）の参照は、誤検知として取り除く", async () => {
  assert.deepEqual(await lintFiltered("vars.AWS_DEPLOY_ROLE_ARN"), []);
  assert.deepEqual(await lintFiltered("vars['X']"), []);
});

test("vars以外の、本当の間違いは、取り除かない", async () => {
  const results = await lintFiltered("nosuchcontext.X");
  assert.equal(results.length, 1);
  assert.match(results[0].message, /undefined variable "nosuchcontext"/);
});

test("filterKnownFalsePositives: varsの誤検知だけを取り除く", () => {
  const results = [
    { kind: "expression", message: 'undefined variable "vars". available variables are "env"' },
    { kind: "expression", message: 'undefined variable "foo". available variables are "env"' },
    { kind: "syntax-check", message: 'undefined variable "vars". something' },
  ];
  assert.equal(filterKnownFalsePositives(results).length, 2);
});
