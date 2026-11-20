"use strict";

// dev-standards#1373。定期スキャンは、検知結果を、固定タイトルの単一issueの「本文更新」で反映する。
// issue本文の更新は、GitHubの通知を発生させない。スマホオンリーの運用では、issueを自分から開かない限り、
// 新規検知に気づけない。新規に検知されたものがあるときだけ、issueへコメントを追加する（コメントは通知される）。
//
// 新規検知の判定は、MTTR台帳の差分（updateLedgerのadded）を使う。ただし、台帳のコミットは、PR経由で行われ、
// マージされるまでに時間がかかることがある。その間、同じ項目が、毎回「新規」になる。これを避けるため、
// コメントに、通知済みの項目の目印を埋め込み、すでに通知した項目は、除外する。

const MARKER_PREFIX = "<!-- new-finding:";
const MARKER_SUFFIX = " -->";

function marker(finding) {
  return `${MARKER_PREFIX}${finding.name}@${finding.version}${MARKER_SUFFIX}`;
}

// 既存のコメントの本文から、通知済みの項目（name@version）の集合を取り出す
function extractAnnounced(commentBodies) {
  const announced = new Set();
  for (const body of commentBodies) {
    let from = 0;
    for (;;) {
      const start = body.indexOf(MARKER_PREFIX, from);
      if (start === -1) break;
      const end = body.indexOf(MARKER_SUFFIX, start);
      if (end === -1) break;
      announced.add(body.slice(start + MARKER_PREFIX.length, end));
      from = end + MARKER_SUFFIX.length;
    }
  }
  return announced;
}

// added（新規の検知）から、通知済みを除く
function selectNewFindings(added, commentBodies) {
  const announced = extractAnnounced(commentBodies);
  return added.filter((f) => !announced.has(`${f.name}@${f.version}`));
}

function describeFinding(f) {
  const ids = (f.vulnerabilities || []).map((v) => v.id).filter(Boolean).join(", ");
  const kind = f.direct === undefined ? "" : f.direct ? "直接" : "間接";
  return `- ${f.name}@${f.version}${kind ? `（${kind}）` : ""}${ids ? `: ${ids}` : ""}`;
}

function buildNewFindingsComment(findings, runUrl) {
  const lines = [`## 新規に検知された脆弱性: ${findings.length}件`, "", ...findings.map(describeFinding), ""];
  if (runUrl) lines.push(`検知したrun: ${runUrl}`, "");
  lines.push("対応の状況は、このissueの本文（最新の検知結果）を参照する。", "");
  lines.push(...findings.map(marker));
  return lines.join("\n");
}

module.exports = { marker, extractAnnounced, selectNewFindings, describeFinding, buildNewFindingsComment };
