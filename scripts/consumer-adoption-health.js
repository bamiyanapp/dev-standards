"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { listConsumerRepositories } = require("./consumer-repositories");
const { parseConfig, extendsPreset } = require("./check-renovate-preset");

// issue #1600。参照側が、dev-standardsの版に取り残されていること、Renovateが動いていないことに、気づく手段が無かった。
// 取り込みは、各プロダクトの管理である（#1527）。これは、完了条件ではなく、運用の安全網（情報提供）で、失敗させない。
// 対象は、docs/consumer-repositories.mdの表から機械的に読む（dev-standards自身は、相対パスで参照するため、対象外）。
// 見る項目:
//   - Renovateの設定ファイルの有無と、共有プリセット（github>bamiyanapp/dev-standards）の継承
//   - .github/workflows/配下の、dev-standardsへの参照（uses:の@タグと、self_ref）の版と、最新との差
// 読めないリポジトリ（非公開など）は、失敗させず、「読めなかった」と明記する。
// submoduleの参照は、タグでなくコミットで固定されるため、ここでは見ない。

const DOC_PATH = path.join(__dirname, "..", "docs", "consumer-repositories.md");
const SELF = "bamiyanapp/dev-standards";
/** 最新との差が、この版数（マイナーバージョンの差）以上なら、一覧に載せる */
const DEFAULT_LAG_THRESHOLD = 30;
const RENOVATE_FILES = ["renovate.json", "renovate.json5", ".github/renovate.json", ".github/renovate.json5", ".renovaterc", ".renovaterc.json"];

/** 「v2.184.3」→ {major, minor, patch}。読めなければ、null */
function parseVersion(tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(tag));
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) } : null;
}

/** 最新との差（マイナーバージョンの数）。メジャーが違うときは、Infinity。読めなければ、null */
function lagOf(latestTag, tag) {
  const a = parseVersion(latestTag);
  const b = parseVersion(tag);
  if (!a || !b) return null;
  if (a.major !== b.major) return a.major > b.major ? Infinity : 0;
  return Math.max(0, a.minor - b.minor);
}

