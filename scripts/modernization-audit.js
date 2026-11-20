#!/usr/bin/env node
"use strict";

// モダナイズ観点（docs/ai-driven-app-curriculum.md「モダナイズ観点リストと達成条件」）の達成状況を、
// リポジトリのファイルから機械的に判定して表にする（issue #1463）。
// 観点ごとにissueを起票して手作業で突き合わせると、確認だけでセッションの大半を使い、見落としも出る。
// 達成済みの観点は索引issueの表へ根拠とともに記録し、未達の観点だけをissueにする運用を支える。
//
// 使い方: node dev-standards/scripts/modernization-audit.js [リポジトリのルート] [--format=markdown|text]
//          [--run=<CIのrun_id> --repo=owner/name]
// 判定のみで、参照側への変更はしない。標準モジュールだけで動く。
// --runなしでは、実行結果の確認が必要な観点を「要確認」とし、確認方法を根拠に書く。
// --run（issue #1503）を付けると、GitHub APIでCIのジョブのステップの結果を取得し、
// 「要確認」の観点を「達成」または「未達」へ変える。
//   認証: 環境変数GITHUB_TOKENで受ける。未指定なら、--runは使えない（エラーで終わる）。
//   レート制限: 呼び出しは、ジョブ一覧の取得（1ページ100件、最大3ページ）だけである。
//   トークンはログへ出さない。

const fs = require("fs");
const path = require("path");
const { stripComment } = require("./check-dev-standards-refs.js");

const STATUS = { ACHIEVED: "達成", MISSING: "未達", NA: "対象外", CHECK: "要確認" };

function readIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** YAMLのコメントを除いた本文。コメント内の記述で誤判定しない */
function readYaml(file) {
  const content = readIfExists(file);
  return content === null ? null : content.split("\n").map(stripComment).join("\n");
}

function listFilesRecursive(dir, { exts, skip = new Set(["node_modules", ".git", "dist", "coverage"]) }) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return skip.has(entry.name) ? [] : listFilesRecursive(full, { exts, skip });
    return exts.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

const result = (perspective, status, evidence) => ({ perspective, status, evidence });

/** `with:`のキーがtrueか（`enable_x: true`） */
const isEnabled = (yaml, key) => new RegExp(`^\\s*${key}:\\s*["']?true["']?\\s*$`, "m").test(yaml || "");

