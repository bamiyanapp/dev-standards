"use strict";

// BatchWriteItem・BatchGetItemを、件数の上限で分割し、未処理分を再試行して実行する。
// 一部だけ処理して成功を返さない。再試行の上限を超えたら例外を投げる。
//
// dynamoPagination.jsと同じく、AWS SDKはrequireしない。クライアント（ddb）と
// コマンドクラスは呼び出し側から受け取る。DocumentClientを使う場合は、
// puts・deletes・keysをそのままJavaScriptの値で渡せる（DynamoDBClientなら属性値形式で渡す）。
//
// 共通のoptions:
//   maxRetries: 未処理分の再試行回数の上限（既定: 5）
//   baseDelayMs: 再試行の待ち時間の初期値。回ごとに倍にする（既定: 50）
//   sleep: 待機関数（テストで差し替える）

const WRITE_CHUNK = 25;
const GET_CHUNK = 100;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// puts: 書き込むItemの配列 / deletes: 削除するKeyの配列
async function batchWriteAll({
  ddb,
  BatchWriteCommand,
  tableName,
  puts = [],
  deletes = [],
  maxRetries = 5,
  baseDelayMs = 50,
  sleep = defaultSleep,
}) {
  const requests = [
    ...puts.map((Item) => ({ PutRequest: { Item } })),
    ...deletes.map((Key) => ({ DeleteRequest: { Key } })),
  ];
  for (const part of chunk(requests, WRITE_CHUNK)) {
    let pending = part;
    for (let attempt = 0; ; attempt++) {
      const result = await ddb.send(new BatchWriteCommand({ RequestItems: { [tableName]: pending } }));
      pending = (result.UnprocessedItems && result.UnprocessedItems[tableName]) || [];
      if (pending.length === 0) break;
      if (attempt >= maxRetries) {
        throw new Error(`BatchWriteItemの未処理分が${pending.length}件残りました（再試行${maxRetries}回）`);
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
}

// keys: 取得するKeyの配列。重複は取り除く（重複があるとDynamoDBがエラーにする）。
// 戻り値: 取得できたItemの配列（順序は保証されない）
async function batchGetAll({
  ddb,
  BatchGetCommand,
  tableName,
  keys = [],
  maxRetries = 5,
  baseDelayMs = 50,
  sleep = defaultSleep,
}) {
  const unique = [...new Map(keys.map((k) => [JSON.stringify(k), k])).values()];
  const items = [];
  for (const part of chunk(unique, GET_CHUNK)) {
    let pending = part;
    for (let attempt = 0; ; attempt++) {
      const result = await ddb.send(new BatchGetCommand({ RequestItems: { [tableName]: { Keys: pending } } }));
      items.push(...((result.Responses && result.Responses[tableName]) || []));
      pending = (result.UnprocessedKeys && result.UnprocessedKeys[tableName] && result.UnprocessedKeys[tableName].Keys) || [];
      if (pending.length === 0) break;
      if (attempt >= maxRetries) {
        throw new Error(`BatchGetItemの未処理分が${pending.length}件残りました（再試行${maxRetries}回）`);
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  return items;
}

module.exports = { batchWriteAll, batchGetAll };
