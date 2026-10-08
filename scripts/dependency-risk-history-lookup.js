"use strict";

const fs = require("node:fs");
const { parseSemver } = require("./dependency-update-info.js");

// issue #746 Phase 2（後半）。dev-standards自身のリリースに含まれる依存更新の
// Risk判定結果（append-dependency-risk-history.jsがdocs/generated/
// dependency-risk-history.jsonへ記録したもの）を、プロダクト側（karuta等）の
// `chore(deps): update bamiyanapp/dev-standards action to vX.Y.Z`等のPRが
// 参照できるようにする。dev-standards側で既に下した判定結果を、プロダクト側で
// ゼロから再評価する重複作業を避けるのが目的
//
// 対象のPRが更新するdev-standardsのバージョン範囲（旧ref超過〜新ref以下）に
// 該当する履歴エントリを、新バージョンのタグ時点でのdependency-risk-history.jsonから
// 取得して絞り込む（複数バージョンを一度に飛び越える更新PRにも対応する）

const RAW_CONTENT_BASE = "https://raw.githubusercontent.com/bamiyanapp/dev-standards";
const HISTORY_PATH = "docs/generated/dependency-risk-history.json";

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if ((a.minor ?? 0) !== (b.minor ?? 0)) return (a.minor ?? 0) - (b.minor ?? 0);
  return (a.patch ?? 0) - (b.patch ?? 0);
}

// history: dependency-risk-history.jsonの配列全体
// oldRef・newRef: actionChange（github-actions-update-info.js出力）のoldRef・newRef
// 戻り値: oldRefより新しくnewRef以下のバージョンのエントリ（バージョン昇順）
function filterHistoryEntries(history, oldRef, newRef) {
  const oldV = parseSemver(oldRef);
  const newV = parseSemver(newRef);
  if (!oldV || !newV || !Array.isArray(history)) return [];

  return history
    .map((entry) => ({ entry, v: parseSemver(entry.version) }))
    .filter(({ v }) => v && compareSemver(v, oldV) > 0 && compareSemver(v, newV) <= 0)
    .sort((a, b) => compareSemver(a.v, b.v))
    .map(({ entry }) => entry);
}

const riskLabel = { low: "🟢 LOW", medium: "🟡 MEDIUM", high: "🔴 HIGH" };

function formatLevel(level) {
  return level != null ? riskLabel[level] ?? level : "-（データ無し）";
}

// entries: filterHistoryEntries()の出力。空配列の場合はnullを返す（セクション自体を省略する）
function buildSection(entries) {
  if (entries.length === 0) return null;

  let body = "### dev-standards側で既に評価済みのRisk（issue #746）\n\n";
  body +=
    "この更新に含まれるdev-standardsの各バージョンについて、dev-standards自身のリリース時点でのRisk判定結果です。\n\n";
  body += "| バージョン | 適用リスク | 維持リスク |\n|---|---|---|\n";
  for (const e of entries) {
    body += `| ${e.version} | ${formatLevel(e.riskLevel)} | ${formatLevel(e.staleRiskLevel)} |\n`;
  }
  body += "\n<details><summary>各バージョンの判定理由</summary>\n\n";
  for (const e of entries) {
    body += `**v${e.version}**\n\n`;
    if (e.riskReasons?.length > 0) {
      body += "適用リスクの理由:\n";
      for (const r of e.riskReasons) body += `- ${r}\n`;
    }
    if (e.staleRiskReasons?.length > 0) {
      body += "維持リスクの理由:\n";
      for (const r of e.staleRiskReasons) body += `- ${r}\n`;
    }
    body += "\n";
  }
  body += "</details>\n";
  return body;
}

async function defaultFetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// actionChanges: github-actions-update-info.jsの出力（dependency-risk-summary jobの
// /tmp/actions-update-info.json）。この中からdev-standards自身への参照の変更を探す
function findDevStandardsChange(actionChanges) {
  return actionChanges.find(
    (c) => c.action === "bamiyanapp/dev-standards" || c.action?.startsWith("bamiyanapp/dev-standards/"),
  );
}

// fetchJsonImpl: テスト用に差し替え可能なHTTP呼び出し実装（既定はグローバルfetch）
async function lookupDevStandardsRiskHistory(actionChanges, { fetchJsonImpl = defaultFetchJson } = {}) {
  const change = findDevStandardsChange(actionChanges);
  if (!change) return null;

  const url = `${RAW_CONTENT_BASE}/${change.newRef}/${HISTORY_PATH}`;
  let history;
  try {
    history = await fetchJsonImpl(url);
  } catch {
    // 履歴ファイルが無い（旧バージョン、本機能導入前のタグ等）・一時的な
    // ネットワーク障害等。「データが無い」として安全側にセクションを省略する
    return null;
  }

  const entries = filterHistoryEntries(history, change.oldRef, change.newRef);
  return buildSection(entries);
}

function main() {
  const [, , actionsUpdateInfoPath] = process.argv;
  if (!actionsUpdateInfoPath) {
    console.error("Usage: node dependency-risk-history-lookup.js <actions-update-info.json>");
    process.exitCode = 1;
    return;
  }

  let actionChanges;
  try {
    actionChanges = JSON.parse(fs.readFileSync(actionsUpdateInfoPath, "utf-8"));
  } catch (error) {
    console.error(`${actionsUpdateInfoPath}の読み込みに失敗したため、セクションをスキップする: ${error.message}`);
    return;
  }

  lookupDevStandardsRiskHistory(actionChanges)
    .then((section) => {
      if (section) console.log(section);
    })
    .catch((error) => {
      // ネットワーク呼び出しは本質的に不確実であり、この情報は補助的な注記に
      // すぎないため、失敗してもCIステップ自体は失敗させない（呼び出し側で
      // continue-on-errorにする想定だが、念のためここでも握る）
      console.error(`dev-standardsのRisk履歴取得に失敗したが、処理を継続する: ${error.message}`);
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  compareSemver,
  filterHistoryEntries,
  buildSection,
  findDevStandardsChange,
  lookupDevStandardsRiskHistory,
};
