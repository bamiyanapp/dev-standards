"use strict";

// commitlint.config.cjs・stylelint.config.cjsと同様、参照側リポジトリへsymlinkでそのまま
// 配布する共有textlint設定（sync-manifest.json参照）。プロダクト固有のカスタマイズは
// 想定しておらず、textlint-rule-preset-ja-technical-writingをベースにそのまま使う（issue #433）。
module.exports = {
  rules: {
    "preset-ja-technical-writing": {
      // issue #455: preset既定値の100文字へ300→200→150→100の順に段階的に
      // 引き下げるラチェット方式を採用し、本設定で最終段階（100）へ到達した
      // （Phase 1: issue #509〜514で300→200、Phase 2: 200→150、
      // Phase 3: issue #1127〜1129で150→100、いずれも対象ファイルの長文を
      // 意味・内容を変えず分割して対応した）
      "sentence-length": { max: 100 },
      // issue #455の完了条件に基づき、閾値100到達時点で無効化継続の要否を
      // 再確認した。有効化すると実測106件の違反（1文中に同じ助詞が複数回
      // 登場するケース等）が新たに発生し、いずれも文分割を前提とするルール
      // のため、sentence-lengthの分割だけでは解消できない。大規模な追加
      // 書き直しが必要になるため、現時点では無効化を維持する（再度有効化を
      // 検討する場合は、改めてサブIssueとして分解すること）
      "no-doubled-joshi": false,
      // 同じ理由（長文の文体で読点・カンマが多いケースが多数残っている）で
      // 無効化を維持する
      "max-ten": false,
      "max-comma": false,
      // 本リポジトリの各ドキュメントは全体を通じて常体（「〜する。」等の辞書形終止）で
      // 統一されており、「です」「ます」で終わる文は実測で0件だった。にもかかわらず、
      // 明示的な「である。」止めの文が1〜数件でもあると、このルールは文書全体を
      // ですます調と誤判定し、その「である。」文を逆に指摘する（実測10件、いずれも
      // 対象ファイルの「ですます」実測数は0件）。辞書形終止をですます調の根拠として
      // 数えられない実装上の制約により、常体オンリーの文書では機能しないため無効化する
      "no-mix-dearu-desumasu": false,
    },
    // 【max-lines（textlint-rules/max-lines.js、issue #537）をここに書いてはならない】
    // --rulesdir経由でのみ解決できる独自ルールをこのrulesオブジェクトへ併記すると、
    // 設定ファイル（--config）側のルール解決が「全キーを通常npmパッケージとして
    // 解決しようとし、1つでも失敗すると設定ファイル全体のルールを無言で0件にする」
    // という挙動により、preset-ja-technical-writing側が丸ごと機能しなくなる
    // （issue #595、DEBUG=textlint:cliで実際に再現・確認済み）。max-lines自体は
    // textlint-rules/max-lines.jsが既定値200を自前で持っているため、CLI側の
    // --rulesdir textlint-rulesのみで（このファイルへの追記無しに）有効化される
  },
};
