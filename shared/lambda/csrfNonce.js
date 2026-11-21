"use strict";

// ログインCSRF対策のnonceを、サーバー側（DynamoDB）で発行・消費する（dev-standards#1378 手順3）。
// examinationの`checkAuth.js`から、振る舞いを変えずに移した。
// Cookieに保存する方式は、ブラウザのCookieポリシー（SafariのITP等）で再発を繰り返した。
// nonceの有効性をサーバー側で管理すれば、クライアント側の要因に依存しなくなる。
//
// 依存は、呼び出し側から注入する（npmパッケージを直接requireしない）。
// 使い方:
//   const { issueCsrfNonce, consumeCsrfNonce } = createCsrfNonce({
//     ddb, PutItemCommand, DeleteItemCommand, tableName: "app-csrf-nonces", ttlSeconds: 300,
//   });
//
// 変えてはいけない挙動:
//   - consumeは、検証と削除を同時に行う（DeleteItem + ConditionExpression）。一度きりの利用だけを許可する。
//   - 期限内・未使用でなければfalse。それ以外のエラーは、そのまま投げる。

const nodeCrypto = require("node:crypto");

function createCsrfNonce({
  ddb,
  PutItemCommand,
  DeleteItemCommand,
  tableName,
  ttlSeconds,
  now = () => Date.now(),
  randomHex = () => nodeCrypto.randomBytes(16).toString("hex"),
}) {
  async function issueCsrfNonce() {
    const nonce = randomHex();
    await ddb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          nonce: { S: nonce },
          expiresAt: { N: String(Math.floor(now() / 1000) + ttlSeconds) },
        },
      }),
    );
    return nonce;
  }

  // nonceの検証と同時に削除する。同じnonceでのリプレイ（多重コールバック等）・期限切れ後の利用は、どちらもfalse
  async function consumeCsrfNonce(nonce) {
    if (!nonce) return false;
    try {
      await ddb.send(
        new DeleteItemCommand({
          TableName: tableName,
          Key: { nonce: { S: nonce } },
          ConditionExpression: "attribute_exists(#n) AND expiresAt > :now",
          ExpressionAttributeNames: { "#n": "nonce" },
          ExpressionAttributeValues: { ":now": { N: String(Math.floor(now() / 1000)) } },
        }),
      );
      return true;
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException") return false;
      throw error;
    }
  }

  return { issueCsrfNonce, consumeCsrfNonce };
}

module.exports = { createCsrfNonce };
