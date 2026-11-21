"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createCsrfNonce } = require("./csrfNonce.js");

class PutItemCommand {
  constructor(input) {
    this.type = "Put";
    this.input = input;
  }
}
class DeleteItemCommand {
  constructor(input) {
    this.type = "Delete";
    this.input = input;
  }
}

function setup({ sendImpl } = {}) {
  const sent = [];
  const ddb = {
    send: async (command) => {
      sent.push(command);
      if (sendImpl) return sendImpl(command);
      return {};
    },
  };
  const nonce = createCsrfNonce({
    ddb,
    PutItemCommand,
    DeleteItemCommand,
    tableName: "t-nonces",
    ttlSeconds: 300,
    now: () => 1_700_000_000_000,
    randomHex: () => "abc123",
  });
  return { sent, ...nonce };
}

test("issueCsrfNonce: nonceを登録し、有効期限を現在時刻+TTL秒にする", async () => {
  const { sent, issueCsrfNonce } = setup();
  const nonce = await issueCsrfNonce();
  assert.equal(nonce, "abc123");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "Put");
  assert.deepEqual(sent[0].input, {
    TableName: "t-nonces",
    Item: { nonce: { S: "abc123" }, expiresAt: { N: "1700000300" } },
  });
});

test("issueCsrfNonce: 既定の乱数は、32文字の16進数である", async () => {
  const sent = [];
  const { issueCsrfNonce } = createCsrfNonce({
    ddb: { send: async (c) => sent.push(c) },
    PutItemCommand,
    DeleteItemCommand,
    tableName: "t",
    ttlSeconds: 1,
  });
  const a = await issueCsrfNonce();
  const b = await issueCsrfNonce();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
});

test("consumeCsrfNonce: 条件付き削除を行い、成功すればtrue", async () => {
  const { sent, consumeCsrfNonce } = setup();
  assert.equal(await consumeCsrfNonce("abc123"), true);
  assert.deepEqual(sent[0].input, {
    TableName: "t-nonces",
    Key: { nonce: { S: "abc123" } },
    ConditionExpression: "attribute_exists(#n) AND expiresAt > :now",
    ExpressionAttributeNames: { "#n": "nonce" },
    ExpressionAttributeValues: { ":now": { N: "1700000000" } },
  });
});

test("consumeCsrfNonce: 空・未指定は、DynamoDBを呼ばずにfalse", async () => {
  const { sent, consumeCsrfNonce } = setup();
  assert.equal(await consumeCsrfNonce(""), false);
  assert.equal(await consumeCsrfNonce(undefined), false);
  assert.equal(await consumeCsrfNonce(null), false);
  assert.equal(sent.length, 0);
});

test("consumeCsrfNonce: 使用済み・期限切れ（ConditionalCheckFailedException）はfalse", async () => {
  const { consumeCsrfNonce } = setup({
    sendImpl: () => {
      const e = new Error("conditional");
      e.name = "ConditionalCheckFailedException";
      throw e;
    },
  });
  assert.equal(await consumeCsrfNonce("used"), false);
});

test("consumeCsrfNonce: それ以外のエラーは、そのまま投げる", async () => {
  const { consumeCsrfNonce } = setup({
    sendImpl: () => {
      throw new Error("throttled");
    },
  });
  await assert.rejects(() => consumeCsrfNonce("x"), /throttled/);
});
