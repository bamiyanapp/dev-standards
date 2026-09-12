// 自社発行セッショントークン方式のE2Eテスト用、フロントエンド側のヘルパー。
// 実際のGoogleログインフロー・POST /auth/sessionでのトークン交換を経由せず、
// ログイン状態からE2Eテストを開始できるようにする。対になるバックエンド側の
// 受け口は./fakeAuthenticator.jsのcreateFakeAuthenticatorを参照。
//
// JWTと同じ形状（header.payload.signature）のfakeトークンを組み立てる。
// 署名部分は検証されない前提のため固定文字列で構わない。Googleが発行する
// IDトークンも、バックエンドが発行するセッショントークンも同じJWT形状であり、
// fakeAuthenticator側はどちらであるかを区別しないため、プロダクト側の
// 認証方式の切り替え（例: IDトークン直接検証→セッショントークン）に追随する
// コード変更は不要。
function base64UrlEncode(obj) {
  return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64url");
}

export function createFakeSessionToken({ sub, name, email, picture }) {
  const header = base64UrlEncode({ alg: "none" });
  const payload = base64UrlEncode({ sub, name, email, picture });
  return `${header}.${payload}.signature`;
}

// page.goto()より前に呼び出すこと。cookieNameは参照側プロダクトが実際に
// セッショントークン（またはGoogle IDトークン）を保持しているCookie名を渡す
// （プロダクトごとに異なるため必須、既定値は持たない）。
export async function loginAsE2EUser(context, { baseURL, cookieName, sub, name, email, picture }) {
  const token = createFakeSessionToken({ sub, name, email, picture });
  const { hostname } = new URL(baseURL);
  await context.addCookies([
    {
      name: cookieName,
      value: token,
      domain: hostname,
      path: "/",
    },
  ]);
  return token;
}
