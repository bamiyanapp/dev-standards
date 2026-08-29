// getAppVersionDefine.jsが埋め込む__APP_BUILD_TIME__（ISO文字列）を、
// トップページ表示用の日本語ローカライズ文字列へ整形する
// （docs/frontend-ui-conventions.md「トップページの必須構成」参照）。
//
// 使い方:
//   import formatBuildTime from "./formatBuildTime.js"; // symlink
//   formatBuildTime(__APP_BUILD_TIME__) // => "2026/8/29 20:15"
export default function formatBuildTime(isoString) {
  return new Date(isoString).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
