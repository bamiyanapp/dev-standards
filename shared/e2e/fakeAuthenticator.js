// 自社発行セッショントークン方式（docs/serverless-api-dynamodb-pattern.md
// 「認証パターン（Cognitoを使わない）」）を採用するプロダクトのE2Eテスト用。
// 実際の署名検証（HS256等）・有効期限チェックを行わず、Authorization:
// Bearer <トークン>のpayload（base64url）をそのまま信頼するfake
// authenticatorを返す。router.jsが要求するauthenticate(headers)
// インターフェースを満たすのみで、本番の認証実装には一切依存しない。
//
// トークンはJWT形状（header.payload.signature）であればよく、Googleが発行する
// IDトークン・バックエンドが発行するセッショントークンのいずれの形状も区別
// せずに受け入れる（本番側の認証方式の切り替えに追随するコード変更が不要）。
// フロントエンド側でこの形状のfakeトークンを組み立てるには、このファイルと
// 対になる./fakeSessionToken.jsのcreateFakeSessionTokenを使う。
export function createFakeAuthenticator() {
  return async function authenticate(headers) {
    const authHeader = headers?.authorization || headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const error = new Error("認証情報がありません");
      error.statusCode = 401;
      throw error;
    }
    const token = authHeader.slice("Bearer ".length);
    const [, payloadSegment] = token.split(".");
    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf-8"));
    } catch {
      payload = null;
    }
    if (!payload?.sub) {
      const error = new Error("認証情報が無効です");
      error.statusCode = 401;
      throw error;
    }
    return {
      userId: payload.sub,
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
    };
  };
}
