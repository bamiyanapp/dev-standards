"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { extractWorkflowContract, extractContract, findAddedRequirements, serialize, CONTRACT_PATH } = require("./reusable-contract.js");

const REPO_ROOT = path.resolve(__dirname, "..");

const WORKFLOW = `
name: Reusable Sample
on:
  workflow_call:
    inputs:
      must:
        required: true
        type: string
      with_default:
        required: true
        type: string
        default: "x"
      optional:
        required: false
        type: boolean
        default: false
    secrets:
      TOKEN:
        required: true
      MAYBE:
        required: false
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    if: inputs.optional
    permissions:
      contents: write
      issues: write
    steps: []
  b:
    runs-on: ubuntu-latest
    permissions:
      issues: read
      pull-requests: write
    steps: []
`;

test("extractWorkflowContract: permissionsは、ワークフローと全jobの和集合で、強い方（write）を残す", () => {
  const { permissions } = extractWorkflowContract(WORKFLOW);
  assert.deepEqual(permissions, { contents: "write", issues: "write", "pull-requests": "write" });
});

test("extractWorkflowContract: jobのif:に関わらず、権限を数える（GitHubが静的に検査するため）", () => {
  // jobaはinputs.optional（既定false）でゲートされているが、issues: writeを数える
  assert.equal(extractWorkflowContract(WORKFLOW).permissions.issues, "write");
});

test("extractWorkflowContract: 必須入力はrequired: trueでdefaultが無いものだけ、必須secretはrequired: trueだけ", () => {
  const contract = extractWorkflowContract(WORKFLOW);
  assert.deepEqual(contract.requiredInputs, ["must"]);
  assert.deepEqual(contract.requiredSecrets, ["TOKEN"]);
});

test("extractWorkflowContract: workflow_callが無いワークフローは、要求を持たない", () => {
  const contract = extractWorkflowContract("on: push\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps: []\n");
  assert.deepEqual(contract, { permissions: {}, requiredInputs: [], requiredSecrets: [] });
});

test("findAddedRequirements: 増えた権限・必須入力・必須secretを返す。減った分は返さない", () => {
  const base = { "reusable-x.yml": { permissions: { contents: "read", issues: "write" }, requiredInputs: ["a"], requiredSecrets: [] } };
  const head = {
    "reusable-x.yml": { permissions: { contents: "write" }, requiredInputs: ["a", "b"], requiredSecrets: ["S"] },
    "reusable-new.yml": { permissions: { "pull-requests": "write" }, requiredInputs: [], requiredSecrets: [] },
  };
  assert.deepEqual(findAddedRequirements(base, head), [
    "reusable-x.yml: permissions contents: write",
    "reusable-x.yml: 必須入力 b",
    "reusable-x.yml: 必須secret S",
    "reusable-new.yml: permissions pull-requests: write",
  ]);
});

test("findAddedRequirements: 変わらなければ空", () => {
  const same = { "reusable-x.yml": { permissions: { contents: "read" }, requiredInputs: [], requiredSecrets: [] } };
  assert.deepEqual(findAddedRequirements(same, same), []);
});

test("コミット済みの契約ファイルが、現在のreusable-*.ymlと一致する（変えたら node scripts/reusable-contract.js --write で再生成する）", () => {
  const generated = serialize(extractContract(path.join(REPO_ROOT, ".github", "workflows")));
  const committed = fs.readFileSync(path.join(REPO_ROOT, CONTRACT_PATH), "utf-8");
  assert.equal(committed, generated, "呼び出し側への要求が変わった場合、既存の参照側がstartup_failureになりうる破壊的変更である（dev-standards#1334）");
});
