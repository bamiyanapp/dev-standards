"use strict";

// issue #646（OSS依存更新の自動安全判定基盤 Phase 1）Task F。
// ジョブレベルで「failureの原因が既知のflakyパターンと一致する可能性があるか」を
// Risk Summaryへ注記するための登録簿。
//
// ジョブの個別ログ・テスト名までは参照しない（ログ取得にはGitHub Actions APIの
// 追加呼び出しと解析コストが発生し、Phase 1のスコープ「API呼び出し無しで取得できる
// 情報の集約」を超えるため）。「このjobがfailureの場合、過去に繰り返し観測されている
// 既知のflaky原因がある」という事実をjob単位で示すにとどめる。自動的にskip・
// 再実行するのではなく、Human Reviewへ回った際に「まずこれを疑う」という一次情報を
// 添えることが目的（issue #645「8-5」参照）。
//
// 新しい既知パターンが判明した場合はここへ追記する（Phase 4「Human Reviewを学習対象に
// する」の運用が整うまでは、このセッション・開発者が気づいた都度、手動で追記する）
const KNOWN_FLAKY_PATTERNS = [
  {
    jobKey: "frontendE2eTest",
    description:
      "Pollyコールドキャッシュ起因のタイムアウト。実行頻度の低いE2Eカテゴリで、" +
      "音声合成の実処理待ちが60秒枠を超えることがある。karuta側では該当テストを" +
      "条件付きskipする対策を導入済みだが、別リポジトリの同種E2E構成でも起こりうる" +
      "ため一般的な既知パターンとして登録する",
    issueRef: "bamiyanapp/karuta#972",
  },
];

// jobKeyに対応する既知flakyパターンを返す（通常0件または1件。将来的に同一jobへ
// 複数パターンが登録されることも想定し配列で返す）
function findKnownFlakyPatterns(jobKey) {
  return KNOWN_FLAKY_PATTERNS.filter((p) => p.jobKey === jobKey);
}

module.exports = { KNOWN_FLAKY_PATTERNS, findKnownFlakyPatterns };