function audit(root) {
  const read = (rel) => readIfExists(path.join(root, rel));
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  const ci = readYaml(path.join(root, ".github/workflows/ci.yml")) || "";
  const cd = readYaml(path.join(root, ".github/workflows/cd.yml"));
  const codeql = readYaml(path.join(root, ".github/workflows/codeql.yml"));
  const hasBackend = exists("backend");
  const frontendDir = exists("frontend") ? "frontend" : ".";
  const eslintConfigs = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"]
    .flatMap((name) => [path.join(frontendDir, name), name])
    .map((rel) => ({ rel, content: read(rel) }))
    .filter((c) => c.content !== null);
  const eslintText = eslintConfigs.map((c) => c.content).join("\n");
  const sources = listFilesRecursive(path.join(root, frontendDir, "src"), { exts: [".js", ".jsx", ".ts", ".tsx"] });
  const results = [];

  // CD有効化
  results.push(
    cd !== null && /reusable-cd\.yml/.test(cd)
      ? result("CD有効化", STATUS.ACHIEVED, ".github/workflows/cd.yml が reusable-cd.yml を呼び出している")
      : result("CD有効化", STATUS.MISSING, ".github/workflows/cd.yml が無い、または reusable-cd.yml を呼び出していない")
  );

  // フロントエンド単体テスト（実行結果の確認が要る）
  const hasThreshold = /coverage_threshold["']?\s*[:=]\s*["']?[1-9]/.test(ci);
  if (!hasThreshold) {
    results.push(result("フロントエンド単体テスト", STATUS.MISSING, "ci.yml に 0 より大きい coverage_threshold が無い"));
  } else if (!/^\s*self_ref:\s*\S+/m.test(ci)) {
    results.push(result("フロントエンド単体テスト", STATUS.MISSING, "coverage_threshold はあるが、self_ref が未指定のため、閾値の判定はスキップされる（dev-standards#1460）"));
  } else {
    results.push(result("フロントエンド単体テスト", STATUS.CHECK, "ci.yml に coverage_threshold と self_ref がある。CIの「カバレッジ閾値を確認する」ステップが skipped でないかを、実行ログで確認する"));
  }

  // カバレッジの計測対象
  const viteConfig = ["vite.config.ts", "vite.config.js", "vitest.config.ts", "vitest.config.js"]
    .map((name) => read(path.join(frontendDir, name)))
    .find((c) => c !== null);
  if (viteConfig === undefined) {
    results.push(result("カバレッジの計測対象", STATUS.CHECK, "vite.config / vitest.config が見つからない"));
  } else {
    results.push(
      /coverage\s*:\s*\{[^}]*include\s*:/s.test(viteConfig)
        ? result("カバレッジの計測対象", STATUS.ACHIEVED, "vite.config の test.coverage に include がある")
        : result("カバレッジの計測対象", STATUS.MISSING, "vite.config の test.coverage.include が無い（テストの無いファイルが集計から消える）")
    );
  }

  // バックエンドのテスト・アーキテクチャ境界
  results.push(
    hasBackend
      ? result("バックエンドAPIを持つ場合のテスト", STATUS.CHECK, "backend/ がある。CIのバックエンドのカバレッジ閾値の設定と実行を確認する")
      : result("バックエンドAPIを持つ場合のテスト", STATUS.NA, "backend/ が無い")
  );
  results.push(
    !hasBackend
      ? result("アーキテクチャ境界チェック", STATUS.NA, "backend/ が無く、複数パッケージ構成ではない")
      : isEnabled(ci, "enable_architecture_check")
        ? result("アーキテクチャ境界チェック", STATUS.ACHIEVED, "ci.yml で enable_architecture_check が true")
        : result("アーキテクチャ境界チェック", STATUS.MISSING, "ci.yml で enable_architecture_check が有効でない")
  );

  // 単純なフラグの観点
  const flags = [
    ["E2Eテスト", "enable_e2e_test", "enable_e2e_test"],
    ["コード重複検知", "enable_duplication_check", "enable_duplication_check"],
    ["ドキュメント運用", "enable_text_lint", "enable_text_lint"],
    ["依存更新の運用・SBOM", "enable_dependency_risk_summary", "enable_dependency_risk_summary"],
  ];
  for (const [perspective, key] of flags) {
    results.push(
      isEnabled(ci, key)
        ? result(perspective, STATUS.ACHIEVED, `ci.yml で ${key} が true`)
        : result(perspective, STATUS.MISSING, `ci.yml で ${key} が有効でない`)
    );
  }

  // lintルール整備・アクセシビリティ
  if (eslintConfigs.length === 0) {
    results.push(result("lintルール整備", STATUS.MISSING, "eslint.config.* が見つからない"));
  } else {
    const missing = ["complexity", "sonarjs"].filter((rule) => !eslintText.includes(rule));
    results.push(
      missing.length === 0
        ? result("lintルール整備", STATUS.ACHIEVED, `${eslintConfigs[0].rel} に complexity・sonarjs がある（エラー0件かはCIで確認）`)
        : result("lintルール整備", STATUS.MISSING, `${eslintConfigs[0].rel} に ${missing.join("・")} が無い`)
    );
  }
  const hasJsx = sources.some((file) => /\.(jsx|tsx)$/.test(file));
  results.push(
    !hasJsx
      ? result("アクセシビリティ", STATUS.NA, "JSX/TSX のファイルが無い")
      : eslintText.includes("jsx-a11y")
        ? result("アクセシビリティ", STATUS.ACHIEVED, "eslint設定に jsx-a11y がある（エラー0件かはCIで確認）")
        : result("アクセシビリティ", STATUS.MISSING, "eslint設定に jsx-a11y が無い")
  );

  // CodeQL
  if (codeql === null || !/reusable-codeql\.yml/.test(codeql)) {
    results.push(result("セキュリティスキャン（CodeQL）", STATUS.MISSING, ".github/workflows/codeql.yml が無い、または reusable-codeql.yml を呼び出していない"));
  } else {
    results.push(
      /security-events:\s*write/.test(codeql)
        ? result("セキュリティスキャン（CodeQL）", STATUS.ACHIEVED, "codeql.yml が reusable-codeql.yml を呼び、security-events: write がある")
        : result("セキュリティスキャン（CodeQL）", STATUS.MISSING, "codeql.yml の permissions に security-events: write が無い（startup_failureになる）")
    );
  }

  // Renovate
  const renovateText = read("renovate.json");
  if (renovateText === null) {
    results.push(result("依存更新の自動化（Renovate）", STATUS.MISSING, "renovate.json が無い"));
  } else {
    let renovate = {};
    try {
      renovate = JSON.parse(renovateText);
    } catch {
      renovate = null;
    }
    if (renovate === null) {
      results.push(result("依存更新の自動化（Renovate）", STATUS.MISSING, "renovate.json がJSONとして読めない"));
    } else {
      const lacking = [];
      if (renovate["git-submodules"]?.enabled !== true) lacking.push("git-submodules の有効化");
      if (!Array.isArray(renovate.customManagers) || renovate.customManagers.length === 0) lacking.push("customManagers（self_ref の追従）");
      if (!Array.isArray(renovate.packageRules) || renovate.packageRules.length === 0) lacking.push("packageRules");
      results.push(
        lacking.length === 0
          ? result("依存更新の自動化（Renovate）", STATUS.ACHIEVED, "renovate.json に git-submodules・customManagers・packageRules がある")
          : result("依存更新の自動化（Renovate）", STATUS.MISSING, `renovate.json に ${lacking.join("・")} が無い`)
      );
    }
  }

  // UI規約・オフライン動作・プロダクトのドキュメント
  const usesVersion = sources.some((file) => (readIfExists(file) || "").includes("__APP_VERSION__")) ||
    sources.some((file) => /AppVersionInfo/.test(path.basename(file)));
  results.push(
    usesVersion
      ? result("UI規約", STATUS.ACHIEVED, "バージョン表示（__APP_VERSION__ または AppVersionInfo）がある")
      : result("UI規約", STATUS.MISSING, "バージョン表示（__APP_VERSION__・AppVersionInfo）が見つからない")
  );
  const indexHtml = read(path.join(frontendDir, "index.html"));
  const cdnRefs = indexHtml === null ? [] : [...indexHtml.matchAll(/<(?:link|script)[^>]*(?:href|src)="(https:\/\/(?:cdn|unpkg)[^"]*)"/g)].map((m) => m[1]);
  results.push(
    indexHtml === null
      ? result("オフライン動作", STATUS.CHECK, "index.html が見つからない")
      : cdnRefs.length > 0
        ? result("オフライン動作", STATUS.MISSING, `index.html が CDN から読み込んでいる: ${cdnRefs.join(", ")}`)
        : result("オフライン動作", STATUS.ACHIEVED, "index.html が CDN を参照していない（オフラインの実動作は別途確認）")
  );
  const docs = exists("docs") ? fs.readdirSync(path.join(root, "docs")).filter((name) => name.endsWith(".md")) : [];
  const hasSpec = docs.some((name) => /specification|spec/i.test(name) && !/cicd|pipeline/i.test(name));
  const hasArchitecture = docs.some((name) => /architecture/i.test(name));
  results.push(
    hasSpec && hasArchitecture
      ? result("プロダクトのドキュメント", STATUS.ACHIEVED, "docs/ に仕様と構成（architecture）の文書がある")
      : result("プロダクトのドキュメント", STATUS.MISSING, `docs/ に ${[hasSpec ? null : "仕様", hasArchitecture ? null : "構成（architecture）"].filter(Boolean).join("・")} の文書が見つからない`)
  );

  // 機械的に判定できない観点
  for (const perspective of ["個人情報の扱い", "GitHub Actions内の秘密情報の露出防止", "ブルーグリーン（canary）デプロイ"]) {
    results.push(result(perspective, STATUS.CHECK, "ファイルだけでは判定できない。設計・運用を人が確認する"));
  }
  results.push(
    hasBackend
      ? result("運用監視", STATUS.CHECK, "backend/ がある。CloudWatch Alarm等の通知の仕組みを確認する")
      : result("運用監視", STATUS.NA, "backend/ が無い")
  );

  return results;
}

// --run（issue #1503）: CIのジョブのステップの結果で、「要確認」の観点を判定する。
// jobsは、GitHub APIのジョブ一覧（{ name, steps: [{ name, conclusion }] }の配列）
const RUN_CHECKS = [
  { perspective: "フロントエンド単体テスト", jobName: "フロントエンドテスト", stepPrefix: "カバレッジ閾値を確認する" },
  { perspective: "バックエンドAPIを持つ場合のテスト", jobName: "バックエンドテスト", stepPrefix: "カバレッジ閾値を確認する" },
];

function judgeStep(step, jobName) {
  const seen = `${jobName}「${step.name}」: ${step.conclusion}`;
  if (step.conclusion === "success") return { status: STATUS.ACHIEVED, evidence: `CIの実行結果で、閾値の判定が実行され成功した（${seen}）` };
  if (step.conclusion === "skipped") return { status: STATUS.MISSING, evidence: `CIの実行結果で、閾値の判定がスキップされた（${seen}）` };
  if (step.conclusion === "failure") return { status: STATUS.MISSING, evidence: `CIの実行結果で、閾値の判定が失敗した（${seen}）` };
  return null;
}

function applyRunResults(results, jobs) {
  return results.map((r) => {
    const check = RUN_CHECKS.find((c) => c.perspective === r.perspective);
    if (!check || r.status !== STATUS.CHECK) return r;
    const job = jobs.find((j) => String(j.name).includes(check.jobName));
    const step = job && (job.steps || []).find((st) => String(st.name).startsWith(check.stepPrefix));
    if (!step) return { ...r, evidence: `${r.evidence}（指定したrunに、${check.jobName}の「${check.stepPrefix}」ステップが見つからない）` };
    const judged = judgeStep(step, job.name);
    return judged ? result(r.perspective, judged.status, judged.evidence) : r;
  });
}

const MAX_JOB_PAGES = 3;

async function fetchRunJobs({ repo, runId, token, fetchImpl = fetch }) {
  const jobs = [];
  for (let page = 1; page <= MAX_JOB_PAGES; page += 1) {
    const url = `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?per_page=100&page=${page}`;
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!res.ok) {
      const hint = res.status === 403 || res.status === 429 ? "（レート制限、または権限不足の可能性がある）" : "";
      throw new Error(`GitHub APIの呼び出しに失敗した: HTTP ${res.status}${hint}`);
    }
    const body = await res.json();
    jobs.push(...(body.jobs || []));
    if ((body.jobs || []).length < 100) break;
  }
  return jobs;
}

