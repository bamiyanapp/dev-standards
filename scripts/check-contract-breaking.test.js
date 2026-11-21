"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { hasBreakingMarker, evaluate, main } = require("./check-contract-breaking.js");

test("hasBreakingMarker: type!: と type(scope)!: を、破壊的変更として扱う", () => {
  for (const ok of ["feat!: x", "feat(ci)!: x", "fix(reusable-ci)!: 説明", " feat!: x"]) assert.equal(hasBreakingMarker(ok), true, ok);
  for (const ng of ["feat: x", "feat(ci): x!", "BREAKING CHANGE: x", "", "feat!x"]) assert.equal(hasBreakingMarker(ng), false, ng);
});

test("evaluate: 要求が増えていなければ、印が無くても通る", () => {
  assert.equal(evaluate({ added: [], prTitle: "fix: x" }).ok, true);
});

test("evaluate: 要求が増えて、印が無ければ、失敗し、増えた要求を示す", () => {
  const r = evaluate({ added: ["a.yml: permissions issues: write"], prTitle: "feat(ci): x" });
  assert.equal(r.ok, false);
  assert.match(r.message, /PRタイトルに`!`/);
  assert.match(r.message, /a\.yml: permissions issues: write/);
});

test("evaluate: 要求が増えても、印があれば通る", () => {
  assert.equal(evaluate({ added: ["a.yml: 必須入力 x"], prTitle: "feat(ci)!: x" }).ok, true);
});

function repoWithContract(baseContract, headContract) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "contract-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  const file = path.join(dir, "docs", "generated", "reusable-workflow-contract.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(baseContract));
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const baseSha = git("rev-parse", "HEAD").toString().trim();
  fs.writeFileSync(file, JSON.stringify(headContract));
  return { dir, baseSha };
}

const NONE = { "r.yml": { permissions: {}, requiredInputs: [], requiredSecrets: [] } };
const MORE = { "r.yml": { permissions: { issues: "write" }, requiredInputs: [], requiredSecrets: [] } };

test("main: gitのbaseと比べ、増えていて印が無ければ1、印があれば0を返す", () => {
  const { dir, baseSha } = repoWithContract(NONE, MORE);
  const quiet = (fn) => { const e = console.error; console.error = () => {}; try { return fn(); } finally { console.error = e; } };
  assert.equal(quiet(() => main({ BASE_SHA: baseSha, PR_TITLE: "feat: x" }, dir)), 1);
  assert.equal(main({ BASE_SHA: baseSha, PR_TITLE: "feat!: x" }, dir), 0);
});

test("main: 契約ファイルが無いリポジトリ・BASE_SHAが無いとき・baseに契約が無いときは、何もしない", () => {
  assert.equal(main({}, fs.mkdtempSync(path.join(os.tmpdir(), "nocontract-"))), 0);
  const { dir } = repoWithContract(NONE, MORE);
  assert.equal(main({ PR_TITLE: "feat: x" }, dir), 0);
  assert.equal(main({ BASE_SHA: "0000000000000000000000000000000000000000", PR_TITLE: "feat: x" }, dir), 0);
});
