"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { classifyRisk } = require("./dependency-risk-classifier.js");
const { summarizeCiResults } = require("./dependency-risk-ci-results.js");

const PASSING_CI = summarizeCiResults({
  frontendTest: "success",
  backendTest: "success",
  packageTest: "success",
  frontendE2eTest: "success",
  architectureCheck: "success",
  duplicationCheck: "success",
});

function baseInput(overrides = {}) {
  return {
    updateSummary: { total: 1, direct: 1, transitive: 0, byUpdateType: { major: 0, minor: 1, patch: 0, other: 0 } },
    vulnerabilityInfo: [],
    exploitInfo: [],
    securityDataAvailable: true,
    ciSummary: PASSING_CI,
    fanOutCount: null,
    ...overrides,
  };
}

test("classifyRisk: patch/minor・脆弱性なし・CI全PASS・ファンアウトなしはlow", () => {
  const result = classifyRisk(baseInput());
  assert.equal(result.level, "low");
});

test("classifyRisk: major updateはhigh", () => {
  const result = classifyRisk(
    baseInput({ updateSummary: { total: 1, direct: 1, transitive: 0, byUpdateType: { major: 1, minor: 0, patch: 0, other: 0 } } }),
  );
  assert.equal(result.level, "high");
  assert.ok(result.reasons.some((r) => r.includes("major update")));
});

test("classifyRisk: update type「other」（ダウングレード等）もhigh", () => {
  const result = classifyRisk(
    baseInput({ updateSummary: { total: 1, direct: 1, transitive: 0, byUpdateType: { major: 0, minor: 0, patch: 0, other: 1 } } }),
  );
  assert.equal(result.level, "high");
});

test("classifyRisk: Critical/High severityのCVEが残っている場合はhigh", () => {
  const result = classifyRisk(
    baseInput({
      vulnerabilityInfo: [
        { name: "foo", version: "1.0.0", vulnerabilities: [{ id: "GHSA-x", cveIds: ["CVE-2024-1"], severityRating: "HIGH", cvssVectors: [] }] },
      ],
      exploitInfo: [],
    }),
  );
  assert.equal(result.level, "high");
  assert.ok(result.reasons.some((r) => r.includes("CVE")));
});

test("classifyRisk: LOW/MEDIUM severityのCVEのみならhighにしない", () => {
  const result = classifyRisk(
    baseInput({
      vulnerabilityInfo: [
        { name: "foo", version: "1.0.0", vulnerabilities: [{ id: "GHSA-x", cveIds: ["CVE-2024-1"], severityRating: "LOW", cvssVectors: [] }] },
      ],
      exploitInfo: [],
    }),
  );
  assert.notEqual(result.level, "high");
});

test("classifyRisk: KEV該当はhigh", () => {
  const result = classifyRisk(
    baseInput({
      vulnerabilityInfo: [
        { name: "foo", version: "1.0.0", vulnerabilities: [{ id: "GHSA-x", cveIds: ["CVE-2024-1"], severityRating: "LOW", cvssVectors: [] }] },
      ],
      exploitInfo: [{ cveId: "CVE-2024-1", kev: true, epssScore: 0.9, epssPercentile: 0.9 }],
    }),
  );
  assert.equal(result.level, "high");
  assert.ok(result.reasons.some((r) => r.includes("KEV")));
});

test("classifyRisk: 既知flakyで説明できないtest失敗はhigh", () => {
  const ciSummary = summarizeCiResults({ backendTest: "failure" });
  const result = classifyRisk(baseInput({ ciSummary }));
  assert.equal(result.level, "high");
});

test("classifyRisk: 既知flakyパターンに該当する失敗のみならmedium（highにしない）", () => {
  const ciSummary = summarizeCiResults({ frontendE2eTest: "failure" });
  const result = classifyRisk(baseInput({ ciSummary }));
  assert.equal(result.level, "medium");
  assert.ok(result.reasons.some((r) => r.includes("既知flakyパターン")));
});

