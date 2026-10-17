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

// サーバー起動を検知する。`lhci autorun`は、起動待機がタイムアウトせず
// 成功した場合、診断用の「Server Output:」ブロック自体を標準出力へ
// ダンプしない（タイムアウト発生時のみ出力される仕様）。そのため
// タイムアウトしなかった正常系では`Local`という文字列自体がログに
// 一切現れず、`Local`の有無だけでは判定できない（dev-standards#1022）。
// タイムアウト警告が無く`Running Lighthouse`まで到達していれば、
// その事実自体が起動成功の証拠である
//
// タイムアウト警告が出た場合でも、その後に実際の`Local:`行
// （vite preview等のURL表示）が見つかれば起動成功とみなす。Viteの
// カラー出力では「Local」と「:」の間にANSIエスケープシーケンスが
// 挟まり、"Local:"が連続した文字列として出力中に一度も現れないため、
// `:`を挟まず行内で後続のhttpへ到達するかどうかで判定する（karuta#1723/#1724で
// 実際に踏んだ落とし穴。dev-standards#1017参照）
function detectServerStarted(log) {
  const timedOut = /Timed out waiting for the server to start listening/.test(log);

  if (!timedOut) {
    // タイムアウトしていなければ、Running Lighthouseへ到達していること自体が
    // 起動成功の証拠になる（Server Outputブロックがダンプされないため、
    // Local文字列はそもそも出力に現れない）
    if (/Running Lighthouse \d+ time\(s\)/.test(log)) {
      return { started: true, timedOutWarningOnly: false };
    }
    return { started: null, timedOutWarningOnly: false };
  }

  const started = /Local[^\n]*?http/.test(log);
  if (started) return { started: true, timedOutWarningOnly: true };
  return { started: false, timedOutWarningOnly: false };
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

// カテゴリ名（manifest.jsonの`summary`キー）の日本語表示名。
// `pwa`はLighthouseのバージョン・設定によって計測されないことがあるため、
// `summary`に存在する場合のみ表の対象にする（存在しないカテゴリの行は作らない）
const CATEGORY_LABELS = {
  performance: "Performance",
  accessibility: "Accessibility",
  "best-practices": "Best Practices",
  seo: "SEO",
  pwa: "PWA",
};

// `lhci autorun`が`upload.target: "filesystem"`設定時に出力するmanifest.json
// （`[{ url, isRepresentativeRun, summary: { performance, accessibility, ... } }]`
// 形式、0〜1のスコア）から、カテゴリ別スコアのMarkdown表を組み立てる（issue #1047）。
// `upload.target`が未設定・`filesystem`以外の参照側リポジトリではmanifest.json
// 自体が生成されないため、その場合はnullを返し呼び出し側で「不明」表示に倒す
function summarizeLighthouseScores(manifestEntries) {
  if (!Array.isArray(manifestEntries) || manifestEntries.length === 0) return null;

  const lines = [];
  lines.push("| URL | " + Object.values(CATEGORY_LABELS).join(" | ") + " |");
  lines.push("|---|" + Object.values(CATEGORY_LABELS).map(() => "---").join("|") + "|");

  for (const entry of manifestEntries) {
    const summary = entry?.summary ?? {};
    const cells = Object.keys(CATEGORY_LABELS).map((key) => {
      const score = summary[key];
      if (typeof score !== "number") return "―";
      const percent = Math.round(score * 100);
      const mark = percent >= 90 ? "🟢" : percent >= 50 ? "🟡" : "🔴";
      return `${mark} ${percent}`;
    });
    lines.push(`| ${entry.url ?? "不明"} | ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}

function main() {
  const [, , logPath, manifestPath] = process.argv;
  if (!logPath) {
    console.error("Usage: node lighthouse-ci-summary.js <lhci-stdout.log> [manifest.json]");
    process.exitCode = 1;
    return;
  }
  const log = fs.readFileSync(logPath, "utf-8");
  const { markdown } = summarizeLighthouseCiLog(log);
  console.log(markdown);

  if (manifestPath && fs.existsSync(manifestPath)) {
    const manifestEntries = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const scoresMarkdown = summarizeLighthouseScores(manifestEntries);
    if (scoresMarkdown) {
      console.log("");
      console.log("### カテゴリ別スコア");
      console.log("");
      console.log(scoresMarkdown);
    }
  } else {
    console.log("");
    console.log(
      "### カテゴリ別スコア\n\n不明（`lighthouserc.json`の`upload.target`が`filesystem`に設定されていないため、スコアレポートが生成されませんでした）",
    );
  }
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
  summarizeLighthouseScores,
};
