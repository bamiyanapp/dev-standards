"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractGitHubRepo,
  detectLowScorecard,
  fetchScorecardInfo,
  SCORE_THRESHOLD_DEFAULT,
} = require("./dependency-scorecard-info.js");

test("extractGitHubRepo: git+https形式のURLから抽出する", () => {
  assert.deepEqual(extractGitHubRepo({ url: "git+https://github.com/lodash/lodash.git" }), { owner: "lodash", repo: "lodash" });
});

test("extractGitHubRepo: 文字列形式のrepositoryから抽出する", () => {
  assert.deepEqual(extractGitHubRepo("https://github.com/owner/repo"), { owner: "owner", repo: "repo" });
});

test("extractGitHubRepo: github:owner/repo省略形から抽出する", () => {
  assert.deepEqual(extractGitHubRepo("github:owner/repo"), { owner: "owner", repo: "repo" });
});

test("extractGitHubRepo: git+ssh形式のURLから抽出する", () => {
  assert.deepEqual(extractGitHubRepo({ url: "git+ssh://git@github.com/owner/repo.git" }), { owner: "owner", repo: "repo" });
});

test("extractGitHubRepo: GitHub以外（GitLab等）はnullを返す", () => {
  assert.equal(extractGitHubRepo({ url: "git+https://gitlab.com/owner/repo.git" }), null);
});

test("extractGitHubRepo: repositoryフィールドが無い場合はnullを返す", () => {
  assert.equal(extractGitHubRepo(undefined), null);
  assert.equal(extractGitHubRepo(null), null);
});

test("detectLowScorecard: scoreThreshold未満の場合はflagged: trueを返す", () => {
  assert.deepEqual(detectLowScorecard({ score: 2.1 }, 3), { score: 2.1, flagged: true });
});

test("detectLowScorecard: scoreThreshold以上の場合はflagged: falseを返す（結果自体は返す）", () => {
  assert.deepEqual(detectLowScorecard({ score: 7.5 }, 3), { score: 7.5, flagged: false });
});

test("detectLowScorecard: scoreが無い（未評価）場合はnullを返す（判定不能）", () => {
  assert.equal(detectLowScorecard(null, 3), null);
  assert.equal(detectLowScorecard({}, 3), null);
});

test("detectLowScorecard: scoreThreshold省略時はデフォルト値（3）を使う", () => {
  assert.ok(SCORE_THRESHOLD_DEFAULT > 0);
  assert.deepEqual(detectLowScorecard({ score: 1 }), { score: 1, flagged: true });
  assert.deepEqual(detectLowScorecard({ score: 9 }), { score: 9, flagged: false });
});

test("fetchScorecardInfo: GitHubリポジトリが特定できチェックできたパッケージを全件返す", async () => {
  const changes = [
    { name: "low-score-pkg", oldVersion: "1.0.0", newVersion: "1.0.1" },
    { name: "high-score-pkg", oldVersion: "2.0.0", newVersion: "2.1.0" },
    { name: "newly-added", oldVersion: null, newVersion: "1.0.0" },
  ];
  const registryFixtures = {
    "low-score-pkg": { repository: { url: "git+https://github.com/owner/low-score-pkg.git" } },
    "high-score-pkg": { repository: { url: "git+https://github.com/owner/high-score-pkg.git" } },
  };
  const scorecardFixtures = {
    "owner/low-score-pkg": { score: 1.8 },
    "owner/high-score-pkg": { score: 8.2 },
  };
  const fetchJsonImpl = async (url) => {
    if (url.includes("registry.npmjs.org")) return registryFixtures[url.split("/").pop()];
    const key = url.split("github.com/")[1];
    return scorecardFixtures[key] ?? null;
  };
  const result = await fetchScorecardInfo(changes, { fetchJsonImpl });
  assert.deepEqual(result, [
    { name: "low-score-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", owner: "owner", repo: "low-score-pkg", score: 1.8, flagged: true },
    {
      name: "high-score-pkg",
      oldVersion: "2.0.0",
      newVersion: "2.1.0",
      owner: "owner",
      repo: "high-score-pkg",
      score: 8.2,
      flagged: false,
    },
  ]);
});

test("fetchScorecardInfo: GitHubリポジトリが特定できないパッケージは対象外", async () => {
  const changes = [{ name: "no-repo-pkg", oldVersion: "1.0.0", newVersion: "1.0.1" }];
  const fetchJsonImpl = async (url) => {
    if (url.includes("registry.npmjs.org")) return {};
    throw new Error("Scorecard APIが呼ばれるべきではない");
  };
  const result = await fetchScorecardInfo(changes, { fetchJsonImpl });
  assert.deepEqual(result, []);
});

test("fetchScorecardInfo: Scorecard未評価（404相当のnull）のパッケージは対象外", async () => {
  const changes = [{ name: "unscored-pkg", oldVersion: "1.0.0", newVersion: "1.0.1" }];
  const fetchJsonImpl = async (url) => {
    if (url.includes("registry.npmjs.org")) return { repository: { url: "git+https://github.com/owner/unscored-pkg.git" } };
    return null;
  };
  const result = await fetchScorecardInfo(changes, { fetchJsonImpl });
  assert.deepEqual(result, []);
});

test("fetchScorecardInfo: oldVersionが無い変更（新規追加）は対象外", async () => {
  const changes = [{ name: "newly-added", oldVersion: null, newVersion: "1.0.0" }];
  const fetchJsonImpl = async () => {
    throw new Error("fetchJsonImplが呼ばれるべきではない");
  };
  const result = await fetchScorecardInfo(changes, { fetchJsonImpl });
  assert.deepEqual(result, []);
});
