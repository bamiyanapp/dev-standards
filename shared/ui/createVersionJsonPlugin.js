// issue #896: getAppVersionDefine.jsが埋め込む__APP_VERSION__・__APP_BUILD_TIME__は
// Viteのdefineでビルド時にJSバンドルへ直接埋め込まれる値であり、index.html自体には
// 一切現れない。そのためcurlのみ（JS実行無し）で外部から取得する手段が無く、
// ブルーグリーン運用（docs/blue-green-stage-pattern.md）等でフロントエンドの
// 実際のデプロイ済みバージョンを検知できない問題があった（karuta#1565）。
// ビルド後にdist直下へversion.json（{version, buildTime}）を書き出すVite複合
// プラグインとして提供し、curlのみで取得できるようにする。
//
// getAppVersionDefine.jsと同じpackage.jsonパス解決方式を踏襲する（symlink経由で
// 共有するため、対象のpackage.jsonのパス解決は呼び出し側のvite.config.jsに委ねる。
// 本ファイル自身はパスを決め打ちしない）。
//
// 使い方（vite.config.js）:
//   import createVersionJsonPlugin from "./createVersionJsonPlugin.js"; // symlink
//   export default defineConfig({
//     plugins: [
//       createVersionJsonPlugin(new URL("../package.json", import.meta.url)),
//     ],
//   });
//
// nowはテスト用の注入ポイント（既定は呼び出し時点の現在時刻）。
import { readFileSync, writeFileSync } from "node:fs";

export default function createVersionJsonPlugin(packageJsonPath, now = new Date()) {
  return {
    name: "write-version-json",
    writeBundle(options) {
      const { version } = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const buildTime = now.toISOString();
      writeFileSync(`${options.dir}/version.json`, JSON.stringify({ version, buildTime }));
    },
  };
}
