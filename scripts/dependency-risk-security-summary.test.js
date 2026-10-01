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
        cvssVectors: [],
      },
    ],
  },
  { name: "bar", version: "2.0.0", vulnerabilities: [] },
];

const SAMPLE_EXPLOIT_INFO = [{ cveId: "CVE-2024-00001", kev: true, epssScore: 0.975, epssPercentile: 0.999 }];

test("buildSecurityRows: パッケージ・CVE・exploit情報を1行にまとめる", () => {
  const rows = buildSecurityRows(SAMPLE_VULN_INFO, SAMPLE_EXPLOIT_INFO);
  assert.deepEqual(rows, [
    { package: "foo", id: "GHSA-aaaa", cveId: "CVE-2024-00001", severityRating: "HIGH", kev: true, epssScore: 0.975 },
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

test("renderSecuritySection: 脆弱性がある場合は表とKEV警告を含む", () => {
  const body = renderSecuritySection(SAMPLE_VULN_INFO, SAMPLE_EXPLOIT_INFO);
  assert.match(body, /\| foo \| CVE-2024-00001 \| HIGH \| ⚠️ 該当 \|/);
  assert.match(body, /KEV（Known Exploited Vulnerability/);
});

test("renderSecuritySection: KEV該当が無ければ警告文を含まない", () => {
  const exploitInfo = [{ cveId: "CVE-2024-00001", kev: false, epssScore: 0.01, epssPercentile: 0.1 }];
  const body = renderSecuritySection(SAMPLE_VULN_INFO, exploitInfo);
  assert.match(body, /該当なし/);
  assert.doesNotMatch(body, /優先的に確認してください/);
});
