"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { listHandlers, globToRegExp, verifyDirectory } = require("./verify-lambda-package.js");

const SERVICE = `functions:
  a:
    handler: handler.a
    events:
      - sns:
          arn: !Ref Topic
  b:
    handler: src/b.main
`;

function pkg(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vlp-"));
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

test("listHandlers: CloudFormationのタグがあっても、handlerを重複なく列挙する", () => {
  assert.deepEqual(listHandlers(SERVICE), ["handler.a", "src/b.main"]);
});

test("globToRegExp: 拡張子・ディレクトリ配下に一致する", () => {
  assert.ok(globToRegExp("*.test.js").test("x/a.test.js"));
  assert.ok(globToRegExp("seed*.js").test("seed-stock.js"));
  assert.ok(!globToRegExp("*.test.js").test("a.js"));
  assert.ok(globToRegExp("scripts/**").test("scripts/a/b.js"));
});

test("verifyDirectory: 正常なパッケージは問題なし", async () => {
  const dir = pkg({ "handler.js": "exports.a = () => 1;", "src/b.js": "exports.main = () => 2;" });
  assert.deepEqual(await verifyDirectory(dir, SERVICE, ["*.test.js"]), []);
});

test("verifyDirectory: ファイルの欠落を検出する", async () => {
  const dir = pkg({ "handler.js": "exports.a = () => 1;" });
  const problems = await verifyDirectory(dir, SERVICE);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /src\/b/);
});

test("verifyDirectory: 依存ファイルの欠落（Cannot find module）を検出する", async () => {
  const dir = pkg({ "handler.js": 'require("./missing"); exports.a = () => 1;', "src/b.js": "exports.main = () => 2;" });
  const problems = await verifyDirectory(dir, SERVICE);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /handler\.a.*MODULE_NOT_FOUND/);
});

test("verifyDirectory: export欠落と禁止ファイルの混入を検出する", async () => {
  const dir = pkg({ "handler.js": "exports.other = () => 1;", "src/b.js": "exports.main = () => 2;", "handler.test.js": "" });
  const problems = await verifyDirectory(dir, SERVICE, ["*.test.js"]);
  assert.equal(problems.length, 2);
  assert.ok(problems.some((p) => p.includes("exportされていません")));
  assert.ok(problems.some((p) => p.includes("handler.test.js")));
});

test("verifyDirectory: ESMのハンドラも読み込める", async () => {
  const dir = pkg({ "handler.mjs": "export const a = () => 1;", "src/b.js": "exports.main = () => 2;" });
  assert.deepEqual(await verifyDirectory(dir, SERVICE), []);
});

test("CLI: zipを展開して検証し、問題があれば非0で終了する", (t) => {
  if (spawnSync("zip", ["-v"]).error) return t.skip("zipコマンドが無い");
  const dir = pkg({ "handler.js": "exports.a = () => 1;" });
  const zip = path.join(os.tmpdir(), `vlp-${Date.now()}.zip`);
  spawnSync("zip", ["-qr", zip, "."], { cwd: dir });
  const yml = path.join(dir, "..", `vlp-${Date.now()}.yml`);
  fs.writeFileSync(yml, SERVICE);
  const r = spawnSync("node", [path.join(__dirname, "verify-lambda-package.js"), "--zip", zip, "--service-file", yml]);
  assert.equal(r.status, 1);
  assert.match(r.stderr.toString(), /src\/b/);
});
