---
name: development-loop
description: 開発をGoal達成まで進めるための基本ループ（Observe→Plan→Act→Verify→Reflect）を実行するスキル。
---
# Development Loop

## 目的

開発をGoal達成まで進める。

## Observe

- git status
- git --no-pager diff
- 現在ブランチ確認
- Goalとの差分確認
- 直前のツール呼び出しが割り込み（拒否・エラー・セッション再起動等）で中断していた場合、
  次の一手を実行する前に「直前に何を試みていたか」を一度整理する。特に、ツールのスキーマが既に読み込み済み（`<functions>`ブロックで確認済み、または直前に読み込みに成功済み）であれば、同じツールに対して`ToolSearch`を再度呼び出さない。直接そのツールを呼び出す（スキーマ取得だけを繰り返す無駄なループに陥っていないか自己点検する）

## Plan

- 要件整理
- **新規の機能・設計パターンに着手する前に、dev-standardsの[`README.md`](https://github.com/bamiyanapp/dev-standards/blob/main/README.md)「ドキュメント目次」を実装対象のキーワードで検索し、既存のゴールデンパス・コピー＆調整用テンプレートが無いか確認する**（issue #864）。既存ドキュメントが見つかった場合はそれに従って実装する。見つからない場合でも、実装後のReflectionで新規ドキュメント化すべきか検討する（CLAUDE.md「Reflection」節参照）
- 設計決定
- 設計がスマホのみの開発環境で実行・検証可能か確認する（CLAUDE.md「開発環境の制約（スマホオンリー）」参照。CLIやデスクトップ限定の手動確認を前提としないこと）
- ブランチ作成

## Act

- 実装
- テスト追加

## Verify

verifier Skillを使用する。

## Reflect

CLAUDE.md「Reflection」節のチェック項目を確認する（完了前チェックの正本はCLAUDE.md側であり、本Skillでは重複記載しない）。