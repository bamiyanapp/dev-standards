"use strict";

// semantic-releaseの`extends`機能（cosmiconfigベースの設定マージ）は、shareable configと
// 呼び出し側の両方が`plugins`配列を持つ場合に配列を連結する（同名プラグインが重複すると
// そのライフサイクルが2回実行されてしまう）ため使用しない。代わりに、この関数を呼び出し側の
// .releaserc.cjsから直接requireし、プロダクト固有の値を渡して完全な設定オブジェクトを組み立てる
// 素朴なJavaScript合成方式を採る（semantic-releaseの設定マージ機構には一切依存しない）。

// 小文字（正規）・大文字（表記ゆれ）に対応した基本のreleaseRules。
// プロダクト固有の追加ルール（過去のコミット履歴対応等）は`extraReleaseRules`で追加できる。
const BASE_RELEASE_RULES = [
  { type: "feat", release: "minor" },
  { type: "fix", release: "patch" },
  { type: "Feat", release: "minor" },
  { type: "Fix", release: "patch" },
  { type: "Refactor", release: "patch" },
  { type: "Docs", release: false },
  { type: "Chore", release: false },
];

/**
 * @param {object} options
 * @param {string} options.repositoryUrl - GitHubリポジトリURL（必須）
 * @param {string[]} options.gitAssets - @semantic-release/gitがコミットに含めるファイルパスの配列（必須）
 * @param {Array<object>} [options.extraReleaseRules] - BASE_RELEASE_RULESに追加するreleaseRules（配列の先頭に追加され、BASE_RELEASE_RULESより優先される）
 * @param {string} [options.changelogPrepareCmd] - @semantic-release/execのprepareCmd。既定はCHANGELOG.md→JSON変換スクリプトの実行。
 * @param {boolean} [options.npmPublish] - @semantic-release/npmのnpmPublishオプション。既定false。
 * @param {string[]} [options.branches] - 対象ブランチ。既定["main"]（実際の対象はCIのmergeジョブが`--branches`で上書きする）。
 * @returns {object} semantic-release設定オブジェクト（.releaserc.cjsがそのままexportできる形）
 */
function buildReleaseConfig(options) {
  const {
    repositoryUrl,
    gitAssets,
    extraReleaseRules = [],
    changelogPrepareCmd = "node scripts/convert-changelog-to-json.js",
    npmPublish = false,
    branches = ["main"],
  } = options;

  if (!repositoryUrl) {
    throw new Error("buildReleaseConfig: repositoryUrl は必須です");
  }
  if (!Array.isArray(gitAssets) || gitAssets.length === 0) {
    throw new Error("buildReleaseConfig: gitAssets は空でない配列である必要があります");
  }

  return {
    // 実際の対象ブランチはCIのmergeジョブから`--branches`で都度PRの作業ブランチに
    // 上書きされる（--no-ci実行のため、この静的な設定はドキュメント的な意味合いのみ）
    branches,
    repositoryUrl,
    plugins: [
      [
        "@semantic-release/commit-analyzer",
        {
          preset: "conventionalcommits",
          releaseRules: [...extraReleaseRules, ...BASE_RELEASE_RULES],
          defaultReleaseType: "patch",
        },
      ],
      "@semantic-release/release-notes-generator",
      "@semantic-release/changelog",
      [
        "@semantic-release/npm",
        {
          npmPublish,
        },
      ],
      [
        "@semantic-release/exec",
        {
          prepareCmd: changelogPrepareCmd,
        },
      ],
      [
        "@semantic-release/github",
        {
          successComment: false,
          failCommentCondition: false,
          releasedLabels: false,
        },
      ],
      [
        "@semantic-release/git",
        {
          assets: gitAssets,
          message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
        },
      ],
    ],
  };
}

module.exports = { buildReleaseConfig, BASE_RELEASE_RULES };
