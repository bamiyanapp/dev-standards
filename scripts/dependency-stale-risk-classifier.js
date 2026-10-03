"use strict";

const fs = require("node:fs");
const { escalate } = require("./dependency-risk-classifier.js");
const { buildSecurityRows } = require("./dependency-risk-security-summary.js");

// issue #690。dependency-risk-classifier.js（classifyRisk）が測定する「適用リスク」
// （このPRを適用すること自体の危険度）とは別の軸として、「このPRを適用せず現行
// （更新前）バージョンに留まった場合の危険度」（維持リスク）を判定する。
// vulnerabilityInfo/exploitInfoは、呼び出し側がdependency-vulnerability-info.js・
// dependency-exploit-info.jsをoldVersion（更新前バージョン）向けに実行した結果を渡す
// 前提（classifyRiskのnewVersion向け結果とは別のデータ）。
//
// 情報が不明な場合（securityDataAvailable: false）に高・中へ倒すと、「分からないから
// 安全側に倒して自動マージ対象を広げてしまう」という本末転倒な結果になる
// （classifyRiskとは逆方向の安全側）。そのため不明時は必ず低へフォールバックする
//
// blastRadiusImpact（issue #701）: 業務影響度（ブラスト半径）。CVE/KEVの深刻度（脆弱性
// そのものの危険度）とは別に、実際に悪用された場合の被害の広さを加味する。ただし
// highへの昇格は既知のCVE/KEV（上記）のみを根拠とする設計を維持するため、ブラスト半径
// による昇格はlow→mediumのみに限定する（medium→highは行わない）。これは、維持リスクが
// highになると「適用リスクHighの理由がCVE/KEV残存のみの場合、自動マージの上書きを許す」
// （issue #700）ため、ブラスト半径単独でhighへ昇格できると、実際の脆弱性の深刻度が不明・
// 低いままでも業務影響度だけを理由に上書きが発動してしまうことを防ぐため
function classifyStaleRisk({ oldVulnerabilityInfo = [], oldExploitInfo = [], securityDataAvailable, blastRadiusImpact = false }) {
  let level = "low";
  const reasons = [];

  if (!securityDataAvailable) {
    reasons.push("現行バージョンの脆弱性情報の取得に失敗したため不明です（安全側として低扱いとし、自動マージの対象拡大には使いません）");
  } else {
    const securityRows = buildSecurityRows(oldVulnerabilityInfo, oldExploitInfo);
    const hasKev = securityRows.some((r) => r.kev === true);
    if (hasKev) {
      level = escalate(level, "high");
      reasons.push("現行バージョンにKEV（Known Exploited Vulnerability）該当の脆弱性があり、放置のリスクが高いです");
    }
    const hasCriticalOrHighCve = securityRows.some((r) => r.severityRating === "CRITICAL" || r.severityRating === "HIGH");
    if (hasCriticalOrHighCve && !hasKev) {
      level = escalate(level, "medium");
      reasons.push("現行バージョンにCritical/High severityのCVEが残っています");
    }
  }

  if (blastRadiusImpact) {
    if (level === "low") {
      level = "medium";
      reasons.push("変更された直接依存が重要パス（宣言済み）からimportされているため、維持リスクをlowからmediumへ1段階昇格しました");
    } else {
      reasons.push(
        "変更された直接依存が重要パス（宣言済み）からimportされていますが、維持リスクのhighへの昇格は既知のCVE/KEVのみを根拠とするため追加の昇格はありません",
      );
    }
  }

  if (reasons.length === 0) {
    reasons.push("現行バージョンに既知の脆弱性は見つかりませんでした");
  }

  return { level, reasons };
}

function readJsonFileIfExists(path) {
  if (!path || !fs.existsSync(path)) return null;
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

function main() {
  const [, , oldVulnerabilityInfoPath, oldExploitInfoPath, blastRadiusInfoPath] = process.argv;
  if (!oldVulnerabilityInfoPath) {
    console.error(
      "Usage: node dependency-stale-risk-classifier.js <old-vulnerability-info.json> [old-exploit-info.json] [blast-radius-info.json]",
    );
    process.exitCode = 1;
    return;
  }

  const oldVulnerabilityInfo = readJsonFileIfExists(oldVulnerabilityInfoPath);
  const oldExploitInfo = readJsonFileIfExists(oldExploitInfoPath);
  const securityDataAvailable = oldVulnerabilityInfo != null && oldExploitInfo != null;
  const blastRadiusInfo = readJsonFileIfExists(blastRadiusInfoPath);

  const result = classifyStaleRisk({
    oldVulnerabilityInfo: oldVulnerabilityInfo ?? [],
    oldExploitInfo: oldExploitInfo ?? [],
    securityDataAvailable,
    blastRadiusImpact: blastRadiusInfo?.hasCriticalPathImpact ?? false,
  });

  console.log(JSON.stringify(result, null, 2));

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `level=${result.level}\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  classifyStaleRisk,
};
