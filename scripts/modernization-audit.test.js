"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { audit, formatMarkdown, formatText, STATUS } = require("./modernization-audit.js");

function withRepo(files, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const find = (results, perspective) => results.find((r) => r.perspective === perspective);

const FULL_REPO = {
  ".github/workflows/ci.yml": [
    "jobs:",
    "  ci:",
    "    uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@v2.0.0",
    "    with:",
    "      self_ref: v2.0.0",
    '      packages: \'[{"dir":"frontend","coverage_threshold":70}]\'',
    "      enable_e2e_test: true",
    "      enable_duplication_check: true",
    "      enable_text_lint: true",
    "      enable_dependency_risk_summary: true",
  ].join("\n"),
  ".github/workflows/cd.yml": "jobs:\n  release:\n    uses: bamiyanapp/dev-standards/.github/workflows/reusable-cd.yml@v2.0.0\n",
  ".github/workflows/codeql.yml": "jobs:\n  c:\n    uses: bamiyanapp/dev-standards/.github/workflows/reusable-codeql.yml@v2.0.0\n    permissions:\n      security-events: write\n",
  "renovate.json": JSON.stringify({ "git-submodules": { enabled: true }, customManagers: [{}], packageRules: [{}] }),
  "frontend/eslint.config.js": "export default [{ rules: { complexity: 15, 'sonarjs/x': 1, 'jsx-a11y/alt-text': 'error' } }]",
  "frontend/vite.config.ts": "export default { test: { coverage: { include: ['src/**'] } } }",
  "frontend/index.html": '<html><head><link rel="stylesheet" href="app.css"></head></html>',
  "frontend/src/App.tsx": "export const v = __APP_VERSION__;",
  "docs/product-specification.md": "# 仕様",
  "docs/architecture.md": "# 構成",
};

test("条件を満たすリポジトリは、機械判定できる観点がすべて達成になる", () => {
  withRepo(FULL_REPO, (root) => {
    const results = audit(root);
    for (const perspective of [
      "CD有効化", "カバレッジの計測対象", "E2Eテスト", "コード重複検知", "ドキュメント運用", "依存更新の運用・SBOM",
      "lintルール整備", "アクセシビリティ", "セキュリティスキャン（CodeQL）", "依存更新の自動化（Renovate）",
      "UI規約", "オフライン動作", "プロダクトのドキュメント",
    ]) {
      assert.equal(find(results, perspective).status, STATUS.ACHIEVED, perspective);
    }
    assert.equal(find(results, "バックエンドAPIを持つ場合のテスト").status, STATUS.NA);
    assert.equal(find(results, "運用監視").status, STATUS.NA);
    assert.equal(find(results, "個人情報の扱い").status, STATUS.CHECK);
  });
});

test("空のリポジトリでは、機械判定できる観点が未達になり、例外を投げない", () => {
  withRepo({ "README.md": "x" }, (root) => {
    const results = audit(root);
    assert.equal(find(results, "CD有効化").status, STATUS.MISSING);
    assert.equal(find(results, "セキュリティスキャン（CodeQL）").status, STATUS.MISSING);
    assert.equal(find(results, "依存更新の自動化（Renovate）").status, STATUS.MISSING);
    assert.equal(find(results, "lintルール整備").status, STATUS.MISSING);
  });
});

test("フロントエンド単体テスト: coverage_thresholdがあってもself_ref未指定なら未達（スキップされる）", () => {
  const ci = FULL_REPO[".github/workflows/ci.yml"].replace("      self_ref: v2.0.0\n", "");
  withRepo({ ...FULL_REPO, ".github/workflows/ci.yml": ci }, (root) => {
    const r = find(audit(root), "フロントエンド単体テスト");
    assert.equal(r.status, STATUS.MISSING);
    assert.match(r.evidence, /self_ref/);
  });
});

test("フロントエンド単体テスト: 設定が揃っていれば、実行ログの確認が要る（要確認）", () => {
  withRepo(FULL_REPO, (root) => {
    const r = find(audit(root), "フロントエンド単体テスト");
    assert.equal(r.status, STATUS.CHECK);
    assert.match(r.evidence, /skipped/);
  });
});

test("コメント行のenable_*は有効と判定しない", () => {
  const ci = FULL_REPO[".github/workflows/ci.yml"].replace("      enable_text_lint: true", "      # enable_text_lint: true");
  withRepo({ ...FULL_REPO, ".github/workflows/ci.yml": ci }, (root) => {
    assert.equal(find(audit(root), "ドキュメント運用").status, STATUS.MISSING);
  });
});

test("CodeQL: security-events: write が無ければ未達", () => {
  const codeql = FULL_REPO[".github/workflows/codeql.yml"].replace("    permissions:\n      security-events: write\n", "");
  withRepo({ ...FULL_REPO, ".github/workflows/codeql.yml": codeql }, (root) => {
    const r = find(audit(root), "セキュリティスキャン（CodeQL）");
    assert.equal(r.status, STATUS.MISSING);
    assert.match(r.evidence, /security-events/);
  });
});

test("Renovate: 足りない項目を根拠へ列挙する", () => {
  withRepo({ ...FULL_REPO, "renovate.json": JSON.stringify({ "git-submodules": { enabled: true } }) }, (root) => {
    const r = find(audit(root), "依存更新の自動化（Renovate）");
    assert.equal(r.status, STATUS.MISSING);
    assert.match(r.evidence, /customManagers/);
    assert.match(r.evidence, /packageRules/);
  });
});

test("オフライン動作: index.htmlがCDNを読み込んでいれば未達", () => {
  const html = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap.css">';
  withRepo({ ...FULL_REPO, "frontend/index.html": html }, (root) => {
    const r = find(audit(root), "オフライン動作");
    assert.equal(r.status, STATUS.MISSING);
    assert.match(r.evidence, /cdn\.jsdelivr\.net/);
  });
});

test("カバレッジの計測対象: coverage.includeが無ければ未達", () => {
  withRepo({ ...FULL_REPO, "frontend/vite.config.ts": "export default { test: {} }" }, (root) => {
    assert.equal(find(audit(root), "カバレッジの計測対象").status, STATUS.MISSING);
  });
});

test("backend/があれば、バックエンド系の観点は対象外にならない", () => {
  withRepo({ ...FULL_REPO, "backend/package.json": "{}" }, (root) => {
    const results = audit(root);
    assert.equal(find(results, "バックエンドAPIを持つ場合のテスト").status, STATUS.CHECK);
    assert.equal(find(results, "アーキテクチャ境界チェック").status, STATUS.MISSING);
    assert.equal(find(results, "運用監視").status, STATUS.CHECK);
  });
});

test("formatMarkdown: 索引issueへ貼れる表と件数を出し、根拠の|をエスケープする", () => {
  const md = formatMarkdown([
    { perspective: "A", status: STATUS.ACHIEVED, evidence: "x | y" },
    { perspective: "B", status: STATUS.MISSING, evidence: "z" },
  ]);
  assert.match(md, /\| 観点 \| 判定 \| 根拠 \|/);
  assert.match(md, /\| A \| 達成 \| x \\\| y \|/);
  assert.match(md, /達成 1件・未達 1件・対象外 0件・要確認 0件/);
});

test("formatText: 1観点1行", () => {
  assert.equal(formatText([{ perspective: "A", status: STATUS.NA, evidence: "e" }]), "[対象外] A: e\n");
});
