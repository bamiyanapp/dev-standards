"use strict";

const fs = require("node:fs");

// issue #1086。放置検知（dependency-staleness-info.js、issue #1076）・OpenSSF
// Scorecard確認（dependency-scorecard-info.js、issue #1077）は、閾値に該当した
// パッケージのみがclassifyStaleRisk()のreasonsに出力され、該当が無い場合は
// Risk Summaryコメントに何も表示されなかった。これにより、実際の依存更新PRで
// この機能が動作したのかどうかが、コメントを見ても分からないという問題があった。
//
// issue #1152: 上記の意図（チェックが実際に動いたことを示す）を保ったまま、
// 対象パッケージ全件を無条件に列挙する方式はやめた。実際の依存更新PR
// （karuta#1860、273件）で該当（flagged: true）がほぼ無いにもかかわらず
// 延々と表で列挙され、本来注目すべき該当行が埋もれる問題があったため。
// 該当（flagged: true）が1件も無い場合は件数のみの要約1行に留め、該当が
// あれば該当行のみを問題が大きい順（放置検知は経過日数の降順、Scorecardは
// スコアの昇順）で列挙する

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
    const flagged = stalenessInfo.filter((s) => s.flagged).sort((a, b) => b.ageDays - a.ageDays);
    body += "**放置検知**（最終リリース日、[#1076](https://github.com/bamiyanapp/dev-standards/issues/1076)）\n\n";
    if (flagged.length === 0) {
      body += `${stalenessInfo.length}件を確認し、放置の疑いはありませんでした。\n\n`;
    } else {
      body += `${stalenessInfo.length}件中${flagged.length}件で放置の疑いがあります（経過日数が長い順）。\n\n`;
      body += "| パッケージ | 最終リリース日 | 経過日数 |\n|---|---|---|\n";
      for (const s of flagged) {
        body += `| ${s.name} | ${s.lastPublishedAt} | ${s.ageDays}日 |\n`;
      }
      body += "\n";
    }
  }

  if (scorecardInfo.length > 0) {
    const flagged = scorecardInfo.filter((s) => s.flagged).sort((a, b) => a.score - b.score);
    body += "**OpenSSF Scorecard**（[#1077](https://github.com/bamiyanapp/dev-standards/issues/1077)）\n\n";
    if (flagged.length === 0) {
      body += `${scorecardInfo.length}件を確認し、低スコアはありませんでした。\n\n`;
    } else {
      body += `${scorecardInfo.length}件中${flagged.length}件が低スコアです（スコアが低い順）。\n\n`;
      body += "| パッケージ | リポジトリ | スコア（10点満点） |\n|---|---|---|\n";
      for (const s of flagged) {
        body += `| ${s.name} | ${s.owner}/${s.repo} | ${s.score} |\n`;
      }
      body += "\n";
    }
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
