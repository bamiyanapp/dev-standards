"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSecurityRows, renderSecuritySection } = require("./dependency-risk-security-summary.js");

const SAMPLE_VULN_INFO = [
  {
    name: "foo",
    version: "1.2.3",
    vulnerabilities: [
      {
        id: "GHSA-aaaa",
        cveIds: ["CVE-2024-00001"],
        summary: "example",
        severityRating: "HIGH",
        cvssVectors: ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"],
      },
    ],
  },
  { name: "bar", version: "2.0.0", vulnerabilities: [] },
];

const SAMPLE_EXPLOIT_INFO = [{ cveId: "CVE-2024-00001", kev: true, epssScore: 0.975, epssPercentile: 0.999 }];

test("buildSecurityRows: パッケージ・CVE・exploit情報を1行にまとめる", () => {
  const rows = buildSecurityRows(SAMPLE_VULN_INFO, SAMPLE_EXPLOIT_INFO);
  assert.deepEqual(rows, [
    {
      package: "foo",
      id: "GHSA-aaaa",
      cveId: "CVE-2024-00001",
      severityRating: "HIGH",
      cvssVectors: ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"],
      kev: true,
      epssScore: 0.975,
    },
  ]);
});

test("buildSecurityRows: 脆弱性0件のパッケージは行を生成しない", () => {
  const rows = buildSecurityRows([{ name: "bar", version: "1.0.0", vulnerabilities: [] }], []);
  assert.deepEqual(rows, []);
});

test("buildSecurityRows: CVE idが無い脆弱性（GHSA固有の脆弱性等）はOSV自身のidを使う", () => {
  const vulnInfo = [
    { name: "foo", version: "1.0.0", vulnerabilities: [{ id: "GHSA-bbbb", cveIds: [], severityRating: "LOW", cvssVectors: [] }] },
  ];
  const rows = buildSecurityRows(vulnInfo, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cveId, null);
  assert.equal(rows[0].id, "GHSA-bbbb");
});

test("buildSecurityRows: exploit情報に対応エントリが無いCVEはkev/epssScoreがnull（不明）になる", () => {
  const vulnInfo = [
    { name: "foo", version: "1.0.0", vulnerabilities: [{ id: "GHSA-cccc", cveIds: ["CVE-2024-99999"], severityRating: "MEDIUM", cvssVectors: [] }] },
  ];
  const rows = buildSecurityRows(vulnInfo, []);
  assert.equal(rows[0].kev, null);
  assert.equal(rows[0].epssScore, null);
});

test("renderSecuritySection: 脆弱性が1件も無い場合は短い完了メッセージのみを返す", () => {
  const body = renderSecuritySection([{ name: "foo", version: "1.0.0", vulnerabilities: [] }], []);
  assert.match(body, /既知の脆弱性は見つかりませんでした/);
  assert.doesNotMatch(body, /\|/); // テーブルを含まない
});

// issue #1331: ベクタ"CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"はFIRST公式
// 参照計算機でも9.8になる、広く知られた例（Base Score最大値域の代表例）
test("renderSecuritySection: 脆弱性がある場合はCVSSスコアを含む表とKEV警告を含む", () => {
  const body = renderSecuritySection(SAMPLE_VULN_INFO, SAMPLE_EXPLOIT_INFO);
  assert.match(body, /\| foo \| CVE-2024-00001 \| HIGH \| 9\.8 \(CVSS:3\.1\) \| 97\.5% \| ⚠️ 該当 \|/);
  assert.match(body, /KEV（Known Exploited Vulnerability/);
});

// issue #1328: 見出しに「CVSS」とあるのに表にCVSS情報が出ていない指摘を受け、
// ベクタから計算したCVSS数値スコアを列として追加した（issue #1331、
// ae-cvss-calculatorへ計算を委譲。自前実装はしない）。KEVは右端の列へ移した
test("renderSecuritySection: CVSSベクタが無い場合は「不明」と表示する", () => {
  const vulnInfo = [
    { name: "foo", version: "1.0.0", vulnerabilities: [{ id: "GHSA-dddd", cveIds: ["CVE-2024-11111"], severityRating: "LOW", cvssVectors: [] }] },
  ];
  const body = renderSecuritySection(vulnInfo, []);
  assert.match(body, /\| foo \| CVE-2024-11111 \| LOW \| 不明 \|/);
});

test("renderSecuritySection: 複数のCVSSバージョンがある場合はそれぞれのスコアをカンマ区切りで列挙する", () => {
  const vulnInfo = [
    {
      name: "foo",
      version: "1.0.0",
      vulnerabilities: [
        {
          id: "GHSA-eeee",
          cveIds: ["CVE-2024-22222"],
          severityRating: "CRITICAL",
          cvssVectors: ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N"],
        },
      ],
    },
  ];
  const body = renderSecuritySection(vulnInfo, []);
  assert.match(body, /\| 9\.8 \(CVSS:3\.1\), 9\.3 \(CVSS:4\.0\) \|/);
});

test("renderSecuritySection: 計算できないベクタ（パース失敗等）はバージョン番号のみ表示にフォールバックする", () => {
  const vulnInfo = [
    {
      name: "foo",
      version: "1.0.0",
      vulnerabilities: [{ id: "GHSA-ffff", cveIds: ["CVE-2024-33333"], severityRating: "LOW", cvssVectors: ["CVSS:99.9/not-a-real-vector"] }],
    },
  ];
  const body = renderSecuritySection(vulnInfo, []);
  assert.match(body, /\| 99\.9 \|/);
});

// issue #1328: 「上位◯%ile相当」の注記が冗長との指摘を受け、単純なパーセント表記にした
test("renderSecuritySection: EPSSは単純なパーセント表記になる（上位%ile注記は無し）", () => {
  const exploitInfo = [{ cveId: "CVE-2024-00001", kev: false, epssScore: 0.002, epssPercentile: 0.998 }];
  const body = renderSecuritySection(SAMPLE_VULN_INFO, exploitInfo);
  assert.match(body, /\| 0\.2% \|/);
  assert.doesNotMatch(body, /上位/);
  assert.doesNotMatch(body, /%ile/);
});

// issue #1323: 「維持リスク」の理由（更新前バージョンのCVE残存）と「Security」
// セクション（更新後バージョンの判定）が別バージョンを見ていることが分からず
// 矛盾して見えたため、見出しにどちらのバージョンかを明示するようにした
test("renderSecuritySection: versionLabel省略時は見出しに「更新後バージョン」が入る（デフォルト）", () => {
  const body = renderSecuritySection(SAMPLE_VULN_INFO, SAMPLE_EXPLOIT_INFO);
  assert.match(body, /^#### Security（CVE\/CVSS\/EPSS\/KEV、更新後バージョン）/);
});

test("renderSecuritySection: versionLabelに「更新前バージョン」を渡すと見出しに反映される", () => {
  const body = renderSecuritySection(SAMPLE_VULN_INFO, SAMPLE_EXPLOIT_INFO, "更新前バージョン");
  assert.match(body, /^#### Security（CVE\/CVSS\/EPSS\/KEV、更新前バージョン）/);
});

test("renderSecuritySection: KEV該当が無ければ警告文を含まない", () => {
  const exploitInfo = [{ cveId: "CVE-2024-00001", kev: false, epssScore: 0.01, epssPercentile: 0.1 }];
  const body = renderSecuritySection(SAMPLE_VULN_INFO, exploitInfo);
  assert.match(body, /該当なし/);
  assert.doesNotMatch(body, /優先的に確認してください/);
});
