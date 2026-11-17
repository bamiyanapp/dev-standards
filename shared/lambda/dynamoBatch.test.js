"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { batchWriteAll, batchGetAll } = require("./dynamoBatch.js");

class Cmd {
  constructor(input) {
    this.input = input;
  }
}

const noSleep = () => {
  const waits = [];
  const sleep = async (ms) => void waits.push(ms);
  sleep.waits = waits;
  return sleep;
};

test("batchWriteAllは25件ずつに分割する", async () => {
  const sizes = [];
  const ddb = { send: async (c) => (sizes.push(c.input.RequestItems.t.length), {}) };
  await batchWriteAll({ ddb, BatchWriteCommand: Cmd, tableName: "t", puts: Array.from({ length: 26 }, (_, i) => ({ id: i })) });
  assert.deepEqual(sizes, [25, 1]);
});

test("putsとdeletesを混在して送れる", async () => {
  let sent;
  const ddb = { send: async (c) => ((sent = c.input.RequestItems.t), {}) };
  await batchWriteAll({ ddb, BatchWriteCommand: Cmd, tableName: "t", puts: [{ id: 1 }], deletes: [{ id: 2 }] });
  assert.deepEqual(sent, [{ PutRequest: { Item: { id: 1 } } }, { DeleteRequest: { Key: { id: 2 } } }]);
});

test("UnprocessedItemsの分だけ再送し、待ち時間を倍にする", async () => {
  const calls = [];
  const ddb = {
    send: async (c) => {
      calls.push(c.input.RequestItems.t.length);
      if (calls.length < 3) return { UnprocessedItems: { t: c.input.RequestItems.t.slice(0, 1) } };
      return {};
    },
  };
  const sleep = noSleep();
  await batchWriteAll({ ddb, BatchWriteCommand: Cmd, tableName: "t", puts: [{ a: 1 }, { a: 2 }, { a: 3 }], sleep });
  assert.deepEqual(calls, [3, 1, 1]);
  assert.deepEqual(sleep.waits, [50, 100]);
});

test("再試行の上限を超えたら例外を投げる", async () => {
  const ddb = { send: async (c) => ({ UnprocessedItems: { t: c.input.RequestItems.t } }) };
  await assert.rejects(
    batchWriteAll({ ddb, BatchWriteCommand: Cmd, tableName: "t", puts: [{ a: 1 }], maxRetries: 2, sleep: noSleep() }),
    /未処理/,
  );
});

test("何も渡さなければ送信しない", async () => {
  const ddb = { send: async () => assert.fail("送信されてはいけない") };
  await batchWriteAll({ ddb, BatchWriteCommand: Cmd, tableName: "t" });
});

test("batchGetAllは重複を除き100件ずつに分割して結果を連結する", async () => {
  const sizes = [];
  const ddb = {
    send: async (c) => {
      const keys = c.input.RequestItems.t.Keys;
      sizes.push(keys.length);
      return { Responses: { t: keys.map((k) => ({ ...k, v: 1 })) } };
    },
  };
  const keys = Array.from({ length: 101 }, (_, i) => ({ id: i }));
  const items = await batchGetAll({ ddb, BatchGetCommand: Cmd, tableName: "t", keys: [...keys, { id: 0 }] });
  assert.deepEqual(sizes, [100, 1]);
  assert.equal(items.length, 101);
});

test("UnprocessedKeysを再試行し、上限超過は例外", async () => {
  let n = 0;
  const ddb = {
    send: async (c) => {
      n++;
      const keys = c.input.RequestItems.t.Keys;
      return n === 1 ? { Responses: { t: [{ id: 1 }] }, UnprocessedKeys: { t: { Keys: [{ id: 2 }] } } } : { Responses: { t: [{ id: 2 }] } };
    },
  };
  assert.deepEqual(await batchGetAll({ ddb, BatchGetCommand: Cmd, tableName: "t", keys: [{ id: 1 }, { id: 2 }], sleep: noSleep() }), [{ id: 1 }, { id: 2 }]);
  const stuck = { send: async () => ({ UnprocessedKeys: { t: { Keys: [{ id: 1 }] } } }) };
  await assert.rejects(batchGetAll({ ddb: stuck, BatchGetCommand: Cmd, tableName: "t", keys: [{ id: 1 }], maxRetries: 1, sleep: noSleep() }), /未処理/);
});