/** workflowの本文から、dev-standardsへの参照の版（uses:の@タグ・self_ref）を集める。コメント行は無視する */
function extractVersions(text) {
  const found = new Set();
  for (const raw of String(text).split("\n")) {
    const line = raw.replace(/^\s*#.*$/, "");
    for (const m of line.matchAll(/bamiyanapp\/dev-standards\/[^\s@]*@(v\d+\.\d+\.\d+)/g)) found.add(m[1]);
    const s = /self_ref:\s*["']?(v\d+\.\d+\.\d+)/.exec(line);
    if (s) found.add(s[1]);
  }
  return [...found];
}

function authHeaders(token) {
  return { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function getJson(url, { fetchImpl, token }) {
  const res = await fetchImpl(url, { headers: authHeaders(token) });
  if (!res.ok) return { ok: false, status: res.status, json: null };
  return { ok: true, status: res.status, json: await res.json() };
}

const decode = (content) => Buffer.from(String(content ?? ""), "base64").toString("utf-8");

/** dev-standardsの最新のタグ。releases/latestを先に、読めなければ、タグ一覧の先頭 */
async function latestTag(opts) {
  const rel = await getJson(`https://api.github.com/repos/${SELF}/releases/latest`, opts);
  if (rel.ok && rel.json?.tag_name) return rel.json.tag_name;
  const tags = await getJson(`https://api.github.com/repos/${SELF}/tags?per_page=1`, opts);
  return tags.ok ? (tags.json?.[0]?.name ?? null) : null;
}

/** Renovateの設定の有無と、共有プリセットの継承。見つからなければ、found: null */
async function renovateState(repo, opts) {
  for (const file of RENOVATE_FILES) {
    const r = await getJson(`https://api.github.com/repos/${repo}/contents/${file}`, opts);
    if (r.status === 404) continue;
    if (!r.ok) return { unreadable: `HTTP ${r.status}（${file}）` };
    let preset = null;
    try {
      preset = extendsPreset(parseConfig(decode(r.json.content)));
    } catch {
      preset = null; // 設定を読めなかった（継承の有無は、不明）
    }
    return { found: file, preset };
  }
  return { found: null, preset: null };
}

/** .github/workflows/配下の、dev-standardsへの参照の版（ファイルごと） */
async function workflowVersions(repo, opts) {
  const dir = await getJson(`https://api.github.com/repos/${repo}/contents/.github/workflows`, opts);
  if (dir.status === 404) return { versions: [] };
  if (!dir.ok) return { unreadable: `HTTP ${dir.status}（.github/workflows）` };
  const versions = [];
  for (const f of (dir.json ?? []).filter((x) => x.type === "file" && /\.ya?ml$/.test(x.name))) {
    const r = await getJson(`https://api.github.com/repos/${repo}/contents/.github/workflows/${f.name}`, opts);
    if (!r.ok) return { unreadable: `HTTP ${r.status}（${f.name}）` };
    for (const tag of extractVersions(decode(r.json.content))) versions.push({ file: f.name, tag });
  }
  return { versions };
}

/** 1つの参照側を調べる。読めない（404・403等）場合は、失敗させず、「読めなかった」として返す */
async function checkRepo(repo, latest, opts) {
  try {
    const renovate = await renovateState(repo, opts);
    const wf = await workflowVersions(repo, opts);
    const unreadable = renovate.unreadable ?? wf.unreadable ?? null;
    if (unreadable) return { repo, unreadable };
    const tags = [...new Set(wf.versions.map((v) => v.tag))];
    // 参照の版のうち、最も古いもの（混在しているときは、取り残されている側）
    const lags = tags.map((t) => ({ tag: t, lag: lagOf(latest, t) })).filter((x) => x.lag !== null);
    const worst = lags.sort((a, b) => b.lag - a.lag)[0] ?? null;
    return { repo, unreadable: null, renovate, tags, oldest: worst?.tag ?? null, lag: worst?.lag ?? null };
  } catch (e) {
    return { repo, unreadable: String(e.message ?? e) };
  }
}

/** 一覧に載せる理由（なければ、空配列） */
function findingsOf(r, threshold) {
  if (r.unreadable) return [];
  const reasons = [];
  if (!r.renovate.found) reasons.push("Renovateの設定が無い");
  if (r.lag !== null && r.lag >= threshold) reasons.push(r.lag === Infinity ? "メジャーバージョンが古い" : `${r.lag}版遅れ`);
  return reasons;
}

function render(results, latest, threshold = DEFAULT_LAG_THRESHOLD) {
  const lines = ["## 参照側のdev-standardsの取り込み状況", "", `最新: ${latest ?? "（取得できなかった）"} / 一覧に載せる遅れ: ${threshold}版以上、またはRenovate設定なし`, ""];
  lines.push("| リポジトリ | Renovate設定 | 共有プリセット | 参照している版 | 最新との差 | 状態 |", "|---|---|---|---|---|---|");
  const flagged = [];
  for (const r of results) {
    if (r.unreadable) {
      lines.push(`| ${r.repo} | — | — | — | — | ⚠️ 読めなかった（${r.unreadable}） |`);
      continue;
    }
    const reasons = findingsOf(r, threshold);
    if (reasons.length > 0) flagged.push({ repo: r.repo, reasons });
    const preset = r.renovate.found ? (r.renovate.preset === true ? "✅" : r.renovate.preset === false ? "継承なし" : "不明") : "—";
    const tags = r.tags.length > 0 ? r.tags.join("・") : "（参照なし）";
    const lag = r.lag === null ? "—" : r.lag === Infinity ? "メジャー違い" : `${r.lag}版`;
    lines.push(`| ${r.repo} | ${r.renovate.found ?? "**なし**"} | ${preset} | ${tags} | ${lag} | ${reasons.length > 0 ? `❌ ${reasons.join("・")}` : "✅"} |`);
  }
  if (flagged.length > 0) {
    lines.push("", "### 取り残されている可能性があるリポジトリ", "");
    for (const f of flagged) lines.push(`- ${f.repo}: ${f.reasons.join("・")}`);
  }
  if (results.some((r) => r.unreadable)) {
    lines.push("", "読めなかったリポジトリは、検知の対象外になっている。黙って飛ばさず、ここへ明記する。非公開のリポジトリは、このworkflowの権限では読めない。");
  }
  lines.push("", "取り込みは、各プロダクトの管理である（#1527）。これは、気づくための情報で、完了条件ではない。submoduleの参照は、タグでなくコミットで固定されるため、ここでは見ない。");
  return { markdown: lines.join("\n") + "\n", hasFindings: flagged.length > 0 };
}

async function main() {
  const repos = listConsumerRepositories(fs.readFileSync(DOC_PATH, "utf-8"))
    .map((r) => r.repo)
    .filter((r) => r !== SELF);
  const opts = { fetchImpl: fetch, token: process.env.GITHUB_TOKEN };
  const threshold = Number(process.env.LAG_THRESHOLD) > 0 ? Number(process.env.LAG_THRESHOLD) : DEFAULT_LAG_THRESHOLD;
  const latest = await latestTag(opts);
  const results = [];
  for (const repo of repos) results.push(await checkRepo(repo, latest, opts));
  const { markdown, hasFindings } = render(results, latest, threshold);
  console.log(markdown);
  if (process.env.GITHUB_OUTPUT) {
    const delim = "EOF_BODY";
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_findings=${hasFindings}\nbody<<${delim}\n${markdown}${delim}\n`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { parseVersion, lagOf, extractVersions, latestTag, renovateState, workflowVersions, checkRepo, findingsOf, render, DEFAULT_LAG_THRESHOLD };
