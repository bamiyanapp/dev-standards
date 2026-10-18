"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { classifyStaleRisk } = require("./dependency-stale-risk-classifier.js");

test("classifyStaleRisk: 現行バージョンに既知の脆弱性が無ければlow", () => {
  const result = classifyStaleRisk({ oldVulnerabilityInfo: [], oldExploitInfo: [], securityDataAvailable: true });
  assert.equal(result.level, "low");
});

test("classifyStaleRisk: 現行バージョンの脆弱性情報が不明な場合は安全側としてlow（高・中へは倒さない）", () => {
  const result = classifyStaleRisk({ securityDataAvailable: false });
  assert.equal(result.level, "low");
  assert.ok(result.reasons[0].includes("不明"));
});

test("classifyStaleRisk: 現行バージョンにKEV該当の脆弱性があればhigh", () => {
  const result = classifyStaleRisk({
    oldVulnerabilityInfo: [
      { name: "foo", version: "1.0.0", vulnerabilities: [{ id: "GHSA-x", cveIds: ["CVE-2024-1"], severityRating: "LOW", cvssVectors: [] }] },
    ],
    oldExploitInfo: [{ cveId: "CVE-2024-1", kev: true, epssScore: 0.9, epssPercentile: 0.9 }],
    securityDataAvailable: true,
  });
  assert.equal(result.level, "high");
});

test("classifyStaleRisk: 現行バージョンにCritical/High CVE（KEV無し）があればmedium", () => {
  const result = classifyStaleRisk({
    oldVulnerabilityInfo: [
      { name: "foo", version: "1.0.0", vulnerabilities: [{ id: "GHSA-x", cveIds: ["CVE-2024-1"], severityRating: "HIGH", cvssVectors: [] }] },
    ],
    oldExploitInfo: [],
    securityDataAvailable: true,
  });
  assert.equal(result.level, "medium");
});

test("classifyStaleRisk: LOW severityのCVEのみ（KEV無し）ならlowのまま", () => {
  const result = classifyStaleRisk({
    oldVulnerabilityInfo: [
      { name: "foo", version: "1.0.0", vulnerabilities: [{ id: "GHSA-x", cveIds: ["CVE-2024-1"], severityRating: "LOW", cvssVectors: [] }] },
    ],
    oldExploitInfo: [],
    securityDataAvailable: true,
  });
  assert.equal(result.level, "low");
});

test("classifyStaleRisk: blastRadiusImpactがtrueの場合、lowをmediumへ1段階昇格する（issue #701）", () => {
  const result = classifyStaleRisk({ oldVulnerabilityInfo: [], oldExploitInfo: [], securityDataAvailable: true, blastRadiusImpact: true });
  assert.equal(result.level, "medium");
  assert.ok(result.reasons.some((r) => r.includes("重要パス")));
});

test("classifyStaleRisk: blastRadiusImpactがtrueでもmediumからhighへは昇格しない（CVE/KEVのみがhighの根拠）", () => {
  const result = classifyStaleRisk({
    oldVulnerabilityInfo: [
      { name: "foo", version: "1.0.0", vulnerabilities: [{ id: "GHSA-x", cveIds: ["CVE-2024-1"], severityRating: "HIGH", cvssVectors: [] }] },
    ],
    oldExploitInfo: [],
    securityDataAvailable: true,
    blastRadiusImpact: true,
  });
  assert.equal(result.level, "medium");
  assert.ok(result.reasons.some((r) => r.includes("highへの昇格は既知のCVE/KEVのみを根拠とする")));
});

test("classifyStaleRisk: blastRadiusImpactがtrueでも既にhigh（KEV該当）ならhighのまま", () => {
  const result = classifyStaleRisk({
    oldVulnerabilityInfo: [
      { name: "foo", version: "1.0.0", vulnerabilities: [{ id: "GHSA-x", cveIds: ["CVE-2024-1"], severityRating: "LOW", cvssVectors: [] }] },
    ],
    oldExploitInfo: [{ cveId: "CVE-2024-1", kev: true, epssScore: 0.9, epssPercentile: 0.9 }],
    securityDataAvailable: true,
    blastRadiusImpact: true,
  });
  assert.equal(result.level, "high");
});

