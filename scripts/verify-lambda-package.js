"use strict";

// serverlessが生成したデプロイzipを展開し、各ハンドラを実際に読み込めるかを検証する（issue #1452）。
// serverless packageは、symlink先の欠落やpackage.patternsの誤りでファイルが抜けていても成功する。
// その場合、デプロイ後に全関数がCannot find moduleで起動に失敗する（uchi-stock#715）。
//
// 検証内容:
//   1. serverless.ymlのfunctions配下のhandler（<ファイル>.<関数名>）ごとに、ファイルがzipにあり、
//      読み込めて、関数がexportされている
//   2. --forbidに一致するファイル（例: *.test.js、seed*.js）がzipに含まれていない
//   3. CommonJSのハンドラは、Lambdaと同じ読み込み規則で読み込む（dev-standards#1485）。
//      Lambdaのマネージドランタイム（Node 22・24）は、require(esm)が既定で無効である。CIのNode.js（22.12以上）は
//      既定で有効なため、ESM専用の依存（firebase-admin 14 → jwks-rsa → jose 6等）を持つ更新が、CIでは通り、
//      Lambdaでは全関数がERR_REQUIRE_ESMで起動に失敗する。このため、子プロセスで
//      NODE_OPTIONS=--no-experimental-require-moduleを付けて読み込む。serverless.ymlの
//      provider.environment.NODE_OPTIONSに--experimental-require-moduleがあれば、そのフラグを付ける
//      （Lambdaの実行環境を再現する）。--allow-require-esmで、この再現を止められる
//
// 使い方: node verify-lambda-package.js --zip <zip> --service-file <serverless.yml> [--forbid <glob>...] [--allow-require-esm]
// ハンドラを読み込むと、モジュール内の初期化コードが走る。必要な環境変数は呼び出し側がenvで渡す。

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const { execFileSync } = require("node:child_process");

const EXTENSIONS = [".js", ".cjs", ".mjs"];

// serverless.ymlのhandler指定を列挙する。CloudFormationのタグ（!Ref等）があっても読めるよう、行単位で拾う
function listHandlers(serviceYaml) {
  const handlers = [];
  for (const line of serviceYaml.split("\n")) {
    const m = line.match(/^\s+handler:\s*["']?([^\s"'#]+)/);
    if (m) handlers.push(m[1]);
  }
  return [...new Set(handlers)];
}

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
  return new RegExp(`(^|/)${escaped}$`);
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.name === "node_modules") return [];
    return e.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
  });
}

// serverless.ymlのprovider.environment.NODE_OPTIONSの値を返す（無ければ空文字列）
function readNodeOptions(serviceYaml) {
  const m = serviceYaml.match(/^\s+NODE_OPTIONS:\s*["']?([^"'#\n]*?)["']?\s*(?:#.*)?$/m);
  return m ? m[1].trim() : "";
}

// Lambdaが読み込む環境のNODE_OPTIONS。--experimental-require-moduleを、serverless.ymlで有効にしていれば付ける
function lambdaNodeOptions(serviceYaml) {
  return readNodeOptions(serviceYaml).includes("--experimental-require-module") ? "--experimental-require-module" : "--no-experimental-require-module";
}

// ESMのハンドラ（.mjs、または直近のpackage.jsonがtype: module）は、Lambdaもimport()で読み込む
function isEsmHandler(file) {
  if (file.endsWith(".mjs")) return true;
  if (file.endsWith(".cjs")) return false;
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        return JSON.parse(fs.readFileSync(pkg, "utf8")).type === "module";
      } catch {
        return false;
      }
    }
  }
  return false;
}

