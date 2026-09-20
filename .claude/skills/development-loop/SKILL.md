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
  次の一手を実行する前に「直前に何を試みていたか」を一度整理する。特に、ツールのスキーマが
  既に読み込み済み（`<functions>`ブロックで確認済み、または直前に読み込みに成功済み）で
  あれば、同じツールに対して`ToolSearch`を再度呼び出さず、直接そのツールを呼び出す
  （スキーマ取得だけを繰り返す無駄なループに陥っていないか自己点検する）

## Plan

- 要件整理
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