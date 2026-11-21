"use strict";

// Cognito（Hosted UI）のトークン処理（dev-standards#1378 手順4）。
// 認可コード・refresh tokenの交換、id_tokenの検証、JWKSの取得とキャッシュを扱う。
// examinationの`checkAuth.js`から、振る舞いを変えずに移した。
//
// 依存は、呼び出し側から注入する（npmパッケージを直接requireしない）。
// Lambda@Edgeは環境変数を使えないため、設定値（config）も呼び出し側が渡す。
//   const { verifyIdToken, exchangeAuthorizationCode, exchangeRefreshToken } = createCognitoTokens({
//     jose: { createRemoteJWKSet, jwtVerify },
//     config: { region, userPoolId, clientId, clientSecret },
//   });
//
// 変えてはいけない挙動:
//   - id_tokenの検証項目は、署名・有効期限・issuer・audience（jwtVerifyのオプションで指定する）。
//   - JWKSは、ファクトリ内の変数で一度だけ作り、再利用する。Lambda@Edgeは、リクエストごとに外部通信すると遅い。
//   - トークンエンドポイントは、Basic認証（clientId:clientSecret）で呼ぶ。
//   - 応答が2xx以外、またはJSONでなければ、本文つきのErrorを投げる。
//   - 応答のチャンクはBufferのまま集め、完了後に一度だけUTF-8へデコードする（マルチバイト文字の文字化けを避ける）。

const nodeHttps = require("node:https");

function createCognitoTokens({ jose, config, https = nodeHttps }) {
  const issuer = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;

  let jwks;
  function getJwks() {
    if (!jwks) {
      jwks = jose.createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    }
    return jwks;
  }

  function postForm(hostname, path, form, extraHeaders = {}) {
    const body = new URLSearchParams(form).toString();
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname,
          path,
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body),
            ...extraHeaders,
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const data = Buffer.concat(chunks).toString("utf-8");
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data));
              } catch {
                reject(new Error(`token endpoint returned invalid JSON: ${data}`));
              }
            } else {
              reject(new Error(`token endpoint returned ${res.statusCode}: ${data}`));
            }
          });
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  }

  function basicAuthHeader() {
    const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    return { Authorization: `Basic ${basicAuth}` };
  }

  // 検証に失敗したら、jwtVerifyのエラーをそのまま投げる。握りつぶすかは、呼び出し側が決める
  async function verifyIdToken(idToken) {
    const { payload } = await jose.jwtVerify(idToken, getJwks(), {
      issuer,
      audience: config.clientId,
    });
    return payload;
  }

  function exchangeAuthorizationCode(code, redirectUri, cognitoDomainHost) {
    return postForm(
      cognitoDomainHost,
      "/oauth2/token",
      {
        grant_type: "authorization_code",
        client_id: config.clientId,
        code,
        redirect_uri: redirectUri,
      },
      basicAuthHeader(),
    );
  }

  function exchangeRefreshToken(refreshToken, cognitoDomainHost) {
    return postForm(
      cognitoDomainHost,
      "/oauth2/token",
      {
        grant_type: "refresh_token",
        client_id: config.clientId,
        refresh_token: refreshToken,
      },
      basicAuthHeader(),
    );
  }

  return { verifyIdToken, exchangeAuthorizationCode, exchangeRefreshToken, postForm };
}

module.exports = { createCognitoTokens };
