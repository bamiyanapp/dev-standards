"use strict";

// ログイン後の戻り先（`?redirect=`）を検証する（dev-standards#1378）。
// examinationの`checkAuth.js`から、振る舞いを変えずに移した。
// 同一オリジンの相対パス（先頭が単一の"/"）だけを許可し、外部サイトへのオープンリダイレクトを防ぐ。
// 注意: 現在の判定は、先頭が"/\"の入力（例: "/\evil.example"）を許可する。
// ブラウザは"\"を"/"として扱うため、これは別Issueで直す（移動の最優先は、振る舞いを変えないこと）。
function sanitizeRedirectPath(redirectPath) {
  if (!redirectPath || !redirectPath.startsWith("/") || redirectPath.startsWith("//")) {
    return "/";
  }
  return redirectPath;
}

module.exports = { sanitizeRedirectPath };
