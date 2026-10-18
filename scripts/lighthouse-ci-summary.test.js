"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  summarizeLighthouseCiLog,
  detectOverallSuccess,
  parseHealthcheck,
  detectServerStarted,
  parseRunCount,
  parseAssertionFailures,
  summarizeLighthouseScores,
} = require("./lighthouse-ci-summary.js");

// karuta#1698のPRコメントで実際に観測されたログをそのまま使う（issue #982）
const SUCCESS_LOG = `✅  .lighthouseci/ directory writable
✅  Configuration file found
✅  Chrome installation found
⚠️   GitHub token not set
Healthcheck passed!

Started a web server with "npm run build && npm run preview"...
WARNING: Timed out waiting for the server to start listening.
         Ensure the server prints a pattern that matches /Local:/i when it is ready.

Server Output:

> frontend@0.0.0 build
> vite build

✓ built in 496ms

> frontend@0.0.0 preview
> vite preview

  ➜  Local:   http://localhost:4173/
  ➜  Network: use --host to expose

Running Lighthouse 1 time(s) on http://localhost:4173/
Run #1...done.
Done running Lighthouse!

Checking assertions against 1 URL(s), 1 total run(s)

All results processed!
Done running autorun.`;

const FAILURE_LOG = `✅  .lighthouseci/ directory writable
✅  Configuration file found
✅  Chrome installation found
Healthcheck passed!

Started a web server with "npm run build && npm run preview"...

> vite preview
  ➜  Local:   http://localhost:4173/

Running Lighthouse 1 time(s) on http://localhost:4173/
Run #1...done.
Done running Lighthouse!

Checking assertions against 1 URL(s), 1 total run(s)

1 result(s) for http://localhost:4173/

✘  categories:performance failure for minScore assertion
      expected: >= 0.9
         found: 0.75
    all values: 0.75

Assertion failed. Exiting with status code 1.`;

const UNEXPECTED_LOG = "something completely different that lhci never actually produces";

// karuta#1739のPRコメントで実際に観測されたログをそのまま使う（dev-standards#1022）。
// 起動がタイムアウトせず速く成功した場合、lhciは診断用の「Server Output:」ブロック
// 自体をダンプしないため、Local文字列がログに一切現れないケース
const NO_TIMEOUT_NO_SERVER_OUTPUT_LOG = `✅  .lighthouseci/ directory writable
✅  Configuration file found
✅  Chrome installation found
⚠️   GitHub token not set
Healthcheck passed!

Started a web server with "npm run build && npm run preview"...
Running Lighthouse 1 time(s) on http://localhost:4173/
Run #1...done.
Done running Lighthouse!

Checking assertions against 1 URL(s), 1 total run(s)

All results processed!

Dumping 1 reports to disk at /home/runner/work/karuta/karuta/frontend/lhci-reports...
Done writing reports to disk.

Done running autorun.`;

// karuta#1723/#1724のPRコメントで実際に観測されたログをそのまま使う（dev-standards#1017）。
// Viteのカラー出力で「Local」と「:」の間にANSIエスケープシーケンス（\u001b[22m）が
// 挟まり、"Local:"という連続した文字列が一度も現れないケース
const ANSI_SUCCESS_LOG = `✅  .lighthouseci/ directory writable
✅  Configuration file found
✅  Chrome installation found
⚠️   GitHub token not set
Healthcheck passed!

Started a web server with "npm run build && npm run preview"...
Running Lighthouse 1 time(s) on http://localhost:4173/
Run #1...done.
Done running Lighthouse!

Checking assertions against 1 URL(s), 1 total run(s)

All results processed!
Done running autorun.

Server Output:

> frontend@0.0.0 preview
> vite preview

  \u001b[32m➜\u001b[39m  \u001b[1mLocal\u001b[22m:   \u001b[36mhttp://localhost:\u001b[1m4173\u001b[22m/\u001b[39m
\u001b[2m  \u001b[32m➜\u001b[39m  \u001b[1mNetwork\u001b[22m\u001b[2m: use \u001b[22m\u001b[1m--host\u001b[22m\u001b[2m to expose\u001b[22m`;

test("detectOverallSuccess: Assertion failedがあればfalse", () => {
  assert.equal(detectOverallSuccess(FAILURE_LOG), false);
});

test("detectOverallSuccess: Done running autorun.があればtrue", () => {
  assert.equal(detectOverallSuccess(SUCCESS_LOG), true);
});

test("detectOverallSuccess: どちらも無ければnull（不明）", () => {
  assert.equal(detectOverallSuccess(UNEXPECTED_LOG), null);
});

test("parseHealthcheck: 警告のみの場合はwarned件数を返す", () => {
  const result = parseHealthcheck(SUCCESS_LOG);
  assert.deepEqual(result, { total: 4, failed: 0, warned: 1 });
});

test("parseHealthcheck: ヘルスチェック行が無い場合はnull", () => {
  assert.equal(parseHealthcheck(UNEXPECTED_LOG), null);
});

test("detectServerStarted: タイムアウト警告があってもLocal:があれば起動成功", () => {
  assert.deepEqual(detectServerStarted(SUCCESS_LOG), { started: true, timedOutWarningOnly: true });
});

test("detectServerStarted: タイムアウト警告が無くLocal:があれば単純な起動成功", () => {
  assert.deepEqual(detectServerStarted(FAILURE_LOG), { started: true, timedOutWarningOnly: false });
});

