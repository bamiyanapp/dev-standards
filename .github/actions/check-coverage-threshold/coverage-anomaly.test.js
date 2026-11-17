"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { findUnexpectedPaths, buildFileBreakdown, compareTotals, describeComparison, relativeKey } = require("./coverage-anomaly.js");

const cov = (statements, branches, pct = 50) => ({ statements: { total: statements, pct }, branches: { total: branches, pct } });
const totalOf = (s, b) => ({ lines: { total: s }, statements: { total: s }, functions: { total: s }, branches: { total: b } });

test("src/配下だけなら、想定外のパスは無い（相対・絶対のどちらでも）", () => {
  const summary = { total: cov(10, 5), "src/App.jsx": cov(5, 2), "/work/app/src/util.js": cov(5, 3) };
  assert.deepEqual(findUnexpectedPaths(summary, { cwd: "/work/app" }), []);
});

test("node_modulesと、src/以外のパス（他アプリ・ビルド成果物）を検知する", () => {
  const summary = {
    total: cov(10, 5),
    "src/App.jsx": cov(5, 2),
    "/work/app/node_modules/react/index.js": cov(1, 1),
    "/work/other-app/src/x.js": cov(1, 1),
    "assets/index-abc.js": cov(1, 1),
  };
  const got = findUnexpectedPaths(summary, { cwd: "/work/app" });
  assert.deepEqual(got.map((g) => g.reason), ["node_modules", "想定外のパス", "想定外のパス"]);
  assert.ok(got.some((g) => g.file.startsWith("../other-app")));
});

test("許可するプレフィックスは変更できる", () => {
  assert.deepEqual(findUnexpectedPaths({ total: cov(1, 1), "app/src/a.js": cov(1, 1) }, { cwd: "/w", allowedPrefixes: ["app/src/"] }), []);
});

test("relativeKey: ./と\\を正規化する", () => {
  assert.equal(relativeKey("./src/a.js", "/w"), "src/a.js");
  assert.equal(relativeKey("src\\a.js", "/w"), "src/a.js");
});

test("ファイル別の内訳は、分母の大きい順に上位N件と、残りの件数を出す", () => {
  const summary = { total: cov(100, 50) };
  for (let i = 0; i < 25; i++) summary[`src/f${i}.js`] = cov(i + 1, 0);
  const md = buildFileBreakdown(summary, "e2e", { limit: 20 });
  assert.match(md, /集計対象のファイル（e2e）: 25件/);
  assert.match(md, /\| src\/f24\.js \| 25 \|/);
  assert.ok(!md.includes("src/f0.js |"));
  assert.match(md, /他5件/);
  assert.equal(buildFileBreakdown({ total: cov(1, 1) }, "x"), "");
});

test("分母が2倍超で警告、5倍超で失敗。#1360の実例（123→8177）は失敗", () => {
  const r = compareTotals(totalOf(100, 8177), totalOf(100, 123));
  assert.equal(r.find((x) => x.metric === "branches").level, "fail");
  assert.equal(r.find((x) => x.metric === "statements").level, "ok");
  const warn = compareTotals(totalOf(300, 10), totalOf(100, 10));
  assert.equal(warn.find((x) => x.metric === "statements").level, "warn");
});

test("半分未満・5分の1未満の減少も検知する", () => {
  assert.equal(compareTotals(totalOf(40, 10), totalOf(100, 10)).find((x) => x.metric === "statements").level, "warn");
  assert.equal(compareTotals(totalOf(10, 10), totalOf(100, 10)).find((x) => x.metric === "statements").level, "fail");
});

test("ベースラインが無い・分母が0なら、判定をスキップする。しきい値は変更できる", () => {
  assert.deepEqual(compareTotals(totalOf(1, 1), undefined), []);
  assert.deepEqual(compareTotals(totalOf(0, 0), totalOf(10, 10)), []);
  assert.equal(compareTotals(totalOf(150, 10), totalOf(100, 10), { warnRatio: 1.2 }).find((x) => x.metric === "statements").level, "warn");
});

test("説明: 異常が無ければ空。あれば、正当な場合の対応を案内する", () => {
  assert.equal(describeComparison(compareTotals(totalOf(100, 10), totalOf(100, 10))), "");
  const md = describeComparison(compareTotals(totalOf(100, 8177), totalOf(100, 123)));
  assert.match(md, /branches \| 123 \| 8177 \| 66\.48倍（失敗）/);
  assert.match(md, /ベースラインが更新されます/);
});
