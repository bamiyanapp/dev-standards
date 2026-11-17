"use strict";

// QueryCommand・ScanCommandの結果を、LastEvaluatedKeyが無くなるまで繰り返して取得する。
// DynamoDBは1回の応答を1MBで打ち切るため、LastEvaluatedKeyを見ないと結果が黙って欠ける。
//
// dailyRateLimit.jsと同じく、AWS SDKはrequireしない。クライアント（ddb）と
// コマンドクラスは呼び出し側から受け取る（symlink共有時にnode_modulesを解決できないため）。
// ddbはDynamoDBClientでもDynamoDBDocumentClientでもよい（sendを持っていればよい）。
//
// options:
//   ddb: sendメソッドを持つクライアント
//   QueryCommand / ScanCommand: 呼び出し側でrequireして渡すコマンドクラス
//   params: コマンドへ渡す入力。書き換えない（ExclusiveStartKeyはコピーへ足す）
//   maxItems: 取得件数の上限（既定: 10000）。超えたら黙って打ち切らず例外を投げる
//
// Limitを指定したQueryは「先頭N件が欲しい」意図のことがある。その呼び出しを
// 全件取得へ置き換えると挙動が変わるため、置き換えは呼び出し箇所ごとに意図を確認する。

const DEFAULT_MAX_ITEMS = 10000;

async function* pages({ ddb, Command, params, maxItems }) {
  let count = 0;
  let startKey;
  do {
    const input = startKey ? { ...params, ExclusiveStartKey: startKey } : { ...params };
    const result = await ddb.send(new Command(input));
    const items = result.Items || [];
    count += items.length;
    if (count > maxItems) {
      throw new Error(`DynamoDBの取得件数が上限（${maxItems}件）を超えました`);
    }
    if (items.length > 0) yield items;
    startKey = result.LastEvaluatedKey;
  } while (startKey);
}

async function collect(args) {
  const all = [];
  for await (const items of pages(args)) all.push(...items);
  return all;
}

// 全件を配列で返す
function queryAll({ ddb, QueryCommand, params, maxItems = DEFAULT_MAX_ITEMS }) {
  return collect({ ddb, Command: QueryCommand, params, maxItems });
}

function scanAll({ ddb, ScanCommand, params, maxItems = DEFAULT_MAX_ITEMS }) {
  return collect({ ddb, Command: ScanCommand, params, maxItems });
}

// 全件を溜めずに、1ページ分（配列）ずつ返す。削除のように取得しながら処理する用途向け
function queryPages({ ddb, QueryCommand, params, maxItems = DEFAULT_MAX_ITEMS }) {
  return pages({ ddb, Command: QueryCommand, params, maxItems });
}

function scanPages({ ddb, ScanCommand, params, maxItems = DEFAULT_MAX_ITEMS }) {
  return pages({ ddb, Command: ScanCommand, params, maxItems });
}

module.exports = { queryAll, scanAll, queryPages, scanPages };