test("classifyStaleRisk: securityDataAvailable=falseでもblastRadiusImpactがtrueならmediumへ昇格する（highへは倒さない）", () => {
  const result = classifyStaleRisk({ securityDataAvailable: false, blastRadiusImpact: true });
  assert.equal(result.level, "medium");
});

test("classifyStaleRisk: blastRadiusImpactを省略（既定false）した場合は昇格しない（重要パス未宣言リポジトリへの後方互換）", () => {
  const result = classifyStaleRisk({ oldVulnerabilityInfo: [], oldExploitInfo: [], securityDataAvailable: true });
  assert.equal(result.level, "low");
  assert.ok(!result.reasons.some((r) => r.includes("重要パス")));
});

test("classifyStaleRisk: 現行バージョンがdeprecatedならhigh（issue #945）", () => {
  const result = classifyStaleRisk({
    oldVulnerabilityInfo: [],
    oldExploitInfo: [],
    securityDataAvailable: true,
    deprecationInfo: [{ name: "aws-sdk", oldVersion: "2.1691.0", newVersion: "2.1692.0", oldDeprecated: "maintenance mode" }],
  });
  assert.equal(result.level, "high");
  assert.ok(result.reasons.some((r) => r.includes("deprecated") && r.includes("aws-sdk")));
});

test("classifyStaleRisk: deprecationInfoにnewDeprecatedのみ（oldは非deprecated）の場合は昇格しない", () => {
  const result = classifyStaleRisk({
    oldVulnerabilityInfo: [],
    oldExploitInfo: [],
    securityDataAvailable: true,
    deprecationInfo: [{ name: "foo", oldVersion: "1.0.0", newVersion: "2.0.0", newDeprecated: "use bar" }],
  });
  assert.equal(result.level, "low");
});

test("classifyStaleRisk: deprecationInfoを省略（既定[]）した場合は昇格しない（後方互換）", () => {
  const result = classifyStaleRisk({ oldVulnerabilityInfo: [], oldExploitInfo: [], securityDataAvailable: true });
  assert.equal(result.level, "low");
});

test("CLI: 引数無しの場合はUsageを表示して終了コード1", () => {
  assert.throws(() => {
    execFileSync("node", [path.join(__dirname, "dependency-stale-risk-classifier.js")], { stdio: "pipe" });
  });
});

test("CLI: old-vulnerability-info.jsonのみを渡した場合（old-exploit-info.json省略）はlevel/GITHUB_OUTPUTを出力する", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stale-risk-cli-test-"));
  const oldVulnerabilityInfoPath = path.join(tmpDir, "old-vulnerability-info.json");
  fs.writeFileSync(oldVulnerabilityInfoPath, "[]");
  const githubOutputPath = path.join(tmpDir, "github-output.txt");
  fs.writeFileSync(githubOutputPath, "");

  const stdout = execFileSync("node", [path.join(__dirname, "dependency-stale-risk-classifier.js"), oldVulnerabilityInfoPath], {
    encoding: "utf-8",
    env: { ...process.env, GITHUB_OUTPUT: githubOutputPath },
  });

  const result = JSON.parse(stdout);
  assert.equal(result.level, "low");
  const output = fs.readFileSync(githubOutputPath, "utf-8");
  assert.ok(output.includes("level=low"));
});

