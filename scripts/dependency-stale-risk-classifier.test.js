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
