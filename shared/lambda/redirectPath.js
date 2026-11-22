"use strict";

// ログイン後の戻り先（`?redirect=`）を検証する（dev-standards#1378・#1593）。
// 同一オリジンの相対パス（先頭が単一の"/"）だけを許可し、外部サイトへのオープンリダイレクトを防ぐ。
//
// 拒否する入力:
//   - 空・"/"で始まらないもの（絶対URL、"javascript:"等）
//   - "//"で始まるもの（プロトコル相対URL）
//   - "\"を含むもの。ブラウザは"\"を"/"として扱うため、"/\evil.example"は"//evil.example"になる
//   - 制御文字（タブ・改行を含む）を含むもの。ブラウザはURLからタブ・改行を取り除くため、
//     "/<TAB>/evil.example"は"//evil.example"になる
// 拒否したときは、"/"を返す。
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\\\u0000-\u001f\u007f]/;

function sanitizeRedirectPath(redirectPath) {
  if (!redirectPath || !redirectPath.startsWith("/") || redirectPath.startsWith("//")) {
    return "/";
  }
  if (FORBIDDEN_CHARS.test(redirectPath)) {
    return "/";
  }
  return redirectPath;
}

module.exports = { sanitizeRedirectPath };