test("CLI: blast-radius-info.json（hasCriticalPathImpact: true）を渡すとlowからmediumへ昇格する", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stale-risk-cli-test-"));
  const oldVulnerabilityInfoPath = path.join(tmpDir, "old-vulnerability-info.json");
  const oldExploitInfoPath = path.join(tmpDir, "old-exploit-info.json");
  const blastRadiusInfoPath = path.join(tmpDir, "blast-radius-info.json");
  fs.writeFileSync(oldVulnerabilityInfoPath, "[]");
  fs.writeFileSync(oldExploitInfoPath, "[]");
  fs.writeFileSync(blastRadiusInfoPath, JSON.stringify({ hasCriticalPathImpact: true, hits: [] }));

  const stdout = execFileSync(
    "node",
    [path.join(__dirname, "dependency-stale-risk-classifier.js"), oldVulnerabilityInfoPath, oldExploitInfoPath, blastRadiusInfoPath],
    { encoding: "utf-8" },
  );

  const result = JSON.parse(stdout);
  assert.equal(result.level, "medium");
});

test("CLI: deprecation-info.json（oldDeprecatedあり）を渡すとhighへ昇格する", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stale-risk-cli-test-"));
  const oldVulnerabilityInfoPath = path.join(tmpDir, "old-vulnerability-info.json");
  const oldExploitInfoPath = path.join(tmpDir, "old-exploit-info.json");
  const blastRadiusInfoPath = path.join(tmpDir, "blast-radius-info.json");
  const deprecationInfoPath = path.join(tmpDir, "deprecation-info.json");
  fs.writeFileSync(oldVulnerabilityInfoPath, "[]");
  fs.writeFileSync(oldExploitInfoPath, "[]");
  fs.writeFileSync(blastRadiusInfoPath, JSON.stringify({ hasCriticalPathImpact: false, hits: [] }));
  fs.writeFileSync(
    deprecationInfoPath,
    JSON.stringify([{ name: "aws-sdk", oldVersion: "2.1691.0", newVersion: "2.1692.0", oldDeprecated: "maintenance mode" }]),
  );

  const stdout = execFileSync(
    "node",
    [
      path.join(__dirname, "dependency-stale-risk-classifier.js"),
      oldVulnerabilityInfoPath,
      oldExploitInfoPath,
      blastRadiusInfoPath,
      deprecationInfoPath,
    ],
    { encoding: "utf-8" },
  );

  const result = JSON.parse(stdout);
  assert.equal(result.level, "high");
});

test("classifyStaleRisk: stalenessInfoがある場合はlowからmediumへ昇格する", () => {
  const result = classifyStaleRisk({
    securityDataAvailable: true,
    stalenessInfo: [{ name: "minor-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", lastPublishedAt: "2019-01-01T00:00:00Z", ageDays: 1000, flagged: true }],
  });
  assert.equal(result.level, "medium");
  assert.ok(result.reasons.some((r) => r.includes("minor-pkg") && r.includes("1000日間")));
});

test("classifyStaleRisk: stalenessInfoはhighへは昇格しない（CVE/KEV・deprecatedのみが根拠）", () => {
  const result = classifyStaleRisk({
    securityDataAvailable: true,
    stalenessInfo: [{ name: "minor-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", lastPublishedAt: "2019-01-01T00:00:00Z", ageDays: 1000, flagged: true }],
    deprecationInfo: [],
  });
  assert.equal(result.level, "medium");
});

test("CLI: staleness-info.json（放置検知あり）を渡すとmediumへ昇格する", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stale-risk-cli-test-"));
  const oldVulnerabilityInfoPath = path.join(tmpDir, "old-vulnerability-info.json");
  const oldExploitInfoPath = path.join(tmpDir, "old-exploit-info.json");
  const blastRadiusInfoPath = path.join(tmpDir, "blast-radius-info.json");
  const deprecationInfoPath = path.join(tmpDir, "deprecation-info.json");
  const stalenessInfoPath = path.join(tmpDir, "staleness-info.json");
  fs.writeFileSync(oldVulnerabilityInfoPath, "[]");
  fs.writeFileSync(oldExploitInfoPath, "[]");
  fs.writeFileSync(blastRadiusInfoPath, JSON.stringify({ hasCriticalPathImpact: false, hits: [] }));
  fs.writeFileSync(deprecationInfoPath, "[]");
  fs.writeFileSync(
    stalenessInfoPath,
    JSON.stringify([{ name: "minor-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", lastPublishedAt: "2019-01-01T00:00:00Z", ageDays: 1000, flagged: true }]),
  );

  const stdout = execFileSync(
    "node",
    [
      path.join(__dirname, "dependency-stale-risk-classifier.js"),
      oldVulnerabilityInfoPath,
      oldExploitInfoPath,
      blastRadiusInfoPath,
      deprecationInfoPath,
      stalenessInfoPath,
    ],
    { encoding: "utf-8" },
  );

  const result = JSON.parse(stdout);
  assert.equal(result.level, "medium");
});

