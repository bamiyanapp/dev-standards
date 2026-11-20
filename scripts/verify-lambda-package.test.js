"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { listHandlers, globToRegExp, verifyDirectory, readNodeOptions, lambdaNodeOptions, isEsmHandler } = require("./verify-lambda-package.js");

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

// dev-standards#1485: ESM専用の依存を、CommonJSのハンドラがrequireする構成（firebase-admin 14 → jwks-rsa → jose 6と同じ構造）
const ESM_ONLY_DEP = {
  "node_modules/esm-only/package.json": JSON.stringify({ name: "esm-only", version: "1.0.0", type: "module", main: "index.js" }),
  "node_modules/esm-only/index.js": "export const value = 1;\n",
  "handler.js": 'const dep = require("esm-only");\nexports.a = () => dep.value;\n',
};

test("verifyDirectory: Lambdaと同じ規則（require(esm)が無効）で、ESM専用の依存を持つハンドラは、読み込みに失敗する", async () => {
  const dir = pkg(ESM_ONLY_DEP);
  const problems = await verifyDirectory(dir, "functions:\n  a:\n    handler: handler.a\n");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /handler\.a: Lambdaと同じ読み込み規則（require\(esm\)が無効）で、読み込みに失敗しました/);
  assert.match(problems[0], /ERR_REQUIRE_ESM/);
});

test("verifyDirectory: serverless.ymlのNODE_OPTIONSに--experimental-require-moduleがあれば、成功する（Lambdaの実行環境を再現する）", async () => {
  const dir = pkg(ESM_ONLY_DEP);
  const service = "provider:\n  environment:\n    NODE_OPTIONS: --experimental-require-module\nfunctions:\n  a:\n    handler: handler.a\n";
  assert.deepEqual(await verifyDirectory(dir, service), []);
});

test("verifyDirectory: allowRequireEsmを指定すると、Lambdaの再現をせず、CIのNode.jsの規則で読み込む", async () => {
  const dir = pkg(ESM_ONLY_DEP);
  assert.deepEqual(await verifyDirectory(dir, "functions:\n  a:\n    handler: handler.a\n", [], { allowRequireEsm: true }), []);
});

test("verifyDirectory: ESM専用の依存が無い通常のCommonJSハンドラは、成功する", async () => {
  const dir = pkg({ "handler.js": "exports.a = () => 1;\n" });
  assert.deepEqual(await verifyDirectory(dir, "functions:\n  a:\n    handler: handler.a\n"), []);
});

test("verifyDirectory: ESMのハンドラ（.mjs）は、Lambdaもimport()で読み込むため、再現の対象外で、成功する", async () => {
  const dir = pkg({ "handler.mjs": "export const a = () => 1;\n" });
  assert.deepEqual(await verifyDirectory(dir, "functions:\n  a:\n    handler: handler.a\n"), []);
});

test("verifyDirectory: Lambdaの再現でも、関数がexportされていなければ、問題にする", async () => {
  const dir = pkg({ "handler.js": "exports.other = () => 1;\n" });
  const problems = await verifyDirectory(dir, "functions:\n  a:\n    handler: handler.a\n");
  assert.deepEqual(problems, ["handler.a: a が関数としてexportされていません"]);
});

test("readNodeOptions・lambdaNodeOptions: serverless.ymlのNODE_OPTIONSを読み、既定は--no-experimental-require-module", () => {
  assert.equal(readNodeOptions("provider:\n  environment:\n    NODE_OPTIONS: --experimental-require-module\n"), "--experimental-require-module");
  assert.equal(readNodeOptions('    NODE_OPTIONS: "--experimental-require-module --enable-source-maps"\n'), "--experimental-require-module --enable-source-maps");
  assert.equal(readNodeOptions("functions: {}\n"), "");
  assert.equal(lambdaNodeOptions("functions: {}\n"), "--no-experimental-require-module");
  assert.equal(lambdaNodeOptions("    NODE_OPTIONS: --experimental-require-module\n"), "--experimental-require-module");
});

test("isEsmHandler: .mjs・type: moduleはESM、.cjsとtype無しはCommonJS", () => {
  const esm = pkg({ "package.json": '{"type":"module"}', "h.js": "" });
  const cjs = pkg({ "package.json": "{}", "h.js": "", "h.cjs": "", "h.mjs": "" });
  assert.equal(isEsmHandler(path.join(esm, "h.js")), true);
  assert.equal(isEsmHandler(path.join(cjs, "h.js")), false);
  assert.equal(isEsmHandler(path.join(cjs, "h.cjs")), false);
  assert.equal(isEsmHandler(path.join(cjs, "h.mjs")), true);
});
