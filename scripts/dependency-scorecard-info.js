"use strict";

const fs = require("node:fs");

// issue #1077。issue #1076（最終リリース日ベースの放置検知）は「更新が止まっているか」
// という一次シグナルのみを見る。コントリビューター数・CI/テストの有無・ブランチ保護
// 設定等、パッケージの質的なメンテナンス状態まで含めた評価には、OpenSSF Scorecard
// （https://github.com/ossf/scorecard）のスコアを使う。
//
// scorecard CLIを自前で実行する方式（GitHub Tokenの大量消費・実行時間増大を伴う）では
// なく、認証不要・軽量な公開データセットAPI（https://api.securityscorecards.dev）を使う。
// dependency-deprecation-info.js・dependency-staleness-info.jsと同じ構成
// （registry/APIレスポンスを解析する純粋関数＋実際にHTTPリクエストを行う
// オーケストレーション関数の分離）で実装する

const NPM_REGISTRY_BASE = "https://registry.npmjs.org";
const SCORECARD_API_BASE = "https://api.securityscorecards.dev/projects";
const SCORE_THRESHOLD_DEFAULT = 3; // 10点満点中。OpenSSF Scorecardの一般的な「懸念あり」水準

// npm registryのrepositoryフィールド（文字列・{url}オブジェクト・`github:owner/repo`
// 省略形等、複数フォーマットがある）からGitHubのowner/repoを抽出する。
// GitHub以外（GitLab等）・フィールド自体が無い場合はnullを返す
function extractGitHubRepo(repository) {
  if (!repository) return null;
  const raw = typeof repository === "string" ? repository : repository.url;
  if (!raw || typeof raw !== "string") return null;

  const githubShorthand = raw.match(/^github:([^/]+)\/([^/#]+?)(?:\.git)?$/);
  if (githubShorthand) return { owner: githubShorthand[1], repo: githubShorthand[2] };

  const urlMatch = raw.match(/github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?\/?$/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };

  return null;
}

// Scorecard APIのレスポンス（{score, ...}）からscoreThreshold判定結果を算出する。
// score自体が無い（プロジェクト未評価）場合は判定不能としてnullを返す（安全側、
// 「不明」を昇格の根拠にしない）。issue #1086: 閾値以上の場合もRisk Summaryへ
// 実測値を表示できるよう、該当の有無に関わらず常に結果を返す（`flagged`で判定結果を示す）
function detectLowScorecard(scorecardResponse, scoreThreshold = SCORE_THRESHOLD_DEFAULT) {
  const score = scorecardResponse?.score;
  if (typeof score !== "number") return null;
  return { score, flagged: score < scoreThreshold };
}

async function defaultFetchJson(url) {
  const response = await fetch(url);
  if (response.status === 404) return null; // プロジェクト未評価。エラーではない
  if (!response.ok) {
    throw new Error(`request to ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// changes: dependency-update-info.jsのchanges（[{ name, oldVersion, newVersion, ... }]）。
// 維持リスクの判定に使うため、oldVersionが存在する変更のみを対象にする。
// issue #1156: production: falseのパッケージ（devDependency経由のみで到達し、本番コードに
// 含まれない）も対象外にする。放置されていても実害が無いパッケージの表示で、本来注目すべき
// 本番コードの依存が埋もれる問題への対応
// 戻り値: [{ name, oldVersion, newVersion, owner, repo, score, flagged }]
// issue #1086: GitHubリポジトリが特定できない・Scorecard未評価（判定不能）の
// パッケージのみ対象外とし、閾値以上（flagged: false）のパッケージも含めて
// 全件返す（Risk Summaryでの実測値表示に使うため）
async function fetchScorecardInfo(changes, { fetchJsonImpl = defaultFetchJson, scoreThreshold = SCORE_THRESHOLD_DEFAULT } = {}) {
  const targets = changes.filter((c) => c.oldVersion != null && c.production !== false);
  const results = [];
  for (const change of targets) {
    const packageJson = await fetchJsonImpl(`${NPM_REGISTRY_BASE}/${change.name}`);
    const githubRepo = extractGitHubRepo(packageJson?.repository);
    if (!githubRepo) continue;

    const scorecardResponse = await fetchJsonImpl(`${SCORECARD_API_BASE}/github.com/${githubRepo.owner}/${githubRepo.repo}`);
    const result = detectLowScorecard(scorecardResponse, scoreThreshold);
    if (!result) continue;
    results.push({ name: change.name, oldVersion: change.oldVersion, newVersion: change.newVersion, ...githubRepo, ...result });
  }
  return results;
}

function main() {
  const [, , dependencyUpdateInfoPath, scoreThresholdArg] = process.argv;
  if (!dependencyUpdateInfoPath) {
    console.error("Usage: node dependency-scorecard-info.js <dependency-update-info.json> [scoreThreshold]");
    console.error("  <dependency-update-info.json> is the output of dependency-update-info.js");
    process.exitCode = 1;
    return;
  }

  const { changes } = JSON.parse(fs.readFileSync(dependencyUpdateInfoPath, "utf-8"));
  const scoreThreshold = scoreThresholdArg ? Number(scoreThresholdArg) : SCORE_THRESHOLD_DEFAULT;

  fetchScorecardInfo(changes, { scoreThreshold })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  SCORE_THRESHOLD_DEFAULT,
  extractGitHubRepo,
  detectLowScorecard,
  fetchScorecardInfo,
};
