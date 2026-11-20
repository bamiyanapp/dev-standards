"use strict";

// 参照側のrenovate.jsonが、dev-standardsの共有プリセット（default.json）を継承しているかを警告する
// （issue #1370 対応4）。プリセットには、minimumReleaseAge・lockFileMaintenance・rebaseWhen・
// git-submodulesの有効化・stylelintのグループ化がある。継承していない参照側には、効かない。
//
// - 警告にとどめ、終了コードは常に0（ユーザー判断: 警告で始める）
// - Renovateの設定が無いリポジトリは、対象外にする（Renovateを使っていない）
// - 意図的に継承しない場合は、`.github/renovate-preset-opt-out.json`に、理由を書く
//     { "reason": "独自のpackageRulesで、同等の設定を持つため" }
//   理由が空のopt-outは、無効として警告する
// - `extends`の値は、`github>bamiyanapp/dev-standards`・`local>bamiyanapp/dev-standards`のどちらも認める。
//   `#タグ`・`:プリセット名`が付いていても、よい
//
// 使い方: node check-renovate-preset.js   （参照側のリポジトリのルートで実行）

const fs = require("node:fs");

const CONFIG_FILES = ["renovate.json", "renovate.json5", ".github/renovate.json", ".github/renovate.json5", ".gitlab/renovate.json", ".renovaterc", ".renovaterc.json"];
const OPT_OUT_FILE = ".github/renovate-preset-opt-out.json";
const PRESET = /^(?:github|local)>bamiyanapp\/dev-standards(?:[#:].*)?$/;

// JSON5のコメント・末尾カンマに、ゆるく対応する（Renovateの設定は、JSON5も認める）
function parseConfig(text) {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1")
    .replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(stripped);
}

// config: パース済みのRenovate設定。戻り値: true（継承している）
function extendsPreset(config) {
  const list = Array.isArray(config.extends) ? config.extends : [];
  return list.some((entry) => typeof entry === "string" && PRESET.test(entry.trim()));
}

// optOut: { reason }|null。戻り値: null（警告なし）または警告の文言
function evaluate(config, optOut) {
  if (extendsPreset(config)) return null;
  if (optOut && typeof optOut.reason === "string" && optOut.reason.trim() !== "") return null;
  if (optOut) return `${OPT_OUT_FILE}に、理由（reasonの、空でない文字列）を書いてください`;
  return `renovate.jsonが、dev-standardsの共有プリセットを継承していません。"extends"へ"github>bamiyanapp/dev-standards"を足してください。継承しない場合は、${OPT_OUT_FILE}に理由を書いてください（docs/cicd-pipeline-specification.md）`;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const file = CONFIG_FILES.find((f) => fs.existsSync(f));
  if (!file) {
    console.log("Renovateの設定ファイルが見つかりません。検査を、スキップします。");
    return;
  }
  let config;
  try {
    config = parseConfig(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.log(`::warning file=${file}::Renovateの設定を読めませんでした（${error.message}）。プリセットの継承を確認できません`);
    return;
  }
  const message = evaluate(config, readJson(OPT_OUT_FILE));
  if (message) console.log(`::warning file=${file}::${message}`);
  else console.log("Renovateは、dev-standardsの共有プリセットを継承しているか、理由つきで継承しないと明示されています。");
}

if (require.main === module) main();

module.exports = { parseConfig, extendsPreset, evaluate, OPT_OUT_FILE };
