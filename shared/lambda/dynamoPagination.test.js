"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { queryAll, scanAll, queryPages } = require("./dynamoPagination.js");

class FakeQuery {
  constructor(input) {
    this.input = input;
  }
}
class FakeScan extends FakeQuery {}

// ページ列を順に返すクライアント。受け取った入力を記録する
function fakeDdb(pages) {
  const inputs = [];
  let i = 0;
  return {
    inputs,
    send: async (command) => {
      inputs.push(command.input);
      const page = pages[i++];
      if (page instanceof Error) throw page;
      return page;
    },
  };
}

test("1ページで終わる場合はそのItemsを返す", async () => {
  const ddb = fakeDdb([{ Items: [1, 2] }]);
  assert.deepEqual(await queryAll({ ddb, QueryCommand: FakeQuery, params: { TableName: "t" } }), [1, 2]);
});

test("複数ページをLastEvaluatedKeyで連結する", async () => {
  const ddb = fakeDdb([{ Items: [1], LastEvaluatedKey: { k: 1 } }, { Items: [2], LastEvaluatedKey: { k: 2 } }, { Items: [3] }]);
  assert.deepEqual(await scanAll({ ddb, ScanCommand: FakeScan, params: { TableName: "t" } }), [1, 2, 3]);
  assert.equal(ddb.inputs[1].ExclusiveStartKey.k, 1);
  assert.equal(ddb.inputs[2].ExclusiveStartKey.k, 2);
});

test("0件・Items無しは空配列", async () => {
  assert.deepEqual(await queryAll({ ddb: fakeDdb([{ Items: [] }]), QueryCommand: FakeQuery, params: {} }), []);
  assert.deepEqual(await queryAll({ ddb: fakeDdb([{}]), QueryCommand: FakeQuery, params: {} }), []);
});

test("渡したparamsを書き換えない", async () => {
  const params = { TableName: "t" };
  const ddb = fakeDdb([{ Items: [1], LastEvaluatedKey: { k: 1 } }, { Items: [2] }]);
  await queryAll({ ddb, QueryCommand: FakeQuery, params });
  assert.deepEqual(params, { TableName: "t" });
});

test("途中のエラーは握りつぶさず投げる", async () => {
  const ddb = fakeDdb([{ Items: [1], LastEvaluatedKey: { k: 1 } }, new Error("boom")]);
  await assert.rejects(queryAll({ ddb, QueryCommand: FakeQuery, params: {} }), /boom/);
});

test("maxItemsを超えたら黙って打ち切らず例外を投げる", async () => {
  const ddb = fakeDdb([{ Items: [1, 2], LastEvaluatedKey: { k: 1 } }, { Items: [3] }]);
  await assert.rejects(queryAll({ ddb, QueryCommand: FakeQuery, params: {}, maxItems: 2 }), /上限/);
});

test("queryPagesは1ページずつ返す", async () => {
  const ddb = fakeDdb([{ Items: [1], LastEvaluatedKey: { k: 1 } }, { Items: [2] }]);
  const got = [];
  for await (const items of queryPages({ ddb, QueryCommand: FakeQuery, params: {} })) got.push(items);
  assert.deepEqual(got, [[1], [2]]);
});
