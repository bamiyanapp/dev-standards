---
name: loop-budget
description: ループ実行の前後でトークン予算と実行ログの消費状況を確認するスキル。予算超過時や実行可能なタスクがない場合は早期終了を強制する。
---

# Loop Budget Guard

各ループ実行の**開始時**と**終了時**に実行する。

## 実行開始時

1. 日次上限とキルスイッチフラグについて `loop-budget.md` を読み取る。
2. `loop-run-log.md` の直近の記録（過去24時間）を読み取る。
3. 今日のアクティブなパターンの `tokens_estimate` を合計する。
4. 消費量がそのパターンの日次上限の80%以上の場合 → **レポート専用モード**（サブエージェントや自動修正なし）に移行する。
5. 消費量が100%以上、または `loop-pause-all` が設定されている場合 → STATE.mdに1行のメモを残して**直ちに終了**する。
6. ウォッチリスト/状態に実行可能な項目がない場合 → **5kトークン未満で終了**する（サブエージェントを生成しない）。

## 実行終了時

`loop-run-log.md` に以下のJSONオブジェクトを1つ追記する：

```json
{
  "run_id": "<ISO8601>",
  "pattern": "<pattern-id>",
  "duration_s": <number>,
  "items_found": <number>,
  "actions_taken": <number>,
  "escalations": <number>,
  "tokens_estimate": <number>,
  "outcome": "no-op | report-only | fix-proposed | escalated"
}
```

## ルール

- `loop-budget.md` の `max sub-agent spawns/run`（1実行あたりの最大サブエージェント生成数）を決して超過しないこと。
- 高頻度パターン（CI Sweeper、PR Babysitter）は、実行可能なアクションがない場合は**必ず**早期終了すること。
- 自己スロットル制限がかかった場合は、`loop-budget.md` の **Alerts This Period** の下に1行追記すること。