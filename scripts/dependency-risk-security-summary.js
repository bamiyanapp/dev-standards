"use strict";

const fs = require("node:fs");

// issue #646（OSS依存更新の自動安全判定基盤 Phase 1）Task H。
// dependency-vulnerability-info.js（Task C、OSV.devからのCVE/severity取得）と
// dependency-exploit-info.js（Task D、CISA KEV・FIRST EPSS取得）の出力を結合し、
// Risk Summaryコメントへ追記するセキュリティ情報セクションを生成する。
//
// 2つのスクリプトの出力を単純に結合するだけの整形ロジックであり、ネットワーク
// 呼び出しは行わない（呼び出し側のCIステップが各スクリプトを順に実行し、
// その結果ファイルをこのスクリプトへ渡す想定）。これにより、結合・整形ロジック
// 自体はfixtureデータで完全にユニットテストできる

// vulnerabilityInfo: dependency-vulnerability-info.jsの出力
//   [{ name, version, vulnerabilities: [{ id, cveIds, summary, severityRating, cvssVectors }] }]
// exploitInfo: dependency-exploit-info.jsの出力（cveIdsの一覧を渡して得られたもの）
//   [{ cveId, kev, epssScore, epssPercentile }]
//
// 戻り値: パッケージ・CVEごとの行データ。exploitInfoに対応するエントリが無い
// CVE（dependency-exploit-info.js呼び出し自体が失敗した場合等）はkev: null・
// epssScore: nullとして扱う（「既知の悪用は無い」と誤って伝えないため、
// false/0ではなくnullで「不明」を表す）
function buildSecurityRows(vulnerabilityInfo, exploitInfo) {
  const exploitByCve = new Map(exploitInfo.map((e) => [e.cveId, e]));
  const rows = [];
  for (const pkg of vulnerabilityInfo) {
    for (const vuln of pkg.vulnerabilities) {
      const cveIds = vuln.cveIds.length > 0 ? vuln.cveIds : [null];
      for (const cveId of cveIds) {
        const exploit = cveId ? exploitByCve.get(cveId) : undefined;
        rows.push({
          package: pkg.name,
          id: vuln.id,
          cveId,
          severityRating: vuln.severityRating,
          kev: exploit ? exploit.kev : null,
          epssScore: exploit ? exploit.epssScore : null,
        });
      }
    }
  }
  return rows;
}

function formatEpss(epssScore) {
  if (epssScore == null) return "不明";
  return `${epssScore.toFixed(3)}（上位${(100 - epssScore * 100).toFixed(1)}%ile相当）`;
}

function formatKev(kev) {
  if (kev === true) return "⚠️ 該当";
  if (kev === false) return "該当なし";
  return "不明";
}

// buildSecurityRowsの結果をRisk Summaryコメントへ追記するMarkdown断片へ整形する。
// 脆弱性が1件も無い場合は、調査不要であることが伝わる短い文のみを返す
function renderSecuritySection(vulnerabilityInfo, exploitInfo) {
  const rows = buildSecurityRows(vulnerabilityInfo, exploitInfo);
  if (rows.length === 0) {
    return "### Security（CVE/CVSS/EPSS/KEV）\n\n既知の脆弱性は見つかりませんでした（[OSV.dev](https://osv.dev)で確認）。\n";
  }

  let body = "### Security（CVE/CVSS/EPSS/KEV）\n\n";
  body += "| パッケージ | CVE | Severity | KEV | EPSS |\n|---|---|---|---|---|\n";
  for (const row of rows) {
    body += `| ${row.package} | ${row.cveId ?? row.id} | ${row.severityRating ?? "不明"} | ${formatKev(row.kev)} | ${formatEpss(row.epssScore)} |\n`;
  }
  if (rows.some((r) => r.kev === true)) {
    body += "\n⚠️ KEV（Known Exploited Vulnerability、実際に悪用が確認されている脆弱性）に該当するものがあります。優先的に確認してください。\n";
  }
  return body;
}

function main() {
  const [, , vulnerabilityInfoPath, exploitInfoPath] = process.argv;
  if (!vulnerabilityInfoPath || !exploitInfoPath) {
    console.error("Usage: node dependency-risk-security-summary.js <dependency-vulnerability-info.json> <dependency-exploit-info.json>");
    process.exitCode = 1;
    return;
  }
  const vulnerabilityInfo = JSON.parse(fs.readFileSync(vulnerabilityInfoPath, "utf-8"));
  const exploitInfo = JSON.parse(fs.readFileSync(exploitInfoPath, "utf-8"));
  console.log(renderSecuritySection(vulnerabilityInfo, exploitInfo));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSecurityRows,
  renderSecuritySection,
};
