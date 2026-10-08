"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  compareSemver,
  filterHistoryEntries,
  buildSection,
  findDevStandardsChange,
  lookupDevStandardsRiskHistory,
} = require("./dependency-risk-history-lookup.js");

const HISTORY = [
  { version: "2.61.0", riskLevel: "low", riskReasons: ["patch/minorのみ"], staleRiskLevel: "low", staleRiskReasons: [] },
  {
    version: "2.62.0",
    riskLevel: "high",
    riskReasons: ["新規にinstall scriptを持つようになったパッケージがあります: esbuild"],
    staleRiskLevel: "low",
    staleRiskReasons: ["現行バージョンに既知の脆弱性は見つかりませんでした"],
  },
  { version: "2.63.0", riskLevel: "low", riskReasons: ["patch/minorのみ"], staleRiskLevel: "low", staleRiskReasons: [] },
];

test("compareSemver: major/minor/patchを順に比較する", () => {
  assert.ok(compareSemver({ major: 2, minor: 1, patch: 0 }, { major: 1, minor: 9, patch: 9 }) > 0);
  assert.ok(compareSemver({ major: 2, minor: 0, patch: 0 }, { major: 2, minor: 1, patch: 0 }) < 0);
  assert.equal(compareSemver({ major: 2, minor: 1, patch: 3 }, { major: 2, minor: 1, patch: 3 }), 0);
});

test("filterHistoryEntries: oldRefより新しくnewRef以下のエントリのみ、バージョン昇順で返す", () => {
  const result = filterHistoryEntries(HISTORY, "v2.61.1", "v2.63.0");
  assert.deepEqual(result.map((e) => e.version), ["2.62.0", "2.63.0"]);
});

test("filterHistoryEntries: oldRef自体は含まない（exclusive）", () => {
  const result = filterHistoryEntries(HISTORY, "v2.61.0", "v2.62.0");
  assert.deepEqual(result.map((e) => e.version), ["2.62.0"]);
});

test("filterHistoryEntries: 範囲に該当するエントリが無い場合は空配列", () => {
  const result = filterHistoryEntries(HISTORY, "v2.63.0", "v2.63.1");
  assert.deepEqual(result, []);
});

test("filterHistoryEntries: oldRef/newRefがsemverとして解釈できない場合は空配列", () => {
  assert.deepEqual(filterHistoryEntries(HISTORY, "main", "v2.63.0"), []);
});

test("buildSection: 空配列の場合はnullを返す（セクション自体を省略する）", () => {
  assert.equal(buildSection([]), null);
});

test("buildSection: バージョン・リスクレベル・理由を含むMarkdownを生成する", () => {
  const section = buildSection([HISTORY[1]]);
  assert.match(section, /2\.62\.0/);
  assert.match(section, /HIGH/);
  assert.match(section, /LOW/);
  assert.match(section, /esbuild/);
});

test("findDevStandardsChange: bamiyanapp/dev-standards自体への参照変更を見つける", () => {
  const changes = [
    { action: "actions/checkout", oldRef: "v6", newRef: "v7" },
    { action: "bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml", oldRef: "v2.61.1", newRef: "v2.62.0" },
  ];
  const found = findDevStandardsChange(changes);
  assert.equal(found.newRef, "v2.62.0");
});

test("findDevStandardsChange: dev-standardsへの参照が無い場合はundefined", () => {
  const changes = [{ action: "actions/checkout", oldRef: "v6", newRef: "v7" }];
  assert.equal(findDevStandardsChange(changes), undefined);
});

test("lookupDevStandardsRiskHistory: dev-standardsへの参照が無い場合はnull（fetchしない）", async () => {
  let called = false;
  const result = await lookupDevStandardsRiskHistory([{ action: "actions/checkout", oldRef: "v6", newRef: "v7" }], {
    fetchJsonImpl: async () => {
      called = true;
      return HISTORY;
    },
  });
  assert.equal(result, null);
  assert.equal(called, false);
});

test("lookupDevStandardsRiskHistory: 新refのタグから履歴を取得し、該当範囲のみセクション化する", async () => {
  const changes = [
    { action: "bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml", oldRef: "v2.61.1", newRef: "v2.63.0" },
  ];
  let requestedUrl = null;
  const result = await lookupDevStandardsRiskHistory(changes, {
    fetchJsonImpl: async (url) => {
      requestedUrl = url;
      return HISTORY;
    },
  });
  assert.match(requestedUrl, /dev-standards\/v2\.63\.0\/docs\/generated\/dependency-risk-history\.json$/);
  assert.match(result, /2\.62\.0/);
  assert.match(result, /2\.63\.0/);
  assert.doesNotMatch(result, /\b2\.61\.0\b/);
});

// issue #746: 履歴ファイルが存在しない（旧バージョン、本機能導入前のタグ等）・
// 一時的なネットワーク障害等は「データが無い」として安全側にnullを返し、
// Risk Summary自体の投稿を妨げない
test("lookupDevStandardsRiskHistory: fetchが失敗した場合はnullを返す（例外を伝播させない）", async () => {
  const changes = [
    { action: "bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml", oldRef: "v2.61.1", newRef: "v2.63.0" },
  ];
  const result = await lookupDevStandardsRiskHistory(changes, {
    fetchJsonImpl: async () => {
      throw new Error("404");
    },
  });
  assert.equal(result, null);
});
