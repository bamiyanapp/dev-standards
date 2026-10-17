"use strict";

const fs = require("node:fs");

// issue #982。`lhci autorun`の標準出力はそのままだと英語の生ログであり、
// ヘルスチェック・ビルドログ・Lighthouse実行結果・assertion結果が混在するため、
// どこが成功・失敗でどこが単なる警告かをスマートフォンのPR画面で一目で把握しづらい。
// 標準出力のテキスト解析のみで（スコア数値自体は対象外、検討事項として将来拡張）
// 日本語の要約を組み立てる。lhciのバージョン依存でフォーマットが変わり得るため、
// 想定した行が見つからない場合はその項目を「不明」として扱い、パース全体を
// 失敗させない（安全側）

// ログ全体から全体の成否を判定する。`Assertion failed`があれば失敗、
// 無く`Done running autorun.`があれば成功、どちらも無ければ不明（null）とする
function detectOverallSuccess(log) {
  if (/Assertion failed/.test(log)) return false;
  if (/Done running autorun\.?/.test(log)) return true;
  return null;
}

// ヘルスチェック（`✅`/`⚠️`/`✘`で始まる行）を集計する
function parseHealthcheck(log) {
  const lines = log.split("\n").filter((l) => /^(✅|⚠️|✘)/.test(l.trim()));
  if (lines.length === 0) return null;
  const failed = lines.filter((l) => l.trim().startsWith("✘"));
  const warned = lines.filter((l) => l.trim().startsWith("⚠️"));
  return { total: lines.length, failed: failed.length, warned: warned.length };
}

// サーバー起動を検知する。タイムアウト警告が出ていても、その後に実際の
// `Local:`行（vite preview等のURL表示）が見つかれば起動成功とみなす
function detectServerStarted(log) {
  const timedOut = /Timed out waiting for the server to start listening/.test(log);
  const started = /Local:\s*http/.test(log);
  if (started) return { started: true, timedOutWarningOnly: timedOut };
  if (timedOut) return { started: false, timedOutWarningOnly: false };
  return { started: null, timedOutWarningOnly: false };
}

// `Running Lighthouse N time(s) on <URL>`を抽出する
function parseRunCount(log) {
  const match = log.match(/Running Lighthouse (\d+) time\(s\) on (\S+)/);
  if (!match) return null;
  return { count: Number(match[1]), url: match[2] };
}

// assertion失敗行（`✘`で始まる行のうち、ヘルスチェック行を除いたもの）を集める。
// ヘルスチェック自体の失敗と区別するため、`Checking assertions`以降のみを対象にする
function parseAssertionFailures(log) {
  const idx = log.indexOf("Checking assertions");
  if (idx === -1) return [];
  const assertionSection = log.slice(idx);
  return assertionSection
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("✘"));
}

// 以上の個別パース結果から、日本語の要約Markdownを組み立てる。
// いずれの項目も「取得できなかった場合は不明として明記する」方針とし、
// 解釈に失敗したことを隠さない
function summarizeLighthouseCiLog(log) {
  const overallSuccess = detectOverallSuccess(log);
  const healthcheck = parseHealthcheck(log);
  const server = detectServerStarted(log);
  const runCount = parseRunCount(log);
  const assertionFailures = parseAssertionFailures(log);

  const lines = [];
  lines.push(
    overallSuccess === true
      ? "✅ Lighthouse CIは正常に完了しました。"
      : overallSuccess === false
        ? "❌ Lighthouse CIでassertion（スコアしきい値等）の失敗を検知しました。"
        : "⚠️ Lighthouse CIの実行結果を判定できませんでした（想定外の出力形式）。",
  );
  lines.push("");

  if (healthcheck) {
    lines.push(
      healthcheck.failed > 0
        ? `- ヘルスチェック: ${healthcheck.failed}件失敗（実行環境の設定を確認してください）`
        : healthcheck.warned > 0
          ? `- ヘルスチェック: 通過（${healthcheck.warned}件の警告あり）`
          : "- ヘルスチェック: 通過",
    );
  } else {
    lines.push("- ヘルスチェック: 不明（結果を読み取れませんでした）");
  }

  if (server.started === true) {
    lines.push(
      server.timedOutWarningOnly
        ? "- 計測対象サーバー: 起動成功（起動完了の検知が一瞬遅れた警告が出ていますが、実害はありません）"
        : "- 計測対象サーバー: 起動成功",
    );
  } else if (server.started === false) {
    lines.push("- 計測対象サーバー: 起動失敗（タイムアウト）");
  } else {
    lines.push("- 計測対象サーバー: 不明（起動ログを読み取れませんでした）");
  }

  if (runCount) {
    lines.push(`- Lighthouse実行回数: ${runCount.count}回（対象: ${runCount.url}）`);
  } else {
    lines.push("- Lighthouse実行回数: 不明");
  }

  if (assertionFailures.length > 0) {
    lines.push(`- assertion失敗項目（${assertionFailures.length}件）:`);
    for (const failure of assertionFailures) {
      lines.push(`  - ${failure}`);
    }
  } else if (overallSuccess === true) {
    lines.push("- assertion: 全て通過");
  }

  return { overallSuccess, markdown: lines.join("\n") };
}

function main() {
  const [, , logPath] = process.argv;
  if (!logPath) {
    console.error("Usage: node lighthouse-ci-summary.js <lhci-stdout.log>");
    process.exitCode = 1;
    return;
  }
  const log = fs.readFileSync(logPath, "utf-8");
  const { markdown } = summarizeLighthouseCiLog(log);
  console.log(markdown);
}

if (require.main === module) {
  main();
}

module.exports = {
  summarizeLighthouseCiLog,
  detectOverallSuccess,
  parseHealthcheck,
  detectServerStarted,
  parseRunCount,
  parseAssertionFailures,
};
