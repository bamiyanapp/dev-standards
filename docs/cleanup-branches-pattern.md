# 不要なブランチを一覧にして、まとめて削除する

マージ・クローズ済みのPRのブランチを、一覧にして、まとめて削除する（[#1682](https://github.com/bamiyanapp/dev-standards/issues/1682)）。スマホのGitHub画面では1本ずつしか消せないため、手動実行の薄いworkflowから呼ぶ。

```yaml
on:
  workflow_dispatch:
    inputs:
      dry_run:
        type: boolean
        default: true

permissions:
  contents: write
  pull-requests: read

jobs:
  cleanup:
    uses: bamiyanapp/dev-standards/.github/workflows/reusable-cleanup-branches.yml@v1.0.0
    with:
      dry_run: ${{ inputs.dry_run }}
```

| 入力 | 説明 | デフォルト |
|---|---|---|
| `dry_run` | `true`なら、削除せず、候補を一覧にするだけ | `true` |
| `keep_regex` | 削除しないブランチ名の正規表現 | Claudeの作業用ブランチ・`e2e-screenshots`・`docs-diagrams*`・`gh-pages` |

削除するのは、閉じたPRのheadだったブランチと、既定ブランチへ完全にマージ済みのブランチである。開いているPRのhead・既定ブランチ・保護ブランチ・`keep_regex`に一致するものは、残す。上の条件に当たらない未マージのブランチは、「要確認」として一覧に出すだけで、削除しない。結果は、Job Summaryとジョブログの表で見る。このworkflowは`permissions`を宣言しない。呼び出し側のjobに、`contents: write`と`pull-requests: read`を与えること。

## 関連

- [`reusable-workflows-reference.md`](reusable-workflows-reference.md): 再利用workflowの一覧
- 元のissue: [#1682](https://github.com/bamiyanapp/dev-standards/issues/1682)、karuta#2442
