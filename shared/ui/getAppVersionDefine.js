import { readFileSync } from "node:fs";

// package.jsonのversionフィールドを読み込み、Viteのdefineへ埋め込む
// __APP_VERSION__・__APP_BUILD_TIME__を返す（docs/frontend-ui-conventions.md
// 「トップページの必須構成」参照）。symlink経由で共有するため、対象の
// package.jsonのパス解決は呼び出し側のvite.config.jsに委ねる（本ファイル自身は
// パスを決め打ちしない）。
//
// 使い方（vite.config.js）:
//   import getAppVersionDefine from "./getAppVersionDefine.js"; // symlink
//   export default defineConfig({
//     define: {
//       ...getAppVersionDefine(new URL("../package.json", import.meta.url)),
//     },
//   });
//
// nowはテスト用の注入ポイント（既定は呼び出し時点の現在時刻）。
export default function getAppVersionDefine(packageJsonPath, now = new Date()) {
  const { version } = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  return {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD_TIME__: JSON.stringify(now.toISOString()),
  };
}
