// サーバー間の内部APIが受け取る共有シークレットを、定数時間で比較する
// （dev-standards#1379）。`===`による通常の文字列比較は、先頭から異なる位置までの
// 比較時間が値によって変わり、応答時間から値を推測される余地がある。
//
// crypto.timingSafeEqualは長さの異なるバッファを渡すと例外を投げる。長さを先に比較して
// 分岐すると長さの情報が漏れるうえ、例外処理を忘れると不正な入力で500になる。
// そのため両方をSHA-256でハッシュ（常に32バイト）してから比較する。
//
// expectedが未設定・空文字列の場合は必ずfalseを返す。設定漏れのときに「空同士で一致」
// して認証を通してはならないため。cryptoはNode.js標準モジュールのため、npmパッケージを
// requireしないというshared/lambdaの方針に反しない。

const crypto = require("crypto");

function isSameSecret(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || expected === "") {
    return false;
  }
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { isSameSecret };