const ESCAPE_PIPE = (text) => String(text).replace(/\|/g, "\\|");

function formatMarkdown(results) {
  const rows = results.map((r) => `| ${r.perspective} | ${r.status} | ${ESCAPE_PIPE(r.evidence)} |`).join("\n");
  const count = (status) => results.filter((r) => r.status === status).length;
  const summary = Object.values(STATUS).map((s) => `${s} ${count(s)}件`).join("・");
  return `| 観点 | 判定 | 根拠 |\n|---|---|---|\n${rows}\n\n${summary}\n`;
}

function formatText(results) {
  return results.map((r) => `[${r.status}] ${r.perspective}: ${r.evidence}`).join("\n") + "\n";
}

async function main() {
  const args = process.argv.slice(2);
  const format = (args.find((a) => a.startsWith("--format=")) || "--format=text").split("=")[1];
  const root = path.resolve(args.find((a) => !a.startsWith("--")) || process.cwd());
  let results = audit(root);
  const runArg = args.find((a) => a.startsWith("--run="));
  if (runArg) {
    const repoArg = args.find((a) => a.startsWith("--repo="));
    const token = process.env.GITHUB_TOKEN;
    if (!repoArg || !token) {
      process.stderr.write("--runには、--repo=owner/name と、環境変数GITHUB_TOKENが要る\n");
      process.exit(1);
    }
    const jobs = await fetchRunJobs({ repo: repoArg.split("=")[1], runId: runArg.split("=")[1], token });
    results = applyRunResults(results, jobs);
  }
  process.stdout.write(format === "markdown" ? formatMarkdown(results) : formatText(results));
}

module.exports = { audit, formatMarkdown, formatText, STATUS, applyRunResults, fetchRunJobs };

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
