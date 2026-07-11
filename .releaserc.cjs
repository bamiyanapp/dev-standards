// dev-standards自身は同一リポジトリ内にrelease-config.cjsを持つため、
// 参照側リポジトリ向けのcopy-release-config composite actionは不要で、
// 直接requireする。
const { buildReleaseConfig } = require("./release-config.cjs");

module.exports = buildReleaseConfig({
  repositoryUrl: "https://github.com/bamiyanapp/dev-standards.git",
  gitAssets: ["CHANGELOG.md", "package.json", "package-lock.json"],
  // 既定のCHANGELOG.md→JSON変換はfrontendを持つ参照側リポジトリ向けのステップで、
  // dev-standards自身にはfrontendがなく不要（実行すると frontend/src/changelog.json
  // が誤って作成されてしまう）ため、no-opにする。
  changelogPrepareCmd: "true",
});
