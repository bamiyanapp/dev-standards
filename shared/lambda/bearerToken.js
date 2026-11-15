// API Gatewayのイベントから`Authorization: Bearer <token>`のトークンを取り出す
// （dev-standards#1379）。
//
// ヘッダー名の大文字小文字はAPI Gatewayの種別（REST APIは送信されたまま、HTTP APIは
// 小文字へ正規化）で揺れるため、大文字小文字を区別せずに探す。トークンが無い・
// 空・Bearer以外のスキームの場合はnullを返す（呼び出し側で401/403を返す）。
// トークンの検証自体（DB照会・署名検証等）はプロダクトごとに異なるため対象外。

function extractBearerToken(event) {
  const headers = event?.headers;
  if (!headers || typeof headers !== "object") {
    return null;
  }
  const headerName = Object.keys(headers).find((name) => name.toLowerCase() === "authorization");
  const value = headerName ? headers[headerName] : undefined;
  if (typeof value !== "string") {
    return null;
  }
  // RFC 7235: 認証スキーム名は大文字小文字を区別しない
  const match = /^bearer +(\S+)$/i.exec(value.trim());
  return match ? match[1] : null;
}

module.exports = { extractBearerToken };
