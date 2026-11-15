"use strict";

// 環境変数（GitHub Secrets由来）から、Lambdaが読み込む設定ファイル（JSON）を生成する
// 汎用スクリプト（dev-standards#1379）。
//
// Lambda@Edgeは環境変数を使えないため、デプロイ時にシークレットをJSONファイルへ
// 書き出し、関数のコードに同梱する。examinationのbot-stack・site-stackが同じ処理を
// 別々に書いていたものを、キーの対応表を引数で受け取る形に汎用化した。
//
// 使い方（本番デプロイ時）:
//   node dev-standards/scripts/generate-config-from-env.js \
//     --out functions/configuration.json \
//     lineChannelSecret=LINE_CHANNEL_SECRET geminiApiKey=GEMINI_API_KEY
//   位置引数は`設定ファイルのキー=環境変数名`。1つでも環境変数が未設定（空文字列を含む）
//   なら、不足している環境変数名を全て列挙して異常終了する（部分的な設定のまま
//   デプロイされるのを防ぐ）。
//
// 使い方（テスト・CI時）:
//   ... --ensure-test [--dummy adminNotifyEmail=test-admin@example.com]
//   出力先が既に存在する場合は何もしない。存在しない場合のみ、実際のシークレットを
//   使わずダミー値で生成する（テストは外部呼び出し自体をモックするため実値は不要）。
//   ダミー値は既定で`test-<キーをケバブケースにしたもの>`。形式の制約があるキー
//   （メールアドレス等）は`--dummy キー=値`で上書きする。package.jsonのpretestから呼ぶ想定。
//
// 出力先のファイルはgitignore対象にすること（実際のシークレットが含まれるため）。
// 値はログに出力しない。

const fs = require("node:fs");
const path = require("node:path");

function parseKeyValue(arg, flagLabel) {
  const separatorIndex = arg.indexOf("=");
  if (separatorIndex <= 0 || separatorIndex === arg.length - 1) {
    throw new Error(`${flagLabel}は「キー=値」の形式で指定してください: ${arg}`);
  }
  return [arg.slice(0, separatorIndex), arg.slice(separatorIndex + 1)];
}

// 戻り値: { out, ensureTest, mappings: [{ key, envName }], dummies: { key: value } }
function parseArgs(argv) {
  const parsed = { out: null, ensureTest: false, mappings: [], dummies: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      i += 1;
      parsed.out = argv[i];
    } else if (arg === "--ensure-test") {
      parsed.ensureTest = true;
    } else if (arg === "--dummy") {
      i += 1;
      const [key, value] = parseKeyValue(argv[i] ?? "", "--dummy");
      parsed.dummies[key] = value;
    } else if (arg.startsWith("--")) {
      throw new Error(`不明なオプションです: ${arg}`);
    } else {
      const [key, envName] = parseKeyValue(arg, "位置引数");
      parsed.mappings.push({ key, envName });
    }
  }
  if (!parsed.out) {
    throw new Error("--out（出力先のファイルパス）を指定してください");
  }
  if (parsed.mappings.length === 0) {
    throw new Error("「キー=環境変数名」を1つ以上指定してください");
  }
  const keys = parsed.mappings.map((m) => m.key);
  const duplicated = keys.find((key, index) => keys.indexOf(key) !== index);
  if (duplicated) {
    throw new Error(`キーが重複しています: ${duplicated}`);
  }
  const unknownDummy = Object.keys(parsed.dummies).find((key) => !keys.includes(key));
  if (unknownDummy) {
    throw new Error(`--dummyに指定されたキーが位置引数にありません: ${unknownDummy}`);
  }
  return parsed;
}

// 戻り値: { config, missing }。missingは未設定（空文字列を含む）の環境変数名
function buildConfigFromEnv(mappings, env) {
  const config = {};
  const missing = [];
  for (const { key, envName } of mappings) {
    if (env[envName]) {
      config[key] = env[envName];
    } else {
      missing.push(envName);
    }
  }
  return { config, missing };
}

function toKebabCase(camelCase) {
  return camelCase.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function buildDummyConfig(mappings, dummies) {
  const config = {};
  for (const { key } of mappings) {
    config[key] = dummies[key] ?? `test-${toKebabCase(key)}`;
  }
  return config;
}

function writeConfig(outPath, config, fileSystem) {
  fileSystem.mkdirSync(path.dirname(outPath), { recursive: true });
  fileSystem.writeFileSync(outPath, JSON.stringify(config, null, 2));
}

// 戻り値: 終了コード。fileSystem・env・logはテストで差し替える
function run({ argv, env = process.env, fileSystem = fs, log = console.log }) {
  const { out, ensureTest, mappings, dummies } = parseArgs(argv);

  if (ensureTest) {
    if (fileSystem.existsSync(out)) {
      return 0;
    }
    writeConfig(out, buildDummyConfig(mappings, dummies), fileSystem);
    log(`Wrote dummy ${out} for tests`);
    return 0;
  }

  const { config, missing } = buildConfigFromEnv(mappings, env);
  if (missing.length > 0) {
    throw new Error(`環境変数が設定されていません: ${missing.join(", ")}`);
  }
  writeConfig(out, config, fileSystem);
  log(`Wrote ${out}`);
  return 0;
}

function main() {
  try {
    process.exitCode = run({ argv: process.argv.slice(2) });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, buildConfigFromEnv, buildDummyConfig, toKebabCase, run };
