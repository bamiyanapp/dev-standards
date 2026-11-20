// symlinkで共有したコンポーネントを、参照側のカバレッジから除外するパスの一覧を返す（dev-standards#1375）。
//
// 参照側のVite設定は、resolve.preserveSymlinks: trueである。このためカバレッジ上、共有コンポーネントは
// 実体のパス（dev-standards/shared/...）ではなく、symlinkのパス（src/components/ShareButton.jsx）として現れる。
// 「dev-standards/**を除外」では除外できない。symlinkの配置先を、sync-manifest.local.jsonから読んで、
// coverage.excludeに渡す形にする。共有コンポーネントのテストは、dev-standards側にある（shared/ui・shared/pwa）。
//
// 使い方（vite.config.ts。createViteConfigのcoverageExcludeへ渡す）:
//   import getSymlinkCoverageExcludes from '../../dev-standards/shared/ui/getSymlinkCoverageExcludes.js'
//   createViteConfig({
//     base: '/education/',
//     coverageExclude: getSymlinkCoverageExcludes({ manifestPath: '../../sync-manifest.local.json', appDir: 'app/education-overview' }),
//   })
//
// 引数:
//   manifestPath: sync-manifest.local.jsonのパス（vite.configの場所からの相対、またはカレントディレクトリ基準）
//   appDir: アプリのディレクトリ（リポジトリのルートからの相対。manifestのtargetは、ルートからのパス）。
//     省略時は、ルート直下のアプリとして、manifestのtarget全体を対象にする
//   sourcePrefixes: 除外する共有物のsourceの接頭辞（既定: shared/ui/・shared/pwa/・shared/sfx/）。
//     shared/lambdaなど、アプリのsrcに現れないものは含めない
import { readFileSync } from "node:fs";

const DEFAULT_SOURCE_PREFIXES = ["shared/ui/", "shared/pwa/", "shared/sfx/"];

function toAppRelative(target, appDir) {
  if (!appDir) return target;
  const prefix = appDir.endsWith("/") ? appDir : `${appDir}/`;
  return target.startsWith(prefix) ? target.slice(prefix.length) : null;
}

export default function getSymlinkCoverageExcludes({ manifestPath, appDir, sourcePrefixes = DEFAULT_SOURCE_PREFIXES }) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const excludes = [];
  for (const { source, target } of manifest.symlinks || []) {
    if (!sourcePrefixes.some((prefix) => source.startsWith(prefix))) continue;
    const relative = toAppRelative(target, appDir);
    if (relative !== null) excludes.push(relative);
  }
  return [...new Set(excludes)].sort();
}