test("detectServerStarted: Local:もタイムアウト警告も無ければ不明", () => {
  assert.deepEqual(detectServerStarted(UNEXPECTED_LOG), { started: null, timedOutWarningOnly: false });
});

test("detectServerStarted: ANSIエスケープで「Local」と「:」が分断されていても起動成功と判定する", () => {
  assert.deepEqual(detectServerStarted(ANSI_SUCCESS_LOG), { started: true, timedOutWarningOnly: false });
});

test("detectServerStarted: タイムアウト警告が無くLocal文字列も無い（Server Output未ダンプ）正常系を起動成功と判定する", () => {
  assert.deepEqual(detectServerStarted(NO_TIMEOUT_NO_SERVER_OUTPUT_LOG), {
    started: true,
    timedOutWarningOnly: false,
  });
});

test("parseRunCount: 実行回数と対象URLを抽出する", () => {
  assert.deepEqual(parseRunCount(SUCCESS_LOG), { count: 1, url: "http://localhost:4173/" });
});

test("parseRunCount: 該当行が無ければnull", () => {
  assert.equal(parseRunCount(UNEXPECTED_LOG), null);
});

test("parseAssertionFailures: 失敗行を抽出する", () => {
  const failures = parseAssertionFailures(FAILURE_LOG);
  assert.equal(failures.length, 1);
  assert.ok(failures[0].includes("categories:performance"));
});

test("parseAssertionFailures: 成功時は空配列", () => {
  assert.deepEqual(parseAssertionFailures(SUCCESS_LOG), []);
});

test("summarizeLighthouseCiLog: 成功ログは成功マークダウンを返す", () => {
  const { overallSuccess, markdown } = summarizeLighthouseCiLog(SUCCESS_LOG);
  assert.equal(overallSuccess, true);
  assert.ok(markdown.includes("正常に完了しました"));
  assert.ok(markdown.includes("実害はありません"));
  assert.ok(markdown.includes("全て通過"));
});

test("summarizeLighthouseCiLog: 失敗ログはassertion失敗マークダウンを返す", () => {
  const { overallSuccess, markdown } = summarizeLighthouseCiLog(FAILURE_LOG);
  assert.equal(overallSuccess, false);
  assert.ok(markdown.includes("assertion"));
  assert.ok(markdown.includes("categories:performance"));
});

test("summarizeLighthouseCiLog: ANSIエスケープで分断されたLocal:でも起動成功と要約する", () => {
  const { markdown } = summarizeLighthouseCiLog(ANSI_SUCCESS_LOG);
  assert.ok(markdown.includes("計測対象サーバー: 起動成功"));
  assert.ok(!markdown.includes("不明（起動ログを読み取れませんでした）"));
});

test("summarizeLighthouseCiLog: Server Output未ダンプの正常系でも起動成功と要約する", () => {
  const { markdown } = summarizeLighthouseCiLog(NO_TIMEOUT_NO_SERVER_OUTPUT_LOG);
  assert.ok(markdown.includes("計測対象サーバー: 起動成功"));
  assert.ok(!markdown.includes("不明（起動ログを読み取れませんでした）"));
});

test("summarizeLighthouseCiLog: 想定外の形式では不明として安全側に倒す", () => {
  const { overallSuccess, markdown } = summarizeLighthouseCiLog(UNEXPECTED_LOG);
  assert.equal(overallSuccess, null);
  assert.ok(markdown.includes("判定できませんでした"));
});

// karuta PR#1753で実際に観測された`manifest.json`形式（issue #1047）
const MANIFEST_ENTRIES = [
  {
    url: "http://localhost:4173/",
    isRepresentativeRun: true,
    summary: { performance: 0.49, accessibility: 0.84, "best-practices": 0.93, seo: 0.9 },
  },
];

test("summarizeLighthouseScores: manifest.jsonのsummaryからカテゴリ別スコア表を組み立てる", () => {
  const markdown = summarizeLighthouseScores(MANIFEST_ENTRIES);
  assert.ok(markdown.includes("http://localhost:4173/"));
  assert.ok(markdown.includes("🔴 49"));
  assert.ok(markdown.includes("🟡 84"));
  assert.ok(markdown.includes("🟢 93"));
  assert.ok(markdown.includes("🟢 90"));
});

test("summarizeLighthouseScores: pwa等summaryに無いカテゴリは「―」にする", () => {
  const markdown = summarizeLighthouseScores(MANIFEST_ENTRIES);
  const pwaRow = markdown.split("\n").find((l) => l.startsWith("| PWA"));
  assert.ok(pwaRow.includes("―"));
});

test("summarizeLighthouseScores: カテゴリを行・URLを列にした縦持ちにする", () => {
  const markdown = summarizeLighthouseScores(MANIFEST_ENTRIES);
  const lines = markdown.split("\n");
  assert.ok(lines[0].startsWith("| カテゴリ | http://localhost:4173/ |"));
  assert.ok(lines.some((l) => l.startsWith("| Performance | 🔴 49 |")));
});

test("summarizeLighthouseScores: 空配列・非配列ではnullを返す", () => {
  assert.equal(summarizeLighthouseScores([]), null);
  assert.equal(summarizeLighthouseScores(undefined), null);
  assert.equal(summarizeLighthouseScores(null), null);
});
