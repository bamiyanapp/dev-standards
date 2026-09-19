"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getConnection,
  queryRoomConnections,
  buildManagementApiClient,
  postToConnection,
  broadcastToRoom,
  withRoleGuard,
  withCatchAll,
} = require("./webSocketBroadcast.js");

// 実際のAWS SDKパッケージはこのリポジトリの依存に含めない（呼び出し側で注入される
// 前提のため）。テストでは、実装がinstanceofチェックを行わず`new Command(input)`の
// inputだけを参照する前提を踏まえ、同じ形の軽量なフェイククラスで代替する。
class GetCommand {
  constructor(input) {
    this.input = input;
  }
}
class QueryCommand {
  constructor(input) {
    this.input = input;
  }
}
class DeleteCommand {
  constructor(input) {
    this.input = input;
  }
}
class PostToConnectionCommand {
  constructor(input) {
    this.input = input;
  }
}
class FakeApiGatewayManagementApiClient {
  constructor(config) {
    this.config = config;
  }
}

test("getConnection: connectionIdをキーにGetCommandでテーブルを引く", async () => {
  let capturedInput;
  const docClient = {
    send: async (command) => {
      capturedInput = command.input;
      return { Item: { connectionId: "conn-1", role: "participant" } };
    },
  };

  const connection = await getConnection({ docClient, GetCommand, tableName: "connections", connectionId: "conn-1" });

  assert.deepEqual(capturedInput, { TableName: "connections", Key: { connectionId: "conn-1" } });
  assert.deepEqual(connection, { connectionId: "conn-1", role: "participant" });
});

test("queryRoomConnections: 既定のGSI名でroomId条件のQueryを行い、Itemsが無ければ空配列を返す", async () => {
  let capturedInput;
  const docClient = {
    send: async (command) => {
      capturedInput = command.input;
      return {};
    },
  };

  const connections = await queryRoomConnections({ docClient, QueryCommand, tableName: "connections", roomId: "room-1" });

  assert.equal(capturedInput.IndexName, "roomId-index");
  assert.equal(capturedInput.ExpressionAttributeValues[":roomId"], "room-1");
  assert.deepEqual(connections, []);
});

test("queryRoomConnections: roomIndexNameを指定すればそのGSI名を使う", async () => {
  let capturedIndexName;
  const docClient = {
    send: async (command) => {
      capturedIndexName = command.input.IndexName;
      return { Items: [{ connectionId: "conn-1" }] };
    },
  };

  const connections = await queryRoomConnections({
    docClient,
    QueryCommand,
    tableName: "connections",
    roomIndexName: "custom-room-index",
    roomId: "room-1",
  });

  assert.equal(capturedIndexName, "custom-room-index");
  assert.deepEqual(connections, [{ connectionId: "conn-1" }]);
});

test("buildManagementApiClient: eventのdomainName/stageからendpointを組み立てる", () => {
  const event = { requestContext: { domainName: "example.execute-api.ap-northeast-1.amazonaws.com", stage: "prod" } };

  const client = buildManagementApiClient({ ApiGatewayManagementApiClient: FakeApiGatewayManagementApiClient, event });

  assert.equal(client.config.endpoint, "https://example.execute-api.ap-northeast-1.amazonaws.com/prod");
});

test("postToConnection: 送信に成功すればtrueを返し、接続レコードは削除しない", async () => {
  let deleteCalled = false;
  const docClient = { send: async () => { deleteCalled = true; } };
  const managementApi = { send: async () => ({}) };

  const result = await postToConnection({
    docClient,
    DeleteCommand,
    PostToConnectionCommand,
    managementApi,
    tableName: "connections",
    connectionId: "conn-1",
    payload: { type: "state" },
  });

  assert.equal(result, true);
  assert.equal(deleteCalled, false);
});

test("postToConnection: GoneException（410）の場合は接続レコードを削除しfalseを返す", async () => {
  let capturedDeleteInput;
  const docClient = {
    send: async (command) => {
      capturedDeleteInput = command.input;
      return {};
    },
  };
  const managementApi = {
    send: async () => {
      const error = new Error("gone");
      error.name = "GoneException";
      throw error;
    },
  };

  const result = await postToConnection({
    docClient,
    DeleteCommand,
    PostToConnectionCommand,
    managementApi,
    tableName: "connections",
    connectionId: "conn-1",
    payload: { type: "state" },
  });

  assert.equal(result, false);
  assert.deepEqual(capturedDeleteInput, { TableName: "connections", Key: { connectionId: "conn-1" } });
});

test("postToConnection: 410以外のエラーは再送出する", async () => {
  const docClient = { send: async () => { throw new Error("must not be called"); } };
  const managementApi = {
    send: async () => {
      throw new Error("unexpected failure");
    },
  };

  await assert.rejects(
    () =>
      postToConnection({
        docClient,
        DeleteCommand,
        PostToConnectionCommand,
        managementApi,
        tableName: "connections",
        connectionId: "conn-1",
        payload: {},
      }),
    /unexpected failure/
  );
});

