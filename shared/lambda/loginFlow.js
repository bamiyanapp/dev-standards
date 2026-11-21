"use strict";

// ログインフロー（Cognito Hosted UIへのリダイレクトと、コールバックの検証）（dev-standards#1378 手順5）。
// examinationの`checkAuth.js`から、振る舞いを変えずに移した。
// `csrfNonce.js`（手順3）と`cognitoTokens.js`（手順4）を組み合わせる。依存は、呼び出し側から注入する。
//   const flow = createLoginFlow({ csrfNonce, cognitoTokens, config: { clientId } });
//
// 責務の境界:
//   - 共有する: stateの組み立てと検証、nonceの消費、コードの交換、id_tokenの検証、異常時の応答。
//   - 呼び出し側に残す: 検証後の処理（許可リストの確認、Cookieの発行、遷移先の決定）。ここはプロダクト固有である。
//
// 変えてはいけない挙動:
//   - 検査の順序: code・stateの有無 → stateの復号 → nonceの消費 → コードの交換 → id_tokenの検証。
//   - 応答: 400（missing code or state / invalid state）、502（authentication failed）、403。
//   - stateは、{ uri, nonce }のJSONをbase64にしたもの。

const { redirectResponse } = require("./edgeHttp.js");

function forbiddenResponse() {
  return {
    status: "403",
    statusDescription: "Forbidden",
    headers: { "content-type": [{ key: "Content-Type", value: "text/plain; charset=utf-8" }] },
    body: "アクセスが許可されていません",
  };
}

function badRequest(body) {
  return { status: "400", statusDescription: "Bad Request", body };
}

function createLoginFlow({ csrfNonce, cognitoTokens, config, logger = console }) {
  // 元のパス＋CSRF対策nonceをstateに載せて、Hosted UIのログイン画面へリダイレクトする応答を組み立てる
  async function buildLoginRedirect(destinationUri, domainName, cognitoDomainHost, extraCookies = []) {
    const nonce = await csrfNonce.issueCsrfNonce();
    const state = Buffer.from(JSON.stringify({ uri: destinationUri, nonce }), "utf-8").toString("base64");
    const redirectUri = `https://${domainName}/_callback`;
    const authorizeUrl =
      `https://${cognitoDomainHost}/oauth2/authorize?` +
      new URLSearchParams({
        client_id: config.clientId,
        response_type: "code",
        scope: "openid email profile",
        redirect_uri: redirectUri,
        state,
      }).toString();
    return redirectResponse(authorizeUrl, extraCookies);
  }

  // コールバックを検証する。失敗なら{ response }、成功なら{ payload, tokens, originalUri }を返す
  async function authenticateCallback({ querystring, domainName, cognitoDomainHost }) {
    const params = new URLSearchParams(querystring);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      return { response: badRequest("missing code or state") };
    }

    let decoded;
    try {
      decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
    } catch {
      return { response: badRequest("invalid state") };
    }
    if (!(await csrfNonce.consumeCsrfNonce(decoded.nonce))) {
      return { response: badRequest("invalid state") };
    }
    const originalUri = decoded.uri || "/";

    const redirectUri = `https://${domainName}/_callback`;
    let tokens;
    try {
      tokens = await cognitoTokens.exchangeAuthorizationCode(code, redirectUri, cognitoDomainHost);
    } catch (error) {
      logger.error("Token exchange failed", error);
      return { response: { status: "502", statusDescription: "Bad Gateway", body: "authentication failed" } };
    }

    let payload;
    try {
      payload = await cognitoTokens.verifyIdToken(tokens.id_token);
    } catch (error) {
      logger.error("id_token verification failed at callback", error.message);
      return { response: forbiddenResponse() };
    }
    return { payload, tokens, originalUri };
  }

  return { buildLoginRedirect, authenticateCallback };
}

module.exports = { createLoginFlow, forbiddenResponse };
