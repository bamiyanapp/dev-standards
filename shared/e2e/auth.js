// 事前に取得したトークン（refresh token等）をCookieとして注入し、対話的なログインを自動操作せずに、
// 認証済みの状態を作る。Cognito + Lambda@Edgeの認証パターン（docs/serverless-static-site-pattern.md）を
// 採るプロダクトで共通に使える。
//
// Cookie名は引数で受け取る（examinationは'refresh_token'）。値を環境変数から直接読まない
// （どのSecretを使うかは、参照側が決める）。
//
// 使い方:
//   await loginWithCookies(context, { baseURL, cookies: { refresh_token: process.env.E2E_REFRESH_TOKEN } });

/**
 * context: Playwrightのbrowser context
 * baseURL: Cookieを送る先のURL
 * cookies: { Cookie名: 値 }。値が空のものは、注入しない
 * options.secure: Secure属性（既定: baseURLがhttpsなら true）
 */
export async function loginWithCookies(context, { baseURL, cookies, secure } = {}) {
  if (!baseURL) throw new Error('baseURLは必須です。');
  if (!cookies || typeof cookies !== 'object') throw new Error('cookiesは、{ Cookie名: 値 } の形で指定してください。');
  const entries = Object.entries(cookies).filter(([, value]) => typeof value === 'string' && value !== '');
  if (entries.length === 0) throw new Error('注入するCookieの値がありません。Secretが設定されているか確認してください。');
  const { hostname, protocol } = new URL(baseURL);
  await context.addCookies(
    entries.map(([name, value]) => ({
      name,
      value,
      domain: hostname,
      path: '/',
      httpOnly: true,
      secure: secure ?? protocol === 'https:',
      sameSite: 'Lax',
    })),
  );
}
