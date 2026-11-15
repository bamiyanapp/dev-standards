"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs, buildConfigFromEnv, buildDummyConfig, toKebabCase, run } = require("./generate-config-from-env.js");

function fakeFs(existing = []) {
  const files = new Map(existing.map((p) => [p, "{}"]));
  return {
    files,
    existsSync: (p) => files.has(p),
    mkdirSync: () => {},
    writeFileSync: (p, content) => files.set(p, content),
  };
}

test("parseArgs: --outと「キー=環境変数名」を解釈する", () => {
  const parsed = parseArgs(["--out", "a.json", "fooKey=FOO_KEY", "bar=BAR"]);
  assert.equal(parsed.out, "a.json");
  assert.deepEqual(parsed.mappings, [
    { key: "fooKey", envName: "FOO_KEY" },
    { key: "bar", envName: "BAR" },
  ]);
});

test("parseArgs: --out無し・対応表無し・重複・不明オプション・不正な--dummyはエラー", () => {
  assert.throws(() => parseArgs(["k=V"]), /--out/);
  assert.throws(() => parseArgs(["--out", "a.json"]), /1つ以上/);
  assert.throws(() => parseArgs(["--out", "a.json", "k=A", "k=B"]), /重複/);
  assert.throws(() => parseArgs(["--out", "a.json", "--bad", "k=A"]), /不明/);
  assert.throws(() => parseArgs(["--out", "a.json", "k=A", "--dummy", "other=x"]), /位置引数にありません/);
  assert.throws(() => parseArgs(["--out", "a.json", "k=A", "noequals"]), /キー=値/);
});

test("buildConfigFromEnv: 未設定・空文字列の環境変数名を全て列挙する", () => {
  const mappings = [
    { key: "a", envName: "A" },
    { key: "b", envName: "B" },
    { key: "c", envName: "C" },
  ];
  const { config, missing } = buildConfigFromEnv(mappings, { A: "1", B: "" });
  assert.deepEqual(config, { a: "1" });
  assert.deepEqual(missing, ["B", "C"]);
});

test("toKebabCase / buildDummyConfig: 既定はtest-ケバブケース、--dummyで上書き", () => {
  assert.equal(toKebabCase("lineChannelSecret"), "line-channel-secret");
  const config = buildDummyConfig(
    [{ key: "lineChannelSecret" }, { key: "adminNotifyEmail" }],
    { adminNotifyEmail: "test-admin@example.com" },
  );
  assert.deepEqual(config, {
    lineChannelSecret: "test-line-channel-secret",
    adminNotifyEmail: "test-admin@example.com",
  });
});

test("run: 全環境変数が揃っていれば設定ファイルを書き出す", () => {
  const fileSystem = fakeFs();
  const code = run({ argv: ["--out", "out/c.json", "a=A"], env: { A: "v" }, fileSystem, log: () => {} });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(fileSystem.files.get("out/c.json")), { a: "v" });
});

test("run: 環境変数不足なら例外を投げ、ファイルは書かない", () => {
  const fileSystem = fakeFs();
  assert.throws(
    () => run({ argv: ["--out", "c.json", "a=A", "b=B"], env: {}, fileSystem, log: () => {} }),
    /A, B/,
  );
  assert.equal(fileSystem.files.size, 0);
});

test("run --ensure-test: 既存ファイルは上書きせず、無ければダミーで生成する", () => {
  const existing = fakeFs(["c.json"]);
  run({ argv: ["--out", "c.json", "--ensure-test", "a=A"], env: {}, fileSystem: existing, log: () => {} });
  assert.equal(existing.files.get("c.json"), "{}");

  const fresh = fakeFs();
  run({ argv: ["--out", "c.json", "--ensure-test", "fooBar=FOO_BAR"], env: {}, fileSystem: fresh, log: () => {} });
  assert.deepEqual(JSON.parse(fresh.files.get("c.json")), { fooBar: "test-foo-bar" });
});
