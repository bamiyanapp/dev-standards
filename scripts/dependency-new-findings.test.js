"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { marker, extractAnnounced, selectNewFindings, describeFinding, buildNewFindingsComment } = require("./dependency-new-findings.js");
const { updateLedger } = require("./dependency-mttr-tracker.js");

test("updateLedger: 台帳に無い検知を、addedとして返す。継続中のものは含めない", () => {
  const ledger = [{ key: "a@1", name: "a", version: "1", firstDetectedAt: "2026-11-01T00:00:00Z" }];
  const { added } = updateLedger(ledger, [{ name: "a", version: "1" }, { name: "b", version: "2" }], "2026-11-20T00:00:00Z");
  assert.deepEqual(added, [{ name: "b", version: "2" }]);
});

test("updateLedger: 既存の戻り値（ledger・resolved）は変わらない", () => {
  const ledger = [{ key: "a@1", name: "a", version: "1", firstDetectedAt: "2026-11-01T00:00:00Z" }];
  const { ledger: next, resolved } = updateLedger(ledger, [], "2026-11-20T00:00:00Z");
  assert.deepEqual(next, []);
  assert.equal(resolved.length, 1);
});

test("extractAnnounced: コメントの目印から、通知済みの項目を取り出す", () => {
  const body = `## 新規\n\n- a@1\n\n${marker({ name: "a", version: "1" })}\n${marker({ name: "@scope/b", version: "2.0.0" })}`;
  assert.deepEqual([...extractAnnounced([body, "目印の無いコメント"])].sort(), ["@scope/b@2.0.0", "a@1"]);
});

test("selectNewFindings: 通知済みの項目を除く（台帳のPRが、マージされるまでの重複を防ぐ）", () => {
  const announcedComment = buildNewFindingsComment([{ name: "a", version: "1" }]);
  const result = selectNewFindings([{ name: "a", version: "1" }, { name: "b", version: "2" }], [announcedComment]);
  assert.deepEqual(result, [{ name: "b", version: "2" }]);
});

test("selectNewFindings: 通知済みが無ければ、すべて返す。addedが空なら空", () => {
  assert.deepEqual(selectNewFindings([{ name: "a", version: "1" }], []), [{ name: "a", version: "1" }]);
  assert.deepEqual(selectNewFindings([], ["x"]), []);
});

test("describeFinding: 直接・間接と、脆弱性IDを表示する", () => {
  assert.equal(describeFinding({ name: "a", version: "1", direct: true, vulnerabilities: [{ id: "GHSA-1" }, { id: "CVE-2" }] }), "- a@1（直接）: GHSA-1, CVE-2");
  assert.equal(describeFinding({ name: "b", version: "2" }), "- b@2");
});

test("buildNewFindingsComment: 件数・一覧・run・目印を含む", () => {
  const comment = buildNewFindingsComment([{ name: "a", version: "1", direct: false, vulnerabilities: [{ id: "CVE-1" }] }], "https://github.com/o/r/actions/runs/1");
  assert.match(comment, /新規に検知された脆弱性: 1件/);
  assert.match(comment, /- a@1（間接）: CVE-1/);
  assert.match(comment, /https:\/\/github\.com\/o\/r\/actions\/runs\/1/);
  assert.ok(comment.includes(marker({ name: "a", version: "1" })));
});

// 重大度の区別（dev-standards#1373）
const { classifyFinding, needsHighPriority, DEADLINE_DAYS } = require("./dependency-new-findings.js");

const finding = (name, vulns) => ({ name, version: "1.0.0", direct: true, vulnerabilities: vulns });
const vuln = (id, { cveIds = [], severityRating = null } = {}) => ({ id, cveIds, severityRating });

test("classifyFinding: KEVに載るCVEがあれば kev、それ以外でCriticalなら critical、Highなら high、他は other", () => {
  const kev = new Set(["CVE-2026-0001"]);
  assert.equal(classifyFinding(finding("a", [vuln("G1", { cveIds: ["CVE-2026-0001"], severityRating: "LOW" })]), kev), "kev");
  assert.equal(classifyFinding(finding("b", [vuln("G2", { cveIds: ["CVE-2026-0002"], severityRating: "CRITICAL" })]), kev), "critical");
  assert.equal(classifyFinding(finding("c", [vuln("G3", { severityRating: "high" })]), kev), "high");
  assert.equal(classifyFinding(finding("d", [vuln("G4", { severityRating: "MODERATE" })]), kev), "other");
  assert.equal(classifyFinding(finding("e", []), kev), "other");
});

test("classifyFinding: KEVの照会に失敗した（空のSet）場合も、Criticalは区別できる", () => {
  assert.equal(classifyFinding(finding("b", [vuln("G2", { severityRating: "CRITICAL" })])), "critical");
});

test("needsHighPriority: KEVまたはCriticalが1件でもあれば true、Highだけなら false", () => {
  assert.equal(needsHighPriority([finding("a", [vuln("G", { severityRating: "HIGH" })])]), false);
  assert.equal(needsHighPriority([finding("a", [vuln("G", { severityRating: "HIGH" })]), finding("b", [vuln("H", { severityRating: "CRITICAL" })])]), true);
});

test("buildNewFindingsComment: KEV・Criticalを先頭に、目印つきで出し、対応期限の目安を示す", () => {
  const kev = new Set(["CVE-2026-0001"]);
  const body = buildNewFindingsComment(
    [
      finding("low-pkg", [vuln("G1", { severityRating: "LOW" })]),
      finding("kev-pkg", [vuln("G2", { cveIds: ["CVE-2026-0001"] })]),
      finding("crit-pkg", [vuln("G3", { severityRating: "CRITICAL" })]),
    ],
    "https://example.com/run/1",
    kev
  );
  const lines = body.split("\n");
  const first = lines.findIndex((l) => l.includes("kev-pkg"));
  const second = lines.findIndex((l) => l.includes("crit-pkg"));
  const third = lines.findIndex((l) => l.includes("low-pkg"));
  assert.ok(first < second && second < third);
  assert.match(body, /\*\*\[KEV（悪用が確認済み）\]\*\* kev-pkg/);
  assert.match(body, /\*\*\[Critical\]\*\* crit-pkg/);
  assert.match(body, new RegExp(`KEVが${DEADLINE_DAYS.kev}日`));
  assert.equal(body.includes("low-pkg@1.0.0"), true);
  // 目印は、全件ぶん（重複通知の防止）
  assert.equal((body.match(/<!-- new-finding:/g) || []).length, 3);
});

test("buildNewFindingsComment: KEV・Criticalが無ければ、強調の見出しを出さない", () => {
  const body = buildNewFindingsComment([finding("x", [vuln("G", { severityRating: "MODERATE" })])], null);
  assert.equal(body.includes("悪用が確認済み"), false);
});
