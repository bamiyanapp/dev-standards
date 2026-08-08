"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { incrementAndCheckDailyLimit } = require("./dailyRateLimit.js");

// UpdateItemCommandの実際のDynamoDB挙動（ADD + ConditionExpression）を模した
// 簡易インメモリDynamoDBモック。identifier×日付キーごとにcountを保持する
function makeFakeDdb() {
  const table = new Map();
  return {
    table,
    send: async (command) => {
      if (!(command instanceof UpdateItemCommand)) {
        throw new Error("unexpected command");
      }
      const { TableName, Key, ExpressionAttributeValues } = command.input;
      const keyAttribute = Object.keys(Key)[0];
      const key = `${TableName}#${Key[keyAttribute].S}`;
      const limit = Number(ExpressionAttributeValues[":limit"].N);
      const current = table.get(key) || 0;
      if (current >= limit) {
        const error = new Error("conditional check failed");
        error.name = "ConditionalCheckFailedException";
        throw error;
      }
      table.set(key, current + 1);
      return {};
    },
  };
}

test("allows calls while under the daily limit and increments the counter", async () => {
  const ddb = makeFakeDdb();
  const allowed1 = await incrementAndCheckDailyLimit({
    ddb,
    tableName: "my-app-ai-api-issuance",
    keyAttribute: "emailDate",
    identifier: "taro@example.com",
    limit: 2,
  });
  const allowed2 = await incrementAndCheckDailyLimit({
    ddb,
    tableName: "my-app-ai-api-issuance",
    keyAttribute: "emailDate",
    identifier: "taro@example.com",
    limit: 2,
  });

  assert.equal(allowed1, true);
  assert.equal(allowed2, true);
});

test("returns false once the daily limit is reached, without throwing", async () => {
  const ddb = makeFakeDdb();
  const options = {
    ddb,
    tableName: "my-app-ai-api-issuance",
    keyAttribute: "emailDate",
    identifier: "taro@example.com",
    limit: 1,
  };

  const first = await incrementAndCheckDailyLimit(options);
  const second = await incrementAndCheckDailyLimit(options);

  assert.equal(first, true);
  assert.equal(second, false);
});

test("tracks separate counters per identifier", async () => {
  const ddb = makeFakeDdb();
  const base = { ddb, tableName: "my-app-ai-api-issuance", keyAttribute: "emailDate", limit: 1 };

  const taro = await incrementAndCheckDailyLimit({ ...base, identifier: "taro@example.com" });
  const hanako = await incrementAndCheckDailyLimit({ ...base, identifier: "hanako@example.com" });

  assert.equal(taro, true);
  assert.equal(hanako, true, "a different identifier must not share the same counter");
});

test("re-throws unexpected DynamoDB errors instead of treating them as a limit hit", async () => {
  const ddb = {
    send: async () => {
      throw new Error("network error");
    },
  };

  await assert.rejects(
    () =>
      incrementAndCheckDailyLimit({
        ddb,
        tableName: "my-app-ai-api-issuance",
        keyAttribute: "emailDate",
        identifier: "taro@example.com",
        limit: 1,
      }),
    /network error/
  );
});

test("builds the DynamoDB key as identifier#YYYY-MM-DD (UTC)", async () => {
  let capturedKey;
  const ddb = {
    send: async (command) => {
      const keyAttribute = Object.keys(command.input.Key)[0];
      capturedKey = command.input.Key[keyAttribute].S;
      return {};
    },
  };

  await incrementAndCheckDailyLimit({
    ddb,
    tableName: "my-app-ai-api-issuance",
    keyAttribute: "emailDate",
    identifier: "taro@example.com",
    limit: 1,
  });

  const todayUtc = new Date().toISOString().slice(0, 10);
  assert.equal(capturedKey, `taro@example.com#${todayUtc}`);
});

test("sets expiresAt roughly ttlSeconds from now for TTL-based cleanup", async () => {
  let capturedExpiresAt;
  const ddb = {
    send: async (command) => {
      capturedExpiresAt = Number(command.input.ExpressionAttributeValues[":expiresAt"].N);
      return {};
    },
  };

  const before = Math.floor(Date.now() / 1000);
  await incrementAndCheckDailyLimit({
    ddb,
    tableName: "my-app-ai-api-issuance",
    keyAttribute: "emailDate",
    identifier: "taro@example.com",
    limit: 1,
    ttlSeconds: 3600,
  });
  const after = Math.floor(Date.now() / 1000);

  assert.ok(capturedExpiresAt >= before + 3600 && capturedExpiresAt <= after + 3600);
});
