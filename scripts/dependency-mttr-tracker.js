"use strict";

// issue #1308。dependency-full-scan.js（issue #1095/#1288）は、検知した脆弱性を
// 単一の固定issue（karuta#1855等）へ反映する。だがこのissueは検知内容が変わる
// たびに本文が上書きされる構造のため、「個々の脆弱性がいつ最初に検知され、
// いつ解消されたか」という時系列情報がどこにも残らない。「CVEを確実に検知する」
// 側の仕組み（#1288・#1292）を強化してきた一方、検知後の改善サイクル（対応時間）
// が見えないままだった。
//
// 本モジュールは、スキャン実行ごとに呼び出す「台帳（ledger）」の更新ロジックを
// 提供する。台帳はリポジトリ内のJSONファイル（docs/generated配下）として
// commit-via-pr等で永続化される前提（本モジュール自体はファイルI/Oを行わない。
// 呼び出し元がJSON.parse/JSON.stringifyしたオブジェクトを渡す）。
//
// 「解消」の判定: 脆弱性スキャン結果（name+version単位）から、ある回の実行で
// 消えたエントリを「解消された」とみなす。これは実際の修正コミット・PRマージ日時
// ではなく「次回スキャンで気づいた日時」であるため、スキャン間隔（日次）分の
// 誤差を含む。この誤差は許容する前提とする（dependency-full-scanの実行頻度に
// 依存するため、スキャン頻度を上げれば誤差は小さくなる）。

function findingKey(f) {
  return `${f.name}@${f.version}`;
}

// currentFindings: [{ name, version }]（dependency-full-scan.jsのscanLockFileForVulnerabilities
// の戻り値のサブセットでよい）。ledger: [{ key, name, version, firstDetectedAt }]。
// 戻り値のledgerは次回実行時にそのまま同じ形でファイルへ書き戻せる。resolvedは
// この回で初めて「消えた」と判定されたエントリ（history追記用）。
function updateLedger(ledger, currentFindings, nowIso) {
  const currentKeys = new Set(currentFindings.map(findingKey));
  const ledgerByKey = new Map(ledger.map((e) => [e.key, e]));

  const resolved = [];
  const nextLedger = [];
  for (const entry of ledger) {
    if (currentKeys.has(entry.key)) {
      nextLedger.push(entry);
    } else {
      const detectedAt = new Date(entry.firstDetectedAt).getTime();
      const resolvedAt = new Date(nowIso).getTime();
      const mttrDays = (resolvedAt - detectedAt) / (24 * 60 * 60 * 1000);
      resolved.push({
        name: entry.name,
        version: entry.version,
        detectedAt: entry.firstDetectedAt,
        resolvedAt: nowIso,
        mttrDays,
      });
    }
  }

  for (const f of currentFindings) {
    const key = findingKey(f);
    if (!ledgerByKey.has(key)) {
      nextLedger.push({ key, name: f.name, version: f.version, firstDetectedAt: nowIso });
    }
  }

  return { ledger: nextLedger, resolved };
}

// history: updateLedgerのresolvedをappendし続けた配列。sinceIso以降に解消された
// エントリのみを対象に、件数・平均MTTR（日数）を集計する。該当0件の場合、
// averageMttrDaysはnull（0件を0日と表示すると「解消は速かった」という誤った
// 印象を与えるため区別する）。
function summarizeMttr(history, sinceIso) {
  const since = new Date(sinceIso).getTime();
  const inWindow = history.filter((e) => new Date(e.resolvedAt).getTime() >= since);
  if (inWindow.length === 0) {
    return { count: 0, averageMttrDays: null };
  }
  const totalDays = inWindow.reduce((sum, e) => sum + e.mttrDays, 0);
  return { count: inWindow.length, averageMttrDays: totalDays / inWindow.length };
}

module.exports = { findingKey, updateLedger, summarizeMttr };
