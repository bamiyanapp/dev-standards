"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { audit, formatMarkdown, formatText, STATUS, applyRunResults, fetchRunJobs } = require("./modernization-audit.js");

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

// --run（issue #1503）: GitHub APIの応答をスタブして、ステップの結果で「要確認」を判定する
const checkResults = () => [
  { perspective: "フロントエンド単体テスト", status: STATUS.CHECK, evidence: "元の根拠" },
  { perspective: "バックエンドAPIを持つ場合のテスト", status: STATUS.CHECK, evidence: "元の根拠" },
  { perspective: "カバレッジの計測対象", status: STATUS.MISSING, evidence: "変えない" },
];
const jobsWith = (frontendConclusion, backendConclusion) => [
  { name: "ci / フロントエンドテスト", steps: [{ name: "Checkout", conclusion: "success" }, { name: "カバレッジ閾値を確認する", conclusion: frontendConclusion }] },
  { name: "ci / バックエンドテスト", steps: [{ name: "カバレッジ閾値を確認する（1回目/2回）", conclusion: backendConclusion }] },
  { name: "ci / フロントエンドE2Eテスト", steps: [{ name: "カバレッジ閾値を確認する", conclusion: "skipped" }] },
];

test("applyRunResults: skippedのステップは「未達」、successは「達成」と判定し、見たステップ名を根拠に書く", () => {
  const out = applyRunResults(checkResults(), jobsWith("skipped", "success"));
  const frontend = find(out, "フロントエンド単体テスト");
  assert.equal(frontend.status, STATUS.MISSING);
  assert.match(frontend.evidence, /スキップされた/);
  assert.match(frontend.evidence, /カバレッジ閾値を確認する/);
  const backend = find(out, "バックエンドAPIを持つ場合のテスト");
  assert.equal(backend.status, STATUS.ACHIEVED);
  assert.match(backend.evidence, /1回目\/2回/);
});

test("applyRunResults: E2Eのジョブを、フロントエンド単体テストと取り違えない", () => {
  const jobs = [{ name: "ci / フロントエンドE2Eテスト", steps: [{ name: "カバレッジ閾値を確認する", conclusion: "skipped" }] }];
  const out = applyRunResults(checkResults(), jobs);
  assert.equal(find(out, "フロントエンド単体テスト").status, STATUS.CHECK);
});

test("applyRunResults: failureは「未達」、ステップが無い場合は「要確認」のまま、他の観点は変えない", () => {
  const failed = applyRunResults(checkResults(), jobsWith("failure", "success"));
  assert.equal(find(failed, "フロントエンド単体テスト").status, STATUS.MISSING);
  assert.match(find(failed, "フロントエンド単体テスト").evidence, /失敗/);
  const none = applyRunResults(checkResults(), []);
  assert.equal(find(none, "フロントエンド単体テスト").status, STATUS.CHECK);
  assert.match(find(none, "フロントエンド単体テスト").evidence, /見つからない/);
  assert.equal(find(failed, "カバレッジの計測対象").evidence, "変えない");
});

test("fetchRunJobs: 認証ヘッダーを付けてジョブ一覧を取得し、100件ならつぎのページも取る", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization });
    const jobs = calls.length === 1 ? Array.from({ length: 100 }, (_, i) => ({ name: `j${i}` })) : [{ name: "last" }];
    return { ok: true, status: 200, json: async () => ({ jobs }) };
  };
  const jobs = await fetchRunJobs({ repo: "o/r", runId: "42", token: "TOKEN", fetchImpl });
  assert.equal(jobs.length, 101);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /repos\/o\/r\/actions\/runs\/42\/jobs\?per_page=100&page=1/);
  assert.equal(calls[0].auth, "Bearer TOKEN");
});

test("fetchRunJobs: 失敗時は、トークンを含めずにエラーにする（403はレート制限・権限の可能性を示す）", async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });
  await assert.rejects(fetchRunJobs({ repo: "o/r", runId: "1", token: "SECRET", fetchImpl }), (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.match(error.message, /レート制限/);
    assert.equal(error.message.includes("SECRET"), false);
    return true;
  });
});
