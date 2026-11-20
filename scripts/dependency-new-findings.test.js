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
