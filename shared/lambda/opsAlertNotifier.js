"use strict";

// 運用監視（CloudWatch Alarm経由でのサイレント障害検知、youtube-radar issue #122由来）が
// 発報した際に、どのアプリの何が異常かをLINEへ通知するための共有ロジック。ユーザー向け
// 通知用のLINE公式アカウント（各プロダクトが個別に持つもの）とは別に、運用監視専用の
// LINE公式アカウントを全プロダクト共通で1つ新規開設し、そこへ通知する想定。
//
// dailyRateLimit.js・clientErrorReporting.jsと同様、このファイル自体はnpmパッケージを
// requireしない（symlink経由で共有する場合、Node.jsのrequire()はシンボリックリンクの
// 実体パスを起点にnode_modulesを探索するため、呼び出し側のnode_modulesにあるパッケージを
// 見つけられずMODULE_NOT_FOUNDになる。詳細はdocs/daily-rate-limit-pattern.md参照）。
// SNSイベントのパース等、実際のLambdaハンドラの実装は呼び出し側に委ねる。

// CloudWatch AlarmのSNS通知内容から、どのアプリの何が異常かが分かるLINEメッセージ本文を
// 組み立てる純粋関数。
function buildOpsAlertMessage({ appName, alarmName, newState, reason }) {
  return [
    "【運用アラート】",
    `アプリ: ${appName}`,
    `アラーム: ${alarmName}`,
    `状態: ${newState}`,
    reason ? `詳細: ${reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// LINE Messaging APIのpushエンドポイントへメッセージを送信する。
async function sendOpsAlert({ message, channelAccessToken, userId, fetchImpl = fetch }) {
  const res = await fetchImpl("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ to: userId, messages: [{ type: "text", text: message }] }),
  });
  if (!res.ok) {
    throw new Error(`LINE通知の送信に失敗しました: HTTP ${res.status}`);
  }
}

module.exports = { buildOpsAlertMessage, sendOpsAlert };
