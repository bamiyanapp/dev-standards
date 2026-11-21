"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { listConsumerRepositories } = require("./consumer-repositories");

// issue #1546。startup_failureは、壊れたworkflow自身では検知できない。
// 1件も起動しないため、参照側へ監視を入れても導入漏れが起きる。
// dev-standards側の定期workflowから、全参照側のrun一覧を読んで検知する。
// 対象の一覧は、docs/consumer-repositories.mdから機械的に読む。

const DOC_PATH = path.join(__dirname, "..", "docs", "consumer-repositories.md");
const WINDOW_DAYS = 7;

function sinceDate(now, days = WINDOW_DAYS) {
  return new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
}

// 読めない（404・403等）場合は、失敗させず「読めなかった」として返す
async function checkRepo(repo, { fetchImpl, token, now }) {
  const url =
    `https://api.github.com/repos/${repo}/actions/runs` +
    `?status=startup_failure&per_page=100&created=${encodeURIComponent(">=" + sinceDate(now))}`;
  try {
    const res = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) return { repo, unreadable: `HTTP ${res.status}`, runs: [] };
    const json = await res.json();
    const runs = (json.workflow_runs ?? []).map((r) => ({
      name: r.name,
      url: r.html_url,
      createdAt: r.created_at,
    }));
    return { repo, unreadable: null, runs };
  } catch (e) {
    return { repo, unreadable: String(e.message ?? e), runs: [] };
  }
}

function render(results) {
  const failing = results.filter((r) => r.runs.length > 0);
  const unreadable = results.filter((r) => r.unreadable);
  const lines = [`## 参照側のstartup_failure（直近${WINDOW_DAYS}日）`, ""];
  lines.push("| リポジトリ | 状態 |", "|---|---|");
  for (const r of results) {
    const state = r.unreadable
      ? `⚠️ 読めなかった（${r.unreadable}）`
      : r.runs.length > 0
        ? `❌ ${r.runs.length}件`
        : "✅ なし";
    lines.push(`| ${r.repo} | ${state} |`);
  }
  for (const r of failing) {
    lines.push("", `### ${r.repo}`, "");
    for (const run of r.runs) lines.push(`- ${run.name}: ${run.url}（${run.createdAt}）`);
  }
  if (unreadable.length > 0) {
    lines.push("", "読めなかったリポジトリは、検知の対象外になっている。黙って飛ばさず、ここへ明記する。");
  }
  return { markdown: lines.join("\n") + "\n", hasFindings: failing.length > 0 };
}

async function main() {
  const repos = listConsumerRepositories(fs.readFileSync(DOC_PATH, "utf-8")).map((r) => r.repo);
  const opts = { fetchImpl: fetch, token: process.env.GITHUB_TOKEN, now: new Date() };
  const results = [];
  for (const repo of repos) results.push(await checkRepo(repo, opts));
  const { markdown, hasFindings } = render(results);
  console.log(markdown);
  if (process.env.GITHUB_OUTPUT) {
    const delim = "EOF_BODY";
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `has_findings=${hasFindings}\nbody<<${delim}\n${markdown}${delim}\n`,
    );
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { sinceDate, checkRepo, render };
