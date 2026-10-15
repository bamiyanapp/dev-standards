"use strict";

// reusable-rollback-to-stable.yml（force_stable相当のkill switch）がtrueに設定
// されたまま長時間放置されていないかを判定する純粋関数。KVS自体には設定時刻が
// 無いため、「trueを設定するworkflow」「falseを設定するworkflow（戻す側）」
// それぞれの直近の成功実行時刻を比較し、trueの実行がfalseの実行より新しければ
// 「trueのまま放置中」とみなす（karuta#1662・karuta#1663・dev-standards#950）。
//
// trueRunTimestamps/falseRunTimestampsはISO 8601文字列の配列（新しい順でなくてよい）。
// nowIsoは呼び出し時点の現在時刻（テスト容易性のため注入する）。
function evaluateStaleness(trueRunTimestamps, falseRunTimestamps, maxAgeHours, nowIso) {
  const latestTrue = latestTimestamp(trueRunTimestamps);
  const latestFalse = latestTimestamp(falseRunTimestamps);

  if (!latestTrue) {
    return { stale: false, sinceIso: null, hoursElapsed: null, reason: "trueに設定した実行が見つからない" };
  }
  if (latestFalse && latestFalse >= latestTrue) {
    return { stale: false, sinceIso: null, hoursElapsed: null, reason: "falseへ戻す実行の方が新しい（通常運用中）" };
  }

  const now = new Date(nowIso);
  const since = new Date(latestTrue);
  const hoursElapsed = (now.getTime() - since.getTime()) / (1000 * 60 * 60);

  return {
    stale: hoursElapsed > maxAgeHours,
    sinceIso: latestTrue,
    hoursElapsed,
    reason: null,
  };
}

function latestTimestamp(isoStrings) {
  if (!isoStrings || isoStrings.length === 0) {
    return null;
  }
  return isoStrings.reduce((latest, current) => (current > latest ? current : latest));
}

function formatSummary(result, maxAgeHours) {
  if (result.reason) {
    return `kill switchは現在trueに設定されていない（${result.reason}）。`;
  }
  const hours = result.hoursElapsed.toFixed(1);
  if (result.stale) {
    return (
      `⚠️ kill switchが${result.sinceIso}からtrueのまま${hours}時間放置されている` +
      `（放置許容時間: ${maxAgeHours}時間）。戻し忘れの可能性がないか確認すること。`
    );
  }
  return `kill switchは${result.sinceIso}からtrueだが、放置許容時間（${maxAgeHours}時間）以内（経過: ${hours}時間）。`;
}

module.exports = { evaluateStaleness, formatSummary };
