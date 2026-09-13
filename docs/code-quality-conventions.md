# コード品質規約（lint・stylelint・CodeQL・textlint）

`reusable-ci.yml`が提供するテストカバレッジ閾値（`coverage_threshold`・`e2e_coverage_threshold`）・コード重複検知（`duplication_threshold`）の開発共通標準の目標値は、`docs/cicd-pipeline-specification.md`・`docs/reusable-workflows-reference.md`側の各入力説明に明記されている（テストカバレッジ80%以上・重複率5%以下）。

本ドキュメントは、それらとは別に`reusable-ci.yml`の入力としては存在しない**lintルール自体**（ESLintを使うプロダクトの場合）について、karutaでの実運用を通じて調整済みの構成を、新規プロダクトが「まずはこれに従っておけばよい」基準としてまとめる。

**位置付け**: ここに挙げるルール・しきい値は絶対的な固定値ではなく、実運用で検証済みの参考値。プロダクトの性質（コードベースの規模、既存の技術的負債の量等）に応じて調整してよい。ただし調整する場合は、その理由をプロダクト側の`CLAUDE.md`やissueに残すことを推奨する。

## lint

ESLintを使うプロダクト（`docs/client-only-vite-spa-pattern.md`が新規TypeScriptプロジェクト向けに案内する`oxlint`とは別の、既存のJavaScriptプロジェクト向けの構成）では、以下を標準とする。

- **循環的複雑度**: ESLint組み込みの`complexity`ルールを`error`重要度、しきい値`15`で有効化する
- **`eslint-plugin-sonarjs`**: `recommended`ルールセットをそのまま適用する。認知的複雑度（cognitive complexity）等、`complexity`ルールでは検知できない観点を補う
- **未使用変数**: `no-unused-vars`を`error`重要度で有効化する（フロントエンドではReactのコンポーネント名等、大文字始まりの識別子を除外する`varsIgnorePattern: '^[A-Z_]'`の付与を検討する）
- **lintスクリプト自体は`--max-warnings 0`で実行する**。`warn`重要度のルールを設定しても、この設定がなければ実質的に無視されてしまうため、警告を許容しない運用にはこの指定が必須

新規TypeScriptプロジェクトで`oxlint`を採用する場合も、上記と同等の複雑度検知の考え方（対応するルール・プラグインの有無）を導入時に確認する。

## stylelint

CSSを直接記述するプロダクト（Bootstrap採用プロダクト等。Tailwind CSS/daisyUI構成でユーティリティクラスのみを使い、独自CSSファイルをほぼ持たないプロダクトでは省略してよい）では、`stylelint`を導入する。

- **共有設定**: `commitlint.config.cjs`と同様、dev-standardsルートの`stylelint.config.cjs`をsymlinkでそのまま利用する（`sync-manifest.json`にエントリ済み。プロダクト固有のカスタマイズは想定しない）
- **ベース**: `stylelint-config-standard`をそのまま適用する
- **lintスクリプト**: `stylelint --config stylelint.config.cjs "src/**/*.css"`のように、プロダクトのCSSファイルを対象に実行する。ESLintと同様、警告を許容しない運用にする場合は`--max-warnings`相当（stylelintには専用オプションが無いため、`severity: "error"`で統一しwarnルールを持たない）
- **dev-standards由来のsymlink（`bootstrap-theme.css`・`common-theme.css`等）は、参照側リポジトリでのlint対象から除外してよい**。これらはdev-standards側が実体を所有・lintしており（本ドキュメント作成時点で`shared/ui/*.css`に対し`npm test`内で実行）、参照側で指摘が出てもその場で修正できない（symlink先の実体を書き換えることになり、submodule経由の変更が必要なため）

## CodeQL

ESLint・stylelintが構文・スタイルレベルの静的解析であるのに対し、CodeQLはデータフロー解析により**セキュリティ脆弱性・バグパターンを検知する**、性質の異なる静的解析。全プロダクトで導入を標準とする。

