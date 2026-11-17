"use strict";

// serverless.yml・SAMテンプレートの AWS::CloudFront::Distribution を列挙し、セキュリティヘッダーを付ける
// ResponseHeadersPolicyId（docs/security-headers-pattern.md）が関連付けられているかを検査する
// （issue #1407 段階3）。DefaultCacheBehaviorと、CacheBehaviorsの各要素が対象。
// 関連付けが無い場合は、CSPなどのヘッダーが付かないまま配信される。
//
// 除外: リソースのMetadata.DevStandardsSecurityHeadersExemptへ、理由（空でない文字列）を書く。
// 理由の無い除外は、違反として扱う。
// !Ref・!GetAtt等のタグと、Serverless Frameworkの変数（${self:...}）は、解決しない。
//
// 使い方: node check-security-headers.js <warn|fail> <ファイル>...
// js-yamlは呼び出し側が用意する（NODE_PATHで解決する）。

const fs = require("node:fs");
const { buildSchema, collectResources } = require("./check-dynamodb-protection.js");

function check(doc, file) {
  const result = { violations: [], checked: 0, exempt: 0, distributions: 0 };
  for (const { name, resource } of collectResources(doc)) {
    if (resource.Type !== "AWS::CloudFront::Distribution") continue;
    result.distributions++;
    const reason = resource.Metadata?.DevStandardsSecurityHeadersExempt;
    const problems = [];
    if (reason !== undefined) {
      if (typeof reason === "string" && reason.trim() !== "") {
        result.exempt++;
        continue;
      }
      problems.push("DevStandardsSecurityHeadersExemptに理由（空でない文字列）が必要");
    }
    result.checked++;
    const config = resource.Properties?.DistributionConfig || {};
    if (!config.DefaultCacheBehavior?.ResponseHeadersPolicyId) problems.push("DefaultCacheBehaviorにResponseHeadersPolicyIdが無い");
    (Array.isArray(config.CacheBehaviors) ? config.CacheBehaviors : []).forEach((b, i) => {
      if (!b?.ResponseHeadersPolicyId) problems.push(`CacheBehaviors[${i}]${b?.PathPattern ? `（${b.PathPattern}）` : ""}にResponseHeadersPolicyIdが無い`);
    });
    if (problems.length > 0) result.violations.push({ file, name, problems });
  }
  return result;
}

function main() {
  const [mode, ...files] = process.argv.slice(2);
  if (!["warn", "fail"].includes(mode) || files.length === 0) {
    console.error("使い方: check-security-headers.js <warn|fail> <ファイル>...");
    process.exit(2);
  }
  const yaml = require("js-yaml");
  const schema = buildSchema(yaml);
  const total = { violations: [], checked: 0, exempt: 0, distributions: 0 };
  const missing = [];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      missing.push(file);
      continue;
    }
    const r = check(yaml.load(fs.readFileSync(file, "utf8"), { schema }), file);
    total.violations.push(...r.violations);
    for (const k of ["checked", "exempt", "distributions"]) total[k] += r[k];
  }
  console.log(`CloudFrontディストリビューション: ${total.distributions}件（検査: ${total.checked}件、対象外: ${total.exempt}件）`);
  if (missing.length > 0) console.log(`存在しないファイル（対象外）: ${missing.join("、")}`);
  if (total.violations.length === 0) {
    console.log("セキュリティヘッダーの関連付けに、問題は見つかりませんでした。");
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

module.exports = { check };
