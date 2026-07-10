"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReleaseConfig, BASE_RELEASE_RULES } = require("./release-config.cjs");

test("throws when repositoryUrl is missing", () => {
  assert.throws(() => buildReleaseConfig({ gitAssets: ["CHANGELOG.md"] }), /repositoryUrl/);
});

test("throws when gitAssets is missing or empty", () => {
  assert.throws(() => buildReleaseConfig({ repositoryUrl: "https://example.com/x.git" }), /gitAssets/);
  assert.throws(
    () => buildReleaseConfig({ repositoryUrl: "https://example.com/x.git", gitAssets: [] }),
    /gitAssets/
  );
});

test("applies defaults for optional fields", () => {
  const config = buildReleaseConfig({
    repositoryUrl: "https://example.com/x.git",
    gitAssets: ["CHANGELOG.md", "package.json"],
  });

  assert.deepEqual(config.branches, ["main"]);

  const [, execOptions] = config.plugins.find((p) => Array.isArray(p) && p[0] === "@semantic-release/exec");
  assert.equal(execOptions.prepareCmd, "node scripts/convert-changelog-to-json.js");

  const [, npmOptions] = config.plugins.find((p) => Array.isArray(p) && p[0] === "@semantic-release/npm");
  assert.equal(npmOptions.npmPublish, false);

  const [, analyzerOptions] = config.plugins.find(
    (p) => Array.isArray(p) && p[0] === "@semantic-release/commit-analyzer"
  );
  assert.deepEqual(analyzerOptions.releaseRules, BASE_RELEASE_RULES);
});

test("reproduces karuta's current .releaserc.cjs exactly, given karuta's overrides", () => {
  const config = buildReleaseConfig({
    repositoryUrl: "https://github.com/bamiyanapp/karuta.git",
    gitAssets: ["CHANGELOG.md", "frontend/src/changelog.json", "package.json", "package-lock.json"],
    extraReleaseRules: [
      { type: "Feat/fix", release: "patch" },
      { type: "Fix/tech", release: "patch" },
    ],
  });

  const expected = {
    branches: ["main"],
    repositoryUrl: "https://github.com/bamiyanapp/karuta.git",
    plugins: [
      [
        "@semantic-release/commit-analyzer",
        {
          preset: "conventionalcommits",
          // extraReleaseRulesはBASE_RELEASE_RULESより手前（優先位置）に追加される。
          // commit-analyzerは各コミットのtypeに一致する最初のルールを使うため、
          // 型ごとに重複がない本ケースでは配列内の順序自体は判定結果に影響しない。
          releaseRules: [
            { type: "Feat/fix", release: "patch" },
            { type: "Fix/tech", release: "patch" },
            { type: "feat", release: "minor" },
            { type: "fix", release: "patch" },
            { type: "Feat", release: "minor" },
            { type: "Fix", release: "patch" },
            { type: "Refactor", release: "patch" },
            { type: "Docs", release: false },
            { type: "Chore", release: false },
          ],
          defaultReleaseType: "patch",
        },
      ],
      "@semantic-release/release-notes-generator",
      "@semantic-release/changelog",
      ["@semantic-release/npm", { npmPublish: false }],
      ["@semantic-release/exec", { prepareCmd: "node scripts/convert-changelog-to-json.js" }],
      [
        "@semantic-release/github",
        { successComment: false, failCommentCondition: false, releasedLabels: false },
      ],
      [
        "@semantic-release/git",
        {
          assets: ["CHANGELOG.md", "frontend/src/changelog.json", "package.json", "package-lock.json"],
          message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
        },
      ],
    ],
  };

  assert.deepEqual(config, expected);
});