- **導入方法**: `reusable-codeql.yml`を呼び出す（呼び出し方・入力パラメータ`languages`は`docs/reusable-workflows-reference.md`「`reusable-codeql.yml`」を参照）
- **トリガー**: 参照側の`.github/workflows/codeql.yml`自体の`on:`に`push`（`base_branch`）・`pull_request`・`schedule`（週次等）を設定する。`schedule`はコード変更が無い期間もCodeQLのクエリセット自体の更新を検知するために推奨する
- **権限**: 呼び出し元ジョブに`permissions: { security-events: write, actions: read, contents: read }`を明示する。省略するとリポジトリ既定の`GITHUB_TOKEN`権限（`security-events: write`を含まない）が上限になり、SARIFのGitHub Securityタブへのアップロードが失敗する
- **マージゲートとの関係**: `reusable-ci.yml`の`merge` jobのゲートには関与しない（`docs/cicd-pipeline-specification.md`参照）。CodeQLを必須チェックにするかどうかは参照側リポジトリのブランチ保護設定（Required status checks）側の責務

## textlint

Markdownドキュメント（`docs/*.md`・`README.md`・`.claude/skills/**/*.md`等）を持つプロダクトでは、`textlint`を導入する。

- **共有設定**: `commitlint.config.cjs`・`stylelint.config.cjs`と同様、dev-standardsルートの`textlint.config.cjs`をsymlinkでそのまま利用する（`sync-manifest.json`にエントリ済み。プロダクト固有のカスタマイズは想定しない）
- **ベース**: `textlint-rule-preset-ja-technical-writing`をベースとし、以下のルールを無効化する
  - `sentence-length`・`no-doubled-joshi`・`max-ten`・`max-comma`: dev-standardsのドキュメントは、issue/PR番号や過去の経緯を伴う因果関係の説明を1文に埋め込む文体を意図的に採用しており（実測で1文最大555文字）、この文体では長い文・同じ助詞の複数回登場・読点/カンマの多用が常態化する。文分割を前提とするこれらのルールは、この文体そのものを否定してしまうため無効化する
  - `no-mix-dearu-desumasu`: 本ルールは「です」「ます」で終わる文を実装上の判定根拠にしており、常体（「〜する。」等の辞書形終止）のみで書かれた文書では判定材料が無く、明示的な「である。」文をむしろ誤検知する。dev-standardsの各ドキュメントは全体を通じて常体で統一されているため無効化する
- **CIへの組み込み**: stylelintのように参照側リポジトリのpackage.jsonへtextlint本体を追加する必要はない。`reusable-ci.yml`の`enable_text_lint: true`・`text_lint_paths`（`mermaid_doc_paths`と同形式のカンマ/改行区切りglob）を指定するだけで、`text-lint` jobがnpx経由でtextlint本体・presetを取得し実行する（詳細は`docs/reusable-workflows-reference.md`「`reusable-ci.yml`」・`docs/cicd-pipeline-specification.md`「1. CIワークフロー」参照）
- **導入前の確認**: 上記の無効化理由は、いずれも「長い複文・常体で統一する」というdev-standardsの文体を前提にしている。プロダクト側のドキュメントがですます調中心、または短文中心の文体を採用している場合は、この共有設定をそのまま使わず、プロダクト側で個別に調整することを検討する

## 参考実装

上記の値は、karutaの以下のファイルで実運用中（本ドキュメント作成時点）。

- `frontend/eslint.config.js`・`backend/eslint.config.js`（複雑度・sonarjs・no-unused-vars）
- `stylelint.config.cjs`（dev-standardsルート、symlink経由でkarutaへ導入。`shared/ui/*.css`はdev-standards自身の`npm test`で検証）
- `.github/workflows/codeql.yml`（`reusable-codeql.yml`呼び出し、`push`/`pull_request`/週次`schedule`トリガー）
- `textlint.config.cjs`（dev-standardsルート。dev-standards自身も参照側リポジトリと同じ`reusable-ci.yml`の`enable_text_lint`・`text_lint_paths`（`text-lint` job）経由で`docs/*.md`・`README.md`・`CLAUDE.md`・`.claude/skills/**/*.md`を検証する。CIの実行経路を一本化するため、`npm test`側の重複実行は行わない（`npm run lint:text`はローカルでの手動実行用に残す）。参照側リポジトリでの実際の有効化は今後の課題）
