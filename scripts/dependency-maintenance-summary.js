"use strict";

const fs = require("node:fs");

// issue #1086。放置検知（dependency-staleness-info.js、issue #1076）・OpenSSF
// Scorecard確認（dependency-scorecard-info.js、issue #1077）は、閾値に該当した
// パッケージのみがclassifyStaleRisk()のreasonsに出力され、該当が無い場合は
// Risk Summaryコメントに何も表示されなかった。これにより、実際の依存更新PRで
// この機能が動作したのかどうかが、コメントを見ても分からないという問題があった。
//
// dependency-risk-security-summary.js（Security セクション）と同じ設計で、
// チェック対象になった全パッケージの実測値（経過日数・Scorecardスコア）と
// 判定結果（flagged）を、結果の有無に関わらず常に一覧表示する

// stalenessInfo: dependency-staleness-info.jsの出力（flagged該当・非該当の両方を含む）
// scorecardInfo: dependency-scorecard-info.jsの出力（同上）
// 戻り値: Risk Summaryコメントへ追記するMarkdown断片。両方が空の場合は
// 「対象パッケージはありませんでした」の短い文のみを返す
function renderMaintenanceSection(stalenessInfo, scorecardInfo) {
  let body = "### メンテナンス状態（放置検知・Scorecard確認）\n\n";

  if (stalenessInfo.length === 0 && scorecardInfo.length === 0) {
    return body + "対象パッケージはありませんでした（`package-lock.json`の変更が無い、またはnpm registryから情報を取得できませんでした）。\n";
  }

  if (stalenessInfo.length > 0) {
    body += "**放置検知**（最終リリース日、[#1076](https://github.com/bamiyanapp/dev-standards/issues/1076)）\n\n";
    body += "| パッケージ | 最終リリース日 | 経過日数 | 判定 |\n|---|---|---|---|\n";
    for (const s of stalenessInfo) {
      const mark = s.flagged ? "⚠️ 放置の疑いあり" : "問題なし";
      body += `| ${s.name} | ${s.lastPublishedAt} | ${s.ageDays}日 | ${mark} |\n`;
    }
    body += "\n";
  }

  if (scorecardInfo.length > 0) {
    body += "**OpenSSF Scorecard**（[#1077](https://github.com/bamiyanapp/dev-standards/issues/1077)）\n\n";
    body += "| パッケージ | リポジトリ | スコア（10点満点） | 判定 |\n|---|---|---|---|\n";
    for (const s of scorecardInfo) {
      const mark = s.flagged ? "⚠️ 低スコア" : "問題なし";
      body += `| ${s.name} | ${s.owner}/${s.repo} | ${s.score} | ${mark} |\n`;
    }
    body += "\n";
  }

  return body;
}

function main() {
  const [, , stalenessInfoPath, scorecardInfoPath] = process.argv;
  if (!stalenessInfoPath || !scorecardInfoPath) {
    console.error("Usage: node dependency-maintenance-summary.js <staleness-info.json> <scorecard-info.json>");
    process.exitCode = 1;
    return;
  }
  const stalenessInfo = JSON.parse(fs.readFileSync(stalenessInfoPath, "utf-8"));
  const scorecardInfo = JSON.parse(fs.readFileSync(scorecardInfoPath, "utf-8"));
  console.log(renderMaintenanceSection(stalenessInfo, scorecardInfo));
}

if (require.main === module) {
  main();
}

module.exports = {
  renderMaintenanceSection,
};