test("broadcastToRoom: 全接続へ送信し、excludeConnectionIdで指定した接続は除外する", async () => {
  const sentTo = [];
  const managementApi = {
    send: async (command) => {
      sentTo.push(command.input.ConnectionId);
      return {};
    },
  };
  const docClient = { send: async () => ({}) };

  await broadcastToRoom({
    docClient,
    DeleteCommand,
    PostToConnectionCommand,
    managementApi,
    tableName: "connections",
    connections: [{ connectionId: "conn-1" }, { connectionId: "conn-2" }],
    payload: { type: "state" },
    excludeConnectionId: "conn-2",
  });

  assert.deepEqual(sentTo, ["conn-1"]);
});

test("broadcastToRoom: payloadが関数の場合は接続ごとに内容を変えて送信する", async () => {
  const sentPayloads = [];
  const managementApi = {
    send: async (command) => {
      sentPayloads.push(JSON.parse(Buffer.from(command.input.Data).toString()));
      return {};
    },
  };
  const docClient = { send: async () => ({}) };

  await broadcastToRoom({
    docClient,
    DeleteCommand,
    PostToConnectionCommand,
    managementApi,
    tableName: "connections",
    connections: [{ connectionId: "conn-1", name: "taro" }, { connectionId: "conn-2", name: "hanako" }],
    payload: (conn) => ({ type: "welcome", name: conn.name }),
  });

  assert.deepEqual(sentPayloads, [
    { type: "welcome", name: "taro" },
    { type: "welcome", name: "hanako" },
  ]);
});

test("broadcastToRoom: 一部の接続への送信が失敗しても他の接続への送信は継続する", async () => {
  const sentTo = [];
  const managementApi = {
    send: async (command) => {
      if (command.input.ConnectionId === "conn-1") {
        throw new Error("network error");
      }
      sentTo.push(command.input.ConnectionId);
      return {};
    },
  };
  const docClient = { send: async () => ({}) };

  await broadcastToRoom({
    docClient,
    DeleteCommand,
    PostToConnectionCommand,
    managementApi,
    tableName: "connections",
    connections: [{ connectionId: "conn-1" }, { connectionId: "conn-2" }],
    payload: {},
  });

  assert.deepEqual(sentTo, ["conn-2"]);
});

test("withRoleGuard: 接続の役割が一致すればhandlerを呼ぶ", async () => {
  const docClient = { send: async () => ({ Item: { connectionId: "conn-1", role: "admin" } }) };
  let receivedArgs;
  const guarded = withRoleGuard({
    docClient,
    GetCommand,
    tableName: "connections",
    role: "admin",
    handler: async (event, connection, connectionId) => {
      receivedArgs = { event, connection, connectionId };
      return { statusCode: 200, body: "OK" };
    },
  });

  const result = await guarded({ requestContext: { connectionId: "conn-1" } });

  assert.deepEqual(result, { statusCode: 200, body: "OK" });
  assert.equal(receivedArgs.connectionId, "conn-1");
  assert.equal(receivedArgs.connection.role, "admin");
});

test("withRoleGuard: 接続が存在しない、または役割が一致しなければ403を返す", async () => {
  const docClient = { send: async () => ({}) };
  const guarded = withRoleGuard({
    docClient,
    GetCommand,
    tableName: "connections",
    role: "admin",
    handler: async () => ({ statusCode: 200, body: "OK" }),
  });

  const result = await guarded({ requestContext: { connectionId: "conn-1" } });

  assert.deepEqual(result, { statusCode: 403, body: "Forbidden" });
});

test("withRoleGuard: handler内で例外が投げられれば500を返す", async () => {
  const docClient = { send: async () => ({ Item: { connectionId: "conn-1", role: "admin" } }) };
  const guarded = withRoleGuard({
    docClient,
    GetCommand,
    tableName: "connections",
    role: "admin",
    handler: async () => {
      throw new Error("boom");
    },
  });

  const result = await guarded({ requestContext: { connectionId: "conn-1" } });

  assert.deepEqual(result, { statusCode: 500, body: "Internal Server Error" });
});

test("withCatchAll: 正常時はhandlerの戻り値をそのまま返す", async () => {
  const wrapped = withCatchAll(async (event) => ({ statusCode: 200, body: event.value }));

  const result = await wrapped({ value: "OK" });

  assert.deepEqual(result, { statusCode: 200, body: "OK" });
});

test("withCatchAll: handler内で例外が投げられれば500を返す", async () => {
  const wrapped = withCatchAll(async () => {
    throw new Error("boom");
  });

  const result = await wrapped({});

  assert.deepEqual(result, { statusCode: 500, body: "Internal Server Error" });
});
