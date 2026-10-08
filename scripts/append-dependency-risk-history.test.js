"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildEntry, appendEntry } = require("./append-dependency-risk-history.js");

test("buildEntry: riskResult・staleRiskResultの内容を履歴エントリへ写す", () => {
  const entry = buildEntry(
    "2.62.0",
    { level: "high", reasons: ["新規にinstall scriptを持つようになったパッケージがあります: esbuild"] },
    { level: "low", reasons: ["現行バージョンに既知の脆弱性は見つかりませんでした"] },
  );
  assert.equal(entry.version, "2.62.0");
  assert.equal(entry.riskLevel, "high");
  assert.deepEqual(entry.riskReasons, ["新規にinstall scriptを持つようになったパッケージがあります: esbuild"]);
  assert.equal(entry.staleRiskLevel, "low");
  assert.match(entry.date, /^\d{4}-\d{2}-\d{2}T/);
});

test("buildEntry: riskResult・staleRiskResultのいずれかが無くてもnullで埋める", () => {
  const entry = buildEntry("2.62.0", null, { level: "low", reasons: [] });
  assert.equal(entry.riskLevel, null);
  assert.deepEqual(entry.riskReasons, []);
  assert.equal(entry.staleRiskLevel, "low");
});

test("appendEntry: ファイルが存在しない場合は新規作成する", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "risk-history-test-"));
  const outputPath = path.join(dir, "dependency-risk-history.json");
  const entry = buildEntry("1.0.0", { level: "low", reasons: [] }, { level: "low", reasons: [] });

  appendEntry(outputPath, entry);

  const written = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
  assert.deepEqual(written, [entry]);
});

test("appendEntry: 既存エントリへ新しいバージョンを追加する（既存は保持）", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "risk-history-test-"));
  const outputPath = path.join(dir, "dependency-risk-history.json");
  const first = buildEntry("1.0.0", { level: "low", reasons: [] }, { level: "low", reasons: [] });
  fs.writeFileSync(outputPath, JSON.stringify([first]));

  const second = buildEntry("1.1.0", { level: "high", reasons: ["理由"] }, { level: "low", reasons: [] });
  appendEntry(outputPath, second);

  const written = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
  assert.deepEqual(written, [first, second]);
});

// issue #746: changelogPrepareCmdの失敗はリリースのコミット自体を止めてしまうため、
// 同一バージョンでの再実行（リトライ等）が重複エントリを増やし続けないことを保証する
test("appendEntry: 同じバージョンへの再追記は、既存エントリを上書きする", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "risk-history-test-"));
  const outputPath = path.join(dir, "dependency-risk-history.json");
  const first = buildEntry("1.0.0", { level: "high", reasons: ["旧い結果"] }, { level: "low", reasons: [] });
  fs.writeFileSync(outputPath, JSON.stringify([first]));

  const retried = buildEntry("1.0.0", { level: "low", reasons: ["再実行後の結果"] }, { level: "low", reasons: [] });
  appendEntry(outputPath, retried);

  const written = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
  assert.equal(written.length, 1);
  assert.deepEqual(written[0], retried);
});
