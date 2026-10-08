// dev-standards自身は同一リポジトリ内にrelease-config.cjsを持つため、
// 参照側リポジトリ向けのcopy-release-config composite actionは不要で、
// 直接requireする。
const { buildReleaseConfig } = require("./release-config.cjs");

module.exports = buildReleaseConfig({
  repositoryUrl: "https://github.com/bamiyanapp/dev-standards.git",
  // docs/generated/dependency-risk-history.jsonはissue #746 Phase 2用の履歴ファイル。
  // append-dependency-risk-history.js（changelogPrepareCmd）が追記した内容を
  // 同じリリースコミットへ含める
  gitAssets: ["CHANGELOG.md", "package.json", "package-lock.json", "docs/generated/dependency-risk-history.json"],
  // 既定のCHANGELOG.md→JSON変換はfrontendを持つ参照側リポジトリ向けのステップで、
  // dev-standards自身にはfrontendがなく不要（実行すると frontend/src/changelog.json
  // が誤って作成されてしまう）ため、no-opにする。代わりに依存Risk履歴への追記を行う
  // （issue #746 Phase 2）。${nextRelease.version}は@semantic-release/execが
  // Lodashテンプレートとして展開する
  changelogPrepareCmd: "node scripts/append-dependency-risk-history.js ${nextRelease.version}",
});
