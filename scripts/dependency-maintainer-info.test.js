"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detectMaintainerChange, fetchMaintainerAnomalies, isSameOrganizationDomain, extractEmailDomain } = require("./dependency-maintainer-info.js");

test("detectMaintainerChange: 公開者が異なる場合は異常として返す（メール無しのためsameOrganizationDomainはfalse）", () => {
  const packageJson = {
    versions: {
      "1.0.0": { _npmUser: { name: "alice" } },
      "1.1.0": { _npmUser: { name: "bob" } },
    },
  };
  assert.deepEqual(detectMaintainerChange(packageJson, "1.0.0", "1.1.0"), {
    oldPublisher: "alice",
    newPublisher: "bob",
    sameOrganizationDomain: false,
  });
});

test("detectMaintainerChange: 同一の企業ドメインへの変化はsameOrganizationDomainがtrue", () => {
  const packageJson = {
    versions: {
      "1.0.0": { _npmUser: { name: "typescript-bot", email: "typescript@microsoft.com" } },
      "1.1.0": { _npmUser: { name: "microsoft1es", email: "npmjs@microsoft.com" } },
    },
  };
  assert.deepEqual(detectMaintainerChange(packageJson, "1.0.0", "1.1.0"), {
    oldPublisher: "typescript-bot",
    newPublisher: "microsoft1es",
    sameOrganizationDomain: true,
  });
});

test("detectMaintainerChange: 異なるドメインへの変化はsameOrganizationDomainがfalse", () => {
  const packageJson = {
    versions: {
      "1.0.0": { _npmUser: { name: "alice", email: "alice@example.com" } },
      "1.1.0": { _npmUser: { name: "mallory", email: "mallory@evil.example" } },
    },
  };
  assert.deepEqual(detectMaintainerChange(packageJson, "1.0.0", "1.1.0"), {
    oldPublisher: "alice",
    newPublisher: "mallory",
    sameOrganizationDomain: false,
  });
});

test("detectMaintainerChange: 同一のフリーメールドメインへの変化はsameOrganizationDomainがfalse（ブロックリスト対象）", () => {
  const packageJson = {
    versions: {
      "1.0.0": { _npmUser: { name: "alice", email: "alice@gmail.com" } },
      "1.1.0": { _npmUser: { name: "mallory", email: "mallory@gmail.com" } },
    },
  };
  assert.deepEqual(detectMaintainerChange(packageJson, "1.0.0", "1.1.0"), {
    oldPublisher: "alice",
    newPublisher: "mallory",
    sameOrganizationDomain: false,
  });
});

test("extractEmailDomain: メールアドレスからドメインを抽出する", () => {
  assert.equal(extractEmailDomain("alice@example.com"), "example.com");
  assert.equal(extractEmailDomain("Alice@Example.COM"), "example.com");
  assert.equal(extractEmailDomain(null), null);
  assert.equal(extractEmailDomain(""), null);
  assert.equal(extractEmailDomain("not-an-email"), null);
});

test("isSameOrganizationDomain: ドメイン不一致・メール欠落・フリーメールはfalseを返す", () => {
  assert.equal(isSameOrganizationDomain("a@foo.com", "b@foo.com"), true);
  assert.equal(isSameOrganizationDomain("a@foo.com", "b@bar.com"), false);
  assert.equal(isSameOrganizationDomain(null, "b@foo.com"), false);
  assert.equal(isSameOrganizationDomain("a@gmail.com", "b@gmail.com"), false);
});

test("detectMaintainerChange: 公開者が同じ場合はnullを返す", () => {
  const packageJson = {
    versions: {
      "1.0.0": { _npmUser: { name: "alice" } },
      "1.1.0": { _npmUser: { name: "alice" } },
    },
  };
  assert.equal(detectMaintainerChange(packageJson, "1.0.0", "1.1.0"), null);
});

test("detectMaintainerChange: いずれかのバージョンの公開者情報が無い場合はnullを返す（判定不能）", () => {
  const packageJson = { versions: { "1.1.0": { _npmUser: { name: "bob" } } } };
  assert.equal(detectMaintainerChange(packageJson, "1.0.0", "1.1.0"), null);
});

test("fetchMaintainerAnomalies: 公開者が変化したパッケージのみを返す", async () => {
  const changes = [
    { name: "foo", oldVersion: "1.0.0", newVersion: "1.1.0", updateType: "minor", direct: true },
    { name: "bar", oldVersion: "2.0.0", newVersion: "2.0.1", updateType: "patch", direct: false },
  ];
  const fixtures = {
    foo: { versions: { "1.0.0": { _npmUser: { name: "alice" } }, "1.1.0": { _npmUser: { name: "mallory" } } } },
    bar: { versions: { "2.0.0": { _npmUser: { name: "carol" } }, "2.0.1": { _npmUser: { name: "carol" } } } },
  };
  const fetchJsonImpl = async (url) => {
    const name = url.split("/").pop();
    return fixtures[name];
  };
  const result = await fetchMaintainerAnomalies(changes, { fetchJsonImpl });
  assert.deepEqual(result, [
    { name: "foo", oldVersion: "1.0.0", newVersion: "1.1.0", oldPublisher: "alice", newPublisher: "mallory", sameOrganizationDomain: false },
  ]);
});

test("fetchMaintainerAnomalies: oldVersion/newVersionが無い変更（新規追加等）は対象外とする", async () => {
  const changes = [{ name: "foo", oldVersion: null, newVersion: "1.0.0", updateType: "other", direct: true }];
  let callCount = 0;
  const fetchJsonImpl = async () => {
    callCount++;
    return {};
  };
  const result = await fetchMaintainerAnomalies(changes, { fetchJsonImpl });
  assert.deepEqual(result, []);
  assert.equal(callCount, 0);
});

test("fetchMaintainerAnomalies: 変更が0件ならfetchを呼ばず空配列を返す", async () => {
  let callCount = 0;
  const fetchJsonImpl = async () => {
    callCount++;
    return {};
  };
  assert.deepEqual(await fetchMaintainerAnomalies([], { fetchJsonImpl }), []);
  assert.equal(callCount, 0);
});