test("classifyStaleRisk: scorecardInfoがある場合はlowからmediumへ昇格する", () => {
  const result = classifyStaleRisk({
    securityDataAvailable: true,
    scorecardInfo: [{ name: "minor-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", owner: "owner", repo: "minor-pkg", score: 1.5, flagged: true }],
  });
  assert.equal(result.level, "medium");
  assert.ok(result.reasons.some((r) => r.includes("minor-pkg") && r.includes("1.5点")));
});

test("classifyStaleRisk: scorecardInfoはhighへは昇格しない（CVE/KEV・deprecatedのみが根拠）", () => {
  const result = classifyStaleRisk({
    securityDataAvailable: true,
    scorecardInfo: [{ name: "minor-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", owner: "owner", repo: "minor-pkg", score: 1.5, flagged: true }],
  });
  assert.equal(result.level, "medium");
});

test("CLI: scorecard-info.json（低スコアあり）を渡すとmediumへ昇格する", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stale-risk-cli-test-"));
  const oldVulnerabilityInfoPath = path.join(tmpDir, "old-vulnerability-info.json");
  const oldExploitInfoPath = path.join(tmpDir, "old-exploit-info.json");
  const blastRadiusInfoPath = path.join(tmpDir, "blast-radius-info.json");
  const deprecationInfoPath = path.join(tmpDir, "deprecation-info.json");
  const stalenessInfoPath = path.join(tmpDir, "staleness-info.json");
  const scorecardInfoPath = path.join(tmpDir, "scorecard-info.json");
  fs.writeFileSync(oldVulnerabilityInfoPath, "[]");
  fs.writeFileSync(oldExploitInfoPath, "[]");
  fs.writeFileSync(blastRadiusInfoPath, JSON.stringify({ hasCriticalPathImpact: false, hits: [] }));
  fs.writeFileSync(deprecationInfoPath, "[]");
  fs.writeFileSync(stalenessInfoPath, "[]");
  fs.writeFileSync(
    scorecardInfoPath,
    JSON.stringify([{ name: "minor-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", owner: "owner", repo: "minor-pkg", score: 1.5, flagged: true }]),
  );

  const stdout = execFileSync(
    "node",
    [
      path.join(__dirname, "dependency-stale-risk-classifier.js"),
      oldVulnerabilityInfoPath,
      oldExploitInfoPath,
      blastRadiusInfoPath,
      deprecationInfoPath,
      stalenessInfoPath,
      scorecardInfoPath,
    ],
    { encoding: "utf-8" },
  );

  const result = JSON.parse(stdout);
  assert.equal(result.level, "medium");
});

test("classifyStaleRisk: stalenessInfoがflagged: falseのみの場合は昇格しない", () => {
  const result = classifyStaleRisk({
    securityDataAvailable: true,
    stalenessInfo: [{ name: "fresh-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", lastPublishedAt: "2025-12-01T00:00:00Z", ageDays: 10, flagged: false }],
  });
  assert.equal(result.level, "low");
});

test("classifyStaleRisk: scorecardInfoがflagged: falseのみの場合は昇格しない", () => {
  const result = classifyStaleRisk({
    securityDataAvailable: true,
    scorecardInfo: [{ name: "healthy-pkg", oldVersion: "1.0.0", newVersion: "1.0.1", owner: "owner", repo: "healthy-pkg", score: 9.1, flagged: false }],
  });
  assert.equal(result.level, "low");
});
