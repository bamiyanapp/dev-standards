---
name: development-loop
description: 開発をGoal達成まで進めるための基本ループ（Observe→Plan→Act→Verify→Reflect）を実行するスキル。
---
# Development Loop

目的

開発をGoal達成まで進める。

## Observe

- git status
- git --no-pager diff
- 現在ブランチ確認
- Goalとの差分確認

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

完了前に確認する。

- より簡潔な方法はないか
- 重複コードはないか
- Skillへ反映すべき知見はないか
- CLAUDE.mdを改善すべきか
- プロジェクトルールへ反映すべきか