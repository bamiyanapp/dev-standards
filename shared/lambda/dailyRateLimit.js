"use strict";

const { UpdateItemCommand } = require("@aws-sdk/client-dynamodb");

function todayDateKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// 識別子（例: メールアドレス）×当日日付の呼び出し回数をDynamoDBでアトミックに
// インクリメントし、1日あたりの上限を超えていないか確認する。課金・レート制限の
// ある外部API呼び出し（Gemini/OpenAI等）や、トークン発行回数の制限等に使う。
// UpdateItem（ADD + ConditionExpression）による単一リクエストでの読み取り・
// 条件判定・更新でレースコンディションを避ける。
//
// テーブルはパーティションキー1つ（keyAttributeで指定する文字列属性）のみを持ち、
// TTL（属性名"expiresAt"固定）を有効にしておくこと。呼び出し側リポジトリの
// serverless.yml等で、このテーブルへのdynamodb:UpdateItem権限を付与する必要がある。
//
// options:
//   ddb: DynamoDBClientインスタンス（呼び出し側で region 等を設定して渡す）
//   tableName: テーブル名
//   keyAttribute: パーティションキーの属性名（例: "emailDate"）
//   identifier: カウント対象の識別子（例: メールアドレス）。内部で
//     `${identifier}#YYYY-MM-DD`（UTC日付）へ変換してキーにする
//   limit: 1日あたりの上限
//   ttlSeconds: TTL（既定: 25時間＝60*60*25。日付境界をまたいだ集計漏れを
//     避けるため、単純な24時間ではなく1時間の余裕を持たせている）
//
// 戻り値: 上限内であればtrue、上限に達していればfalse
async function incrementAndCheckDailyLimit({ ddb, tableName, keyAttribute, identifier, limit, ttlSeconds = 60 * 60 * 25 }) {
  const key = `${identifier}#${todayDateKey()}`;
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  try {
    await ddb.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { [keyAttribute]: { S: key } },
        UpdateExpression: "ADD #count :one SET expiresAt = :expiresAt",
        ConditionExpression: "attribute_not_exists(#count) OR #count < :limit",
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: {
          ":one": { N: "1" },
          ":limit": { N: String(limit) },
          ":expiresAt": { N: String(expiresAt) },
        },
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return false;
    }
    throw error;
  }
}

module.exports = { incrementAndCheckDailyLimit };
