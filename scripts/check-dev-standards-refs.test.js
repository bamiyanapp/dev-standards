"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { checkVersionConsistency, listWorkflowFiles, stripComment } = require("./check-dev-standards-refs.js");

const USES = (ref) => `    uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@${ref}\n`;
const SELF = (ref) => `      self_ref: ${ref}\n`;

function check(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "refs-"));
  const dir = path.join(root, ".github", "workflows");
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  try {
    return checkVersionConsistency(listWorkflowFiles(dir), dir, root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("uses:とself_ref:が一致していれば、問題は0件", () => {
  assert.deepEqual(check({ "ci.yml": USES("v2.124.0") + SELF("v2.124.0") }), []);
});

test("self_refだけ古いと、ファイル名・種別・各バージョンを含むメッセージを返す", () => {
  const issues = check({ "ci.yml": USES("v2.124.0") + SELF("v2.123.0") });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /2種類: v2\.124\.0, v2\.123\.0/);
  assert.match(issues[0], /ci\.yml: uses = v2\.124\.0/);
  assert.match(issues[0], /ci\.yml: self_ref = v2\.123\.0/);
});

test("uses:が複数ファイルで食い違っていると検知する", () => {
  const issues = check({ "ci.yml": USES("v2.124.0"), "cd.yml": USES("v2.100.0") });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /cd\.yml: uses = v2\.100\.0/);
});

test("self_refもuses:も無ければ、問題は0件", () => {
  assert.deepEqual(check({ "other.yml": "name: other\non: push\n" }), []);
});

test("引用符付きのself_refも読み取る", () => {
  assert.deepEqual(check({ "ci.yml": USES("v1.0.0") + `      self_ref: "v1.0.0"\n` }), []);
  assert.equal(check({ "ci.yml": USES("v1.0.0") + `      self_ref: 'v0.9.0'\n` }).length, 1);
});

test("コメント行のself_ref:・uses:は誤検知しない", () => {
  const content =
    "      # self_ref: v1.0.0（古い値の例）\n" +
    "      # uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@v0.1.0\n" +
    USES("v2.124.0") +
    SELF("v2.124.0") +
    "      other: value # self_ref: v9.9.9\n";
  assert.deepEqual(check({ "ci.yml": content }), []);
});

test("stripComment: 行頭・空白の後ろの#以降を消す。URLの#のような空白の無い#は残す", () => {
  assert.equal(stripComment("# comment").trim(), "");
  assert.equal(stripComment("key: value # comment").trim(), "key: value");
  assert.equal(stripComment("url: https://example.com/a#b").trim(), "url: https://example.com/a#b");
});

test("listWorkflowFiles: .yml・.yaml だけを名前順で返し、ディレクトリが無ければ空", () => {
  assert.deepEqual(listWorkflowFiles("/nonexistent/path"), []);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "refs-list-"));
  for (const name of ["b.yml", "a.yaml", "readme.md"]) fs.writeFileSync(path.join(root, name), "");
  try {
    assert.deepEqual(listWorkflowFiles(root), ["a.yaml", "b.yml"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
