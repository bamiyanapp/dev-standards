"use strict";

// shared/ui/ErrorBoundary.jsxが送信するフロントエンドの例外情報を検証・整形する
// 汎用ロジック（karuta issue #1110由来）。実際のHTTPレスポンス生成・CORS処理・
// console.error（Lambdaの標準動作でCloudWatch Logsに残る）呼び出し自体は、
// 呼び出し側の既存実装（httpResponse.js等）に委ねる。dailyRateLimit.jsと同様、
// このファイル自体はnpmパッケージをrequireしない（symlink経由で共有する場合、
// Node.jsのrequire()はシンボリックリンクの実体パスを起点にnode_modulesを探索する
// ため、呼び出し側のnode_modulesにあるパッケージを見つけられずMODULE_NOT_FOUNDに
// なる。詳細はdocs/daily-rate-limit-pattern.md参照）。
//
// 認証の無い公開エンドポイントを想定しているため、内容の真偽は検証できない前提で、
// 悪意ある大量送信によってログの容量・コストが膨らまないよう各フィールドに
// 長さ上限を設けている。
const CLIENT_ERROR_FIELD_MAX_LENGTHS = {
  message: 500,
  stack: 4000,
  componentStack: 4000,
  url: 500,
};

function truncateClientErrorField(value, maxLength) {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

// リクエストボディ（JSON.parse済み）から、ログに残す用のペイロードを組み立てる。
// messageが無い（≒不正な入力）場合はnullを返すため、呼び出し側はnullの場合400を
// 返すこと。プレイ内容・入力内容等の個人情報・利用状況の詳細を含めない設計のため、
// 受け取るのはエラー情報とURLのみに限定している
function buildClientErrorLogPayload(body) {
  const message = truncateClientErrorField(body?.message, CLIENT_ERROR_FIELD_MAX_LENGTHS.message);
  if (!message) {
    return null;
  }
  return {
    message,
    stack: truncateClientErrorField(body?.stack, CLIENT_ERROR_FIELD_MAX_LENGTHS.stack),
    componentStack: truncateClientErrorField(body?.componentStack, CLIENT_ERROR_FIELD_MAX_LENGTHS.componentStack),
    url: truncateClientErrorField(body?.url, CLIENT_ERROR_FIELD_MAX_LENGTHS.url),
  };
}

module.exports = { CLIENT_ERROR_FIELD_MAX_LENGTHS, truncateClientErrorField, buildClientErrorLogPayload };