test("classifyRisk: セキュリティ情報取得失敗（securityDataAvailable=false）はmedium", () => {
  const result = classifyRisk(baseInput({ securityDataAvailable: false }));
  assert.equal(result.level, "medium");
  assert.ok(result.reasons.some((r) => r.includes("不明")));
});

test("classifyRisk: ファンアウトあり（dev-standards自体の更新）はmedium", () => {
  const result = classifyRisk(baseInput({ fanOutCount: 8 }));
  assert.equal(result.level, "medium");
  assert.ok(result.reasons.some((r) => r.includes("8件")));
});

test("classifyRisk: ファンアウトが0件（対象外）はmediumへ格上げしない", () => {
  const result = classifyRisk(baseInput({ fanOutCount: 0 }));
  assert.equal(result.level, "low");
});

test("classifyRisk: 直接依存の更新が閾値以上ならmedium", () => {
  const result = classifyRisk(
    baseInput({ updateSummary: { total: 3, direct: 3, transitive: 0, byUpdateType: { major: 0, minor: 3, patch: 0, other: 0 } } }),
  );
  assert.equal(result.level, "medium");
});

test("classifyRisk: highとmedium両方の条件がある場合はhighが優先される", () => {
  const result = classifyRisk(baseInput({ securityDataAvailable: false, fanOutCount: 8, ciSummary: summarizeCiResults({ backendTest: "failure" }) }));
  assert.equal(result.level, "high");
  assert.ok(result.reasons.length >= 3);
});

test("classifyRisk: 何も問題が無い場合は理由を1件返す", () => {
  const result = classifyRisk(baseInput());
  assert.equal(result.reasons.length, 1);
  assert.ok(result.reasons[0].includes("検出されませんでした"));
});

test("CLI: 入力ファイルからJSON結果を出力し、GITHUB_OUTPUTにlevelを書き込む", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "risk-classifier-test-"));
  const updateInfoPath = path.join(tmpDir, "dependency-update-info.json");
  const vulnerabilityInfoPath = path.join(tmpDir, "vulnerability-info.json");
  const exploitInfoPath = path.join(tmpDir, "exploit-info.json");
  const githubOutputPath = path.join(tmpDir, "github-output.txt");
  fs.writeFileSync(
    updateInfoPath,
    JSON.stringify({ summary: { total: 1, direct: 1, transitive: 0, byUpdateType: { major: 0, minor: 1, patch: 0, other: 0 } }, changes: [] }),
  );
  fs.writeFileSync(vulnerabilityInfoPath, "[]");
  fs.writeFileSync(exploitInfoPath, "[]");
  fs.writeFileSync(githubOutputPath, "");

  const output = execFileSync(
    process.execPath,
    [path.join(__dirname, "dependency-risk-classifier.js"), updateInfoPath, vulnerabilityInfoPath, exploitInfoPath],
    {
      encoding: "utf-8",
      env: { ...process.env, GITHUB_OUTPUT: githubOutputPath },
    },
  );

  const parsed = JSON.parse(output);
  assert.equal(parsed.level, "low");
  assert.match(fs.readFileSync(githubOutputPath, "utf-8"), /level=low/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("CLI: vulnerability-info.json・exploit-info.jsonが無い場合はセキュリティ情報不明としてmedium以上にする", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "risk-classifier-test-"));
  const updateInfoPath = path.join(tmpDir, "dependency-update-info.json");
  fs.writeFileSync(
    updateInfoPath,
    JSON.stringify({ summary: { total: 1, direct: 1, transitive: 0, byUpdateType: { major: 0, minor: 1, patch: 0, other: 0 } }, changes: [] }),
  );

  const output = execFileSync(process.execPath, [path.join(__dirname, "dependency-risk-classifier.js"), updateInfoPath], {
    encoding: "utf-8",
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.level, "medium");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
