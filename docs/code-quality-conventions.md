# コード品質規約（lint）

`reusable-ci.yml`が提供するテストカバレッジ閾値（`coverage_threshold`・`e2e_coverage_threshold`）・コード重複検知（`duplication_threshold`）の開発共通標準の目標値は、`docs/cicd-pipeline-specification.md`・`README.md`側の各入力説明に明記されている（テストカバレッジ80%以上・重複率5%以下）。

本ドキュメントは、それらとは別に`reusable-ci.yml`の入力としては存在しない**lintルール自体**（ESLintを使うプロダクトの場合）について、karutaでの実運用を通じて調整済みの構成を、新規プロダクトが「まずはこれに従っておけばよい」基準としてまとめる。

**位置付け**: ここに挙げるルール・しきい値は絶対的な固定値ではなく、実運用で検証済みの参考値。プロダクトの性質（コードベースの規模、既存の技術的負債の量等）に応じて調整してよい。ただし調整する場合は、その理由をプロダクト側の`CLAUDE.md`やissueに残すことを推奨する。

## lint

ESLintを使うプロダクト（`docs/client-only-vite-spa-pattern.md`が新規TypeScriptプロジェクト向けに案内する`oxlint`とは別の、既存のJavaScriptプロジェクト向けの構成）では、以下を標準とする。

- **循環的複雑度**: ESLint組み込みの`complexity`ルールを`error`重要度、しきい値`15`で有効化する
- **`eslint-plugin-sonarjs`**: `recommended`ルールセットをそのまま適用する。認知的複雑度（cognitive complexity）等、`complexity`ルールでは検知できない観点を補う
- **未使用変数**: `no-unused-vars`を`error`重要度で有効化する（フロントエンドではReactのコンポーネント名等、大文字始まりの識別子を除外する`varsIgnorePattern: '^[A-Z_]'`の付与を検討する）
- **lintスクリプト自体は`--max-warnings 0`で実行する**。`warn`重要度のルールを設定しても、この設定がなければ実質的に無視されてしまうため、警告を許容しない運用にはこの指定が必須

新規TypeScriptプロジェクトで`oxlint`を採用する場合も、上記と同等の複雑度検知の考え方（対応するルール・プラグインの有無）を導入時に確認する。

## 参考実装

上記の値は、karutaの以下のファイルで実運用中（本ドキュメント作成時点）。

- `frontend/eslint.config.js`・`backend/eslint.config.js`（複雑度・sonarjs・no-unused-vars）
