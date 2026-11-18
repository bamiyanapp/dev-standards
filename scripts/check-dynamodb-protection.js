"use strict";

// serverless.yml・SAMテンプレートの AWS::DynamoDB::Table を列挙し、データ保護の設定が
// あるかを検査する（issue #1402）。検査項目は4つ。
//   1. PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled が true
//   2. DeletionProtectionEnabled が true
//   3. DeletionPolicy が Retain
//   4. UpdateReplacePolicy が Retain
// 次のテーブルは対象外にする。
//   - TimeToLiveSpecification が有効なテーブル（一時データとみなす）
//   - Metadata.DevStandardsProtectionExempt に理由（空でない文字列）を書いたテーブル。
//     理由の無い除外は認めない（空文字・true等は違反として扱う）
// AWS::Serverless::SimpleTable は保護設定の一部を指定できないため、検査せず一覧にだけ出す。
// !Ref・!GetAtt等のCloudFormationタグは解決しない。構造が読めればよい。
// Serverless Frameworkの変数（${self:...}）も解決しない。
//
// 使い方: node check-dynamodb-protection.js <warn|fail> <ファイル>...
// warn: 違反があっても終了コード0（::warningを出す）。fail: 違反があれば終了コード1。
// js-yamlは呼び出し側が用意する（NODE_PATHで解決する）。

const fs = require("node:fs");

const CFN_TAGS = [
  "Ref", "GetAtt", "Sub", "Join", "Select", "Split", "If", "Equals", "Not", "And", "Or",
  "FindInMap", "Base64", "Cidr", "ImportValue", "GetAZs", "Condition", "Transform", "Length",
  "ToJsonString", "ForEach",
];

// js-yamlは呼び出し側が用意するため、v4とv5の両方で動くようにする（issue #1468）。
// v4は`yaml.Type`と`DEFAULT_SCHEMA.extend`、v5は`defineScalarTag`等のタグ定義APIと
// `Schema.withTags`でカスタムタグを追加する（v5で`Type`が削除された）。
// どちらも、`!Ref`等のタグを`{ "!Ref": 値 }`の形で読めるスキーマを返す
function buildSchema(yaml) {
  if (typeof yaml.Type === "function") {
    const types = [];
    for (const tag of CFN_TAGS) {
      for (const kind of ["scalar", "sequence", "mapping"]) {
        types.push(new yaml.Type(`!${tag}`, { kind, construct: (data) => ({ [`!${tag}`]: data }) }));
      }
    }
    return yaml.DEFAULT_SCHEMA.extend(types);
  }
  const tags = [];
  for (const tag of CFN_TAGS) {
    const name = `!${tag}`;
    // 読み込み専用のため、identifyは常にfalse（dumpには使わない）
    tags.push(
      yaml.defineScalarTag(name, { resolve: (source) => ({ [name]: source }), identify: () => false }),
      yaml.defineSequenceTag(name, {
        create: () => [],
        addItem: (carrier, item) => {
          carrier.push(item);
        },
        finalize: (carrier) => ({ [name]: carrier }),
        identify: () => false,
      }),
      yaml.defineMappingTag(name, {
        create: () => new Map(),
        addPair: (carrier, key, value) => {
          carrier.set(key, value);
          return "";
        },
        has: (carrier, key) => carrier.has(key),
        keys: (result) => Object.keys(result[name]),
        get: (result, key) => result[name][key],
        finalize: (carrier) => ({ [name]: Object.fromEntries(carrier) }),
        identify: () => false,
      }),
    );
  }
  return yaml.CORE_SCHEMA.withTags(tags);
}

const isTrue = (v) => v === true || v === "true";

function isTtlEnabled(props) {
  return isTrue(props?.TimeToLiveSpecification?.Enabled);
}

// 文書中の全てのリソース定義（Type: ...を持つオブジェクト）を、論理名つきで列挙する
function collectResources(node, name = "", out = []) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectResources(n, name, out));
  } else if (node && typeof node === "object") {
    if (typeof node.Type === "string" && node.Type.startsWith("AWS::")) out.push({ name, resource: node });
    for (const [key, value] of Object.entries(node)) collectResources(value, key, out);
  }
  return out;
}

// 戻り値: { violations: [{ file, name, problems: [] }], simpleTables: [name], checked: n, exempt: n }
function check(doc, file) {
  const result = { violations: [], simpleTables: [], checked: 0, exempt: 0 };
  for (const { name, resource } of collectResources(doc)) {
    if (resource.Type === "AWS::Serverless::SimpleTable") {
      result.simpleTables.push(name);
      continue;
    }
    if (resource.Type !== "AWS::DynamoDB::Table") continue;
    const props = resource.Properties || {};
    const problems = [];
    const exemptReason = resource.Metadata?.DevStandardsProtectionExempt;
    if (exemptReason !== undefined) {
      if (typeof exemptReason === "string" && exemptReason.trim() !== "") {
        result.exempt++;
        continue;
      }
      problems.push("DevStandardsProtectionExemptに理由（空でない文字列）が必要");
    } else if (isTtlEnabled(props)) {
      result.exempt++;
      continue;
    }
    result.checked++;
    if (!isTrue(props.PointInTimeRecoverySpecification?.PointInTimeRecoveryEnabled)) problems.push("PointInTimeRecoveryEnabledがtrueでない");
    if (!isTrue(props.DeletionProtectionEnabled)) problems.push("DeletionProtectionEnabledがtrueでない");
    if (resource.DeletionPolicy !== "Retain") problems.push("DeletionPolicyがRetainでない");
    if (resource.UpdateReplacePolicy !== "Retain") problems.push("UpdateReplacePolicyがRetainでない");
    if (problems.length > 0) result.violations.push({ file, name, problems });
  }
  return result;
}

function main() {
  const [mode, ...files] = process.argv.slice(2);
  if (!["warn", "fail"].includes(mode) || files.length === 0) {
    console.error("使い方: check-dynamodb-protection.js <warn|fail> <ファイル>...");
    process.exit(2);
  }
  const yaml = require("js-yaml");
  const schema = buildSchema(yaml);
  const total = { violations: [], simpleTables: [], checked: 0, exempt: 0 };
  const missing = [];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      missing.push(file);
      continue;
    }
    const r = check(yaml.load(fs.readFileSync(file, "utf8"), { schema }), file);
    total.violations.push(...r.violations);
    total.simpleTables.push(...r.simpleTables);
    total.checked += r.checked;
    total.exempt += r.exempt;
  }
  console.log(`検査したテーブル: ${total.checked}件、対象外: ${total.exempt}件`);
  if (missing.length > 0) console.log(`存在しないファイル（対象外）: ${missing.join("、")}`);
  if (total.simpleTables.length > 0) console.log(`AWS::Serverless::SimpleTable（保護設定を指定できないため未検査）: ${total.simpleTables.join("、")}`);
  if (total.violations.length === 0) {
    console.log("データ保護の設定に問題は見つかりませんでした。");
    return;
  }
  for (const v of total.violations) {
    console.log(`- ${v.file} ${v.name}: ${v.problems.join(" / ")}`);
    if (mode === "warn") console.log(`::warning file=${v.file}::${v.name}: ${v.problems.join(" / ")}`);
  }
  if (mode === "fail") process.exit(1);
  console.log("警告のみ（失敗にはしません）。是正後に、modeをfailへ切り替えてください。");
}

if (require.main === module) main();

module.exports = { check, buildSchema, collectResources };
