"use strict";

// API Gateway WebSocket + DynamoDBで「接続ごとの状態をテーブルで管理し、ルーム内の
// 全接続へブロードキャストする」構成（docs/serverless-spa-pattern.md参照）の共通ロジック。
// karutaのbackend/quizRoomStore.jsから、かるた固有の参加者名導出ロジック
// （collectParticipantNames）を除いた汎用部分を切り出したもの。
//
// dailyRateLimit.js・opsAlertNotifier.js等と同様、このファイル自体はnpmパッケージを
// requireしない（symlink経由で共有する場合のnode_modules解決の問題を避けるため。
// 詳細はdocs/daily-rate-limit-pattern.md参照）。DynamoDBDocumentClientインスタンス・
// 各種Commandクラス・ApiGatewayManagementApiClientは呼び出し側でrequireして注入すること。
//
// 前提とするDynamoDBテーブル構成:
//   - パーティションキー: connectionId（文字列）
//   - roomIndexName（既定"roomId-index"）という名前のGSIを持ち、パーティション
//     キーがroomId（文字列）であること

async function getConnection({ docClient, GetCommand, tableName, connectionId }) {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { connectionId },
    })
  );
  return result.Item;
}

async function queryRoomConnections({ docClient, QueryCommand, tableName, roomIndexName = "roomId-index", roomId }) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: roomIndexName,
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: { ":roomId": roomId },
    })
  );
  return result.Items || [];
}

function buildManagementApiClient({ ApiGatewayManagementApiClient, event }) {
  const { domainName, stage } = event.requestContext;
  return new ApiGatewayManagementApiClient({ endpoint: `https://${domainName}/${stage}` });
}

// 切断済み接続（GoneException/410）への送信は接続レコードを掃除し、他の接続への
// ブロードキャストは継続できるよう例外を投げずfalseを返す
async function postToConnection({ docClient, DeleteCommand, PostToConnectionCommand, managementApi, tableName, connectionId, payload }) {
  try {
    await managementApi.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(payload)),
      })
    );
    return true;
  } catch (error) {
    if (error.name === "GoneException" || error.$metadata?.httpStatusCode === 410) {
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { connectionId },
        })
      );
      return false;
    }
    throw error;
  }
}

// 呼び出し側が既にqueryRoomConnections()で取得済みの接続一覧（connections）へ
// payloadを配信する。参加者名の導出等、配信前にconnectionsを使った計算が必要な
// 呼び出し側が多いため、クエリ自体はこの関数の内側では行わない（二重クエリを避ける）。
// 除外したい接続があればexcludeConnectionIdで指定する。payloadは固定値、または
// 各接続（conn）ごとに内容を変えたい場合は関数を渡せる
async function broadcastToRoom({ docClient, DeleteCommand, PostToConnectionCommand, managementApi, tableName, connections, payload, excludeConnectionId }) {
  const targets = excludeConnectionId ? connections.filter((conn) => conn.connectionId !== excludeConnectionId) : connections;
  await Promise.allSettled(
    targets.map((conn) =>
      postToConnection({
        docClient,
        DeleteCommand,
        PostToConnectionCommand,
        managementApi,
        tableName,
        connectionId: conn.connectionId,
        payload: typeof payload === "function" ? payload(conn) : payload,
      })
    )
  );
}

// WebSocketカスタムルートの役割ガード＋catchブロックの共通化。ガードに使う接続の
// 取得（getConnection）自体もここで行うため、呼び出し側は「ガードを通った後の
// 本処理」だけを書けばよい
function withRoleGuard({ docClient, GetCommand, tableName, role, handler }) {
  return async (event) => {
    try {
      const connectionId = event.requestContext.connectionId;
      const connection = await getConnection({ docClient, GetCommand, tableName, connectionId });
      if (!connection || connection.role !== role) {
        return { statusCode: 403, body: "Forbidden" };
      }
      return await handler(event, connection, connectionId);
    } catch (error) {
      console.error(error);
      return { statusCode: 500, body: "Internal Server Error" };
    }
  };
}

// ガード（役割チェック）は不要だがcatchブロックの共通化だけ受けたいハンドラ向け
function withCatchAll(handler) {
  return async (event) => {
    try {
      return await handler(event);
    } catch (error) {
      console.error(error);
      return { statusCode: 500, body: "Internal Server Error" };
    }
  };
}

module.exports = {
  getConnection,
  queryRoomConnections,
  buildManagementApiClient,
  postToConnection,
  broadcastToRoom,
  withRoleGuard,
  withCatchAll,
};