// 子プロセスで、Lambdaと同じrequire(esm)の設定でrequireし、exportの型を返す
function loadInLambdaEnvironment(file, exportName, nodeOptions, cwd) {
  const script = "const m = require(process.argv[1]); process.stdout.write(typeof m[process.argv[2]]);";
  const env = { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, nodeOptions].filter(Boolean).join(" ") };
  try {
    return { type: execFileSync(process.execPath, ["-e", script, file, exportName], { cwd, env, stdio: ["ignore", "pipe", "pipe"] }).toString() };
  } catch (error) {
    const stderr = String(error.stderr || "");
    // 古いNode.jsは、--no-experimental-require-moduleを知らない。再現できないため、この検証を諦める
    if (/bad option/.test(stderr)) return { unsupported: true };
    const code = (stderr.match(/code: '([A-Z_]+)'/) || [])[1];
    const first = stderr.split("\n").find((line) => /Error/.test(line)) || stderr.split("\n")[0];
    return { error: `${code || "Error"}: ${first.trim()}` };
  }
}

async function load(file) {
  try {
    return createRequire(file)(file);
  } catch (error) {
    if (error.code !== "ERR_REQUIRE_ESM" && error.code !== "ERR_REQUIRE_ASYNC_MODULE") throw error;
    return import(pathToFileURL(file).href);
  }
}

// 展開済みのディレクトリを検証し、問題の一覧（文字列）を返す
async function verifyDirectory(dir, serviceYaml, forbid = [], { allowRequireEsm = false } = {}) {
  const problems = [];
  const handlers = listHandlers(serviceYaml);
  if (handlers.length === 0) problems.push("serverless.ymlにhandlerが見つかりません");

  for (const handler of handlers) {
    const dot = handler.lastIndexOf(".");
    const fileBase = handler.slice(0, dot);
    const exportName = handler.slice(dot + 1);
    const file = EXTENSIONS.map((ext) => path.join(dir, fileBase + ext)).find((f) => fs.existsSync(f));
    if (!file) {
      problems.push(`${handler}: ファイル ${fileBase}(.js|.cjs|.mjs) がパッケージにありません`);
      continue;
    }
    if (!allowRequireEsm && !isEsmHandler(file)) {
      const result = loadInLambdaEnvironment(file, exportName, lambdaNodeOptions(serviceYaml), dir);
      if (result.error) problems.push(`${handler}: Lambdaと同じ読み込み規則（require(esm)が無効）で、読み込みに失敗しました（${result.error}）`);
      else if (!result.unsupported && result.type !== "function") problems.push(`${handler}: ${exportName} が関数としてexportされていません`);
      if (!result.unsupported) continue;
    }
    try {
      const mod = await load(file);
      if (typeof mod[exportName] !== "function") problems.push(`${handler}: ${exportName} が関数としてexportされていません`);
    } catch (error) {
      problems.push(`${handler}: 読み込みに失敗しました（${error.code || error.name}: ${String(error.message).split("\n")[0]}）`);
    }
  }

  const patterns = forbid.map(globToRegExp);
  for (const file of listFiles(dir)) {
    if (patterns.some((re) => re.test(file))) problems.push(`禁止されたファイルがパッケージに含まれています: ${file}`);
  }
  return problems;
}

function parseArgs(argv) {
  const args = { forbid: [], allowRequireEsm: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--zip") args.zip = argv[++i];
    else if (argv[i] === "--service-file") args.serviceFile = argv[++i];
    else if (argv[i] === "--forbid") args.forbid.push(argv[++i]);
    else if (argv[i] === "--allow-require-esm") args.allowRequireEsm = true;
  }
  return args;
}

async function main(argv) {
  const { zip, serviceFile, forbid, allowRequireEsm } = parseArgs(argv);
  if (!zip || !serviceFile) {
    console.error("使い方: node verify-lambda-package.js --zip <zip> --service-file <serverless.yml> [--forbid <glob>...] [--allow-require-esm]");
    return 2;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lambda-package-"));
  try {
    execFileSync("unzip", ["-q", zip, "-d", dir]);
    const problems = await verifyDirectory(dir, fs.readFileSync(serviceFile, "utf8"), forbid, { allowRequireEsm });
    if (problems.length === 0) {
      console.log("パッケージの検証に成功しました");
      return 0;
    }
    for (const p of problems) console.error(`::error::${p}`);
    return 1;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}

module.exports = { listHandlers, globToRegExp, verifyDirectory, readNodeOptions, lambdaNodeOptions, isEsmHandler };
