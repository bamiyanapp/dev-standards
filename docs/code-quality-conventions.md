# コード品質規約（lint・テストカバレッジ・重複検知）

`reusable-ci.yml`はlintの複雑度チェック・テストカバレッジ閾値（`coverage_threshold`等）・コード重複検知（`duplication_threshold`）を各リポジトリ側で設定できる仕組みを提供しているが、「どの値を標準とすべきか」はこれまで明文化されていなかった。本ドキュメントは、karutaでの実運用を通じて調整済みの値を、新規プロダクトが「まずはこれに従っておけばよい」基準としてまとめる。

**位置付け**: ここに挙げる数値・ルールセットは絶対的な固定値ではなく、実運用で検証済みの参考値。プロダクトの性質（コードベースの規模、既存の技術的負債の量等）に応じて調整してよい。ただし調整する場合は、その理由をプロダクト側の`CLAUDE.md`やissueに残すことを推奨する。

## lint

ESLintを使うプロダクト（`docs/client-only-vite-spa-pattern.md`が新規TypeScriptプロジェクト向けに案内する`oxlint`とは別の、既存のJavaScriptプロジェクト向けの構成）では、以下を標準とする。

- **循環的複雑度**: ESLint組み込みの`complexity`ルールを`error`重要度、しきい値`15`で有効化する
- **`eslint-plugin-sonarjs`**: `recommended`ルールセットをそのまま適用する。認知的複雑度（cognitive complexity）等、`complexity`ルールでは検知できない観点を補う
- **未使用変数**: `no-unused-vars`を`error`重要度で有効化する（フロントエンドではReactのコンポーネント名等、大文字始まりの識別子を除外する`varsIgnorePattern: '^[A-Z_]'`の付与を検討する）
- **lintスクリプト自体は`--max-warnings 0`で実行する**。`warn`重要度のルールを設定しても、この設定がなければ実質的に無視されてしまうため、警告を許容しない運用にはこの指定が必須

新規TypeScriptプロジェクトで`oxlint`を採用する場合も、上記と同等の複雑度・重複検知の考え方（他言語・他ツールでの対応手段の有無）を導入時に確認する。

## テストカバレッジ

`reusable-ci.yml`の`coverage_threshold`系入力（`docs/cicd-pipeline-specification.md`参照）を用いて、以下を標準とする。

- **ユニットテスト**: `coverage_threshold: 80`（%）、`coverage_metrics: "statements,functions,lines"`
  - `branches`は`@vitest/coverage-v8`等のカバレッジツールによっては実行のたびに指標が変動しうるため、判定対象から意図的に除外し、表示のみ行う運用を推奨する
- **E2Eテスト（Playwright等）**: `e2e_coverage_threshold: 65`（%）、`e2e_coverage_metrics: "statements,functions,lines"`
  - ユニットテストより低い値を設定するのは、E2Eの性質上（実際のユーザー操作をなぞるシナリオベースのテストのため、全コードパスを網羅する目的のユニットテストほど高い値を求めない）意図的な差
- 特定のファイルだけカバレッジが著しく低くても全体平均に埋もれて見過ごされる問題を避けたい場合は、`coverage_check_per_file: true`を有効化し、ファイル単位でも同じ基準で判定する

## コード重複検知

`reusable-ci.yml`の`enable_duplication_check: true`・`duplication_threshold`（jscpd、%単位）を用いて、以下を標準とする。

- **`duplication_threshold: 1`**（%）。プロダクトコードのみが対象で、テストコード（`*.test.js`等、`*.spec.js`等、`e2e`ディレクトリ配下）は判定対象から除外される（テストコードの重複はArrange-Act-Assert等の意図的な繰り返しであることが多く、プロダクトコードの重複とは性質が異なるため）
- 導入直後で既存の重複が多い場合は、`duplication_threshold`を未指定（`0`、既定値）のままレポート表示のみの状態から始め、実際の重複を解消しながら段階的に`1`へ引き下げていくことも検討する

## 参考実装

上記の値は、karutaの以下のファイルで実運用中（本ドキュメント作成時点）。

- `frontend/eslint.config.js`・`backend/eslint.config.js`（複雑度・sonarjs・no-unused-vars）
- `.github/workflows/ci.yml`（`coverage_threshold`・`coverage_metrics`・`e2e_coverage_threshold`・`e2e_coverage_metrics`・`enable_duplication_check`・`duplication_threshold`）
