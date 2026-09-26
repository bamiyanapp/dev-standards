# コード品質規約（lint・stylelint・CodeQL・textlint・dependency-cruiser）

`reusable-ci.yml`が提供するテストカバレッジ閾値（`coverage_threshold`・`e2e_coverage_threshold`）には目標値がある。コード重複検知（`duplication_threshold`）にも同様に目標値がある。目標値はテストカバレッジ80%以上・重複率5%以下である。この目標値は`docs/cicd-pipeline-specification.md`・`docs/reusable-workflows-reference.md`側の各入力説明に明記されている。

本ドキュメントは、それらとは別に`reusable-ci.yml`の入力としては存在しない**lintルール自体**を扱う。karutaでの実運用を通じて調整済みの構成を、新規プロダクトが「まずはこれに従っておけばよい」基準としてまとめる。

**位置付け**: ここに挙げるルール・しきい値は絶対的な固定値ではなく、実運用で検証済みの参考値。プロダクトの性質（コードベースの規模、既存の技術的負債の量等）に応じて調整してよい。ただし調整する場合は、その理由をプロダクト側の`CLAUDE.md`やissueに残すことを推奨する。

## lint

ESLintを標準とする（新規TypeScriptプロジェクトを含む全プロダクト）。`docs/client-only-vite-spa-pattern.md`「lint」に設定例がある。

- **循環的複雑度**: ESLint組み込みの`complexity`ルールを`error`重要度、しきい値`15`で有効化する
- **`eslint-plugin-sonarjs`**: `recommended`ルールセットをそのまま適用する。認知的複雑度（cognitive complexity）等、`complexity`ルールでは検知できない観点を補う
- **未使用変数**: `no-unused-vars`（TypeScriptプロジェクトでは`@typescript-eslint/no-unused-vars`）を`error`重要度で有効化する。フロントエンドではReactのコンポーネント名等、大文字始まりの識別子を除外する`varsIgnorePattern: '^[A-Z_]'`の付与を検討する
- **ファイルサイズ**: ESLint組み込みの`max-lines`ルールを`error`重要度で有効化する（issue #530）。複雑度（`complexity`・cognitive complexity）は1関数の複雑さを検知するルールである。小さな関数・コンポーネントが大量に詰め込まれ肥大化した1ファイル自体は検知できない。そのため、分割を促す別軸の観点として追加する。他プロダクトでの実測値に基づくラチェット値がまだ無い。そのためしきい値はESLint公式の既定値を出発点とする。`{ max: 300, skipBlankLines: true, skipComments: true }`（コメント・空行を除いた実効300行）である
- **lintスクリプト自体は`--max-warnings 0`で実行する**。`warn`重要度のルールを設定しても、この設定がなければ実質的に無視されてしまうため、警告を許容しない運用にはこの指定が必須

**経緯**: 以前は新規TypeScriptフロントエンドプロジェクトに`oxlint`を案内していた。その後、フロントエンドのlintもESLintへ統一する方針に変更した。詳細は[bamiyanapp/dev-standards#483](https://github.com/bamiyanapp/dev-standards/issues/483)を参照。既に`oxlint`を導入済みのプロダクトは、移行の要否・時期をプロダクト側で判断してよい。

## stylelint

CSSを直接記述するプロダクト（Bootstrap採用プロダクト等）では、`stylelint`を導入する。Tailwind CSS/daisyUI構成でユーティリティクラスのみを使い、独自CSSファイルをほぼ持たないプロダクトでは省略してよい。

- **共有設定**: `commitlint.config.cjs`と同様、dev-standardsルートの`stylelint.config.cjs`をsymlinkでそのまま利用する。`sync-manifest.json`にエントリ済みである。プロダクト固有のカスタマイズは想定しない
- **ベース**: `stylelint-config-standard`をそのまま適用する
- **lintスクリプト**: `stylelint --config stylelint.config.cjs "src/**/*.css"`のように、プロダクトのCSSファイルを対象に実行する。ESLintと同様、警告を許容しない運用にする場合は`--max-warnings`相当の対応が必要である。stylelintには専用オプションが無いため、`severity: "error"`で統一しwarnルールを持たない
- **dev-standards由来のsymlink（`bootstrap-theme.css`・`common-theme.css`等）は、参照側リポジトリでのlint対象から除外してよい**。これらはdev-standards側が実体を所有・lintしている（本ドキュメント作成時点で`shared/ui/*.css`に対し`npm test`内で実行）。そのため、参照側で指摘が出てもその場で修正できない（symlink先の実体を書き換えることになり、submodule経由の変更が必要なため）

## CodeQL

ESLint・stylelintが構文・スタイルレベルの静的解析であるのに対し、CodeQLはデータフロー解析により**セキュリティ脆弱性・バグパターンを検知する**、性質の異なる静的解析。全プロダクトで導入を標準とする。

- **導入方法**: `reusable-codeql.yml`を呼び出す。呼び出し方・入力パラメータ`languages`は`docs/reusable-workflows-reference.md`「`reusable-codeql.yml`」を参照
- **トリガー**: 参照側の`.github/workflows/codeql.yml`自体の`on:`に`push`（`base_branch`）・`pull_request`・`schedule`（週次等）を設定する。`schedule`はコード変更が無い期間もCodeQLのクエリセット自体の更新を検知するために推奨する
- **権限**: 呼び出し元ジョブに`permissions: { security-events: write, actions: read, contents: read }`を明示する。省略するとリポジトリ既定の`GITHUB_TOKEN`権限（`security-events: write`を含まない）が上限になり、SARIFのGitHub Securityタブへのアップロードが失敗する
- **マージゲートとの関係**: `reusable-ci.yml`の`merge` jobのゲートには関与しない（`docs/cicd-pipeline-specification.md`参照）。CodeQLを必須チェックにするかどうかは参照側リポジトリのブランチ保護設定（Required status checks）側の責務

## textlint

Markdownドキュメント（`docs/*.md`・`README.md`・`.claude/skills/**/*.md`等）を持つプロダクトでは、`textlint`を導入する。

- **共有設定**: `commitlint.config.cjs`・`stylelint.config.cjs`と同様の扱いである。dev-standardsルートの`textlint.config.cjs`をsymlinkでそのまま利用する（`sync-manifest.json`にエントリ済み）。プロダクト固有のカスタマイズは想定しない
- **ベース**: `textlint-rule-preset-ja-technical-writing`をベースとし、以下のとおり調整する
  - `sentence-length`: **最終的な必須目標はpreset既定値の100文字であり、緩和や恒久的な例外化はしない**。既存ドキュメントには、issue/PR番号や過去の経緯を伴う因果関係の説明を1文に埋め込む冗長な文体が残っている。それも広範囲に及ぶ。一度に100文字以内へ書き直すのは非現実的なため、issue #455で300→200→150→100の順に段階的に閾値を引き下げるラチェット方式を採用している。現在値は150（issue #455のPhase 2でissue #509〜514により対象ファイルの文を分割し、200→150への引き下げを完了した）で、あくまで途中経過であり最終的な着地点ではない
  - `no-doubled-joshi`・`max-ten`・`max-comma`: 上記の長い複文の文体では、1文中に同じ助詞が複数回登場する・読点/カンマが4つ以上になる文が常態化する。いずれも文分割を前提とするルールであり、`sentence-length`を無効化ではなく150文字までの複文を許容する方針にした以上、これらのルールも同じ理由で無効化する
  - `no-mix-dearu-desumasu`: 本ルールは「です」「ます」で終わる文を実装上の判定根拠にしている。常体（「〜する。」等の辞書形終止）のみで書かれた文書では判定材料が無く、明示的な「である。」文をむしろ誤検知する。dev-standardsの各ドキュメントは全体を通じて常体で統一されているため無効化する
- **ファイルサイズ**: 独自ルール`textlint-rules/max-lines.js`（issue #537）を`--rulesdir textlint-rules`経由で読み込む。`error`重要度で有効化する。ESLintの`max-lines`（コード側、上記「lint」参照）と同じ狙いだが、textlint本体・presetにはファイル全体の行数を検知するルールが無いため独自に実装した。コードフェンス（` ```mermaid `等の図・コードブロック）・テーブル行は、性質上まとまった行数を要する一方、分割によって可読性が上がるものではないため、行数カウントから除外する。しきい値は200行（コードフェンス・テーブル・空行を除いた実効行数）である。dev-standards自身の現状最大ファイル（`docs/cicd-pipeline-specification.md`、実効178行）に対しわずかな余裕を持たせたラチェット値
  - **【重要】`max-lines`を`textlint.config.cjs`の`rules`オブジェクトへ書いてはならない**（issue #595）。`--rulesdir`経由でのみ解決できる独自ルールを設定ファイルの`rules`へ併記すると問題が起きる。textlintの設定ファイル読み込み処理は「宣言された全ルールを通常のnpmパッケージとして解決しようとし、1つでも失敗すると設定ファイル全体のルールを無言で0件にする」という挙動をとる。この結果、`preset-ja-technical-writing`側が丸ごと機能しなくなる（CIは常に成功を返すため気付きにくい）。`max-lines`自体は`options.max || 200`で既定値を自前で持っているため、`--rulesdir textlint-rules`を渡すだけで（設定ファイルへの追記無しに）有効化される
- **CIへの組み込み**: stylelintのように参照側リポジトリのpackage.jsonへtextlint本体を追加する必要はない。`reusable-ci.yml`の`enable_text_lint: true`を指定するだけでよい。`text_lint_paths`（`mermaid_doc_paths`と同形式のカンマ/改行区切りglob）も指定する。`text-lint` jobがnpx経由でtextlint本体・presetを取得し、`--rulesdir textlint-rules`で独自ルールも合わせて実行する。詳細は`docs/reusable-workflows-reference.md`「`reusable-ci.yml`」を参照。`docs/cicd-pipeline-specification.md`「1. CIワークフロー」も参照
- **導入前の確認**: 上記の調整・無効化理由は、いずれも「長い複文・常体で統一する」というdev-standardsの文体を前提にしている。プロダクト側のドキュメントがですます調中心、または短文中心の文体を採用している場合は、この共有設定をそのまま使わず、プロダクト側で個別に調整することを検討する

## アーキテクチャ違反検知（dependency-cruiser）

npm workspacesモノレポ（`frontend/`・`backend/`が同一リポジトリ）を採用するプロダクトでは、`dependency-cruiser`を導入する（issue #523）。

- **共有設定**: `commitlint.config.cjs`・`stylelint.config.cjs`・`textlint.config.cjs`と同様の方式である。dev-standardsルートの`dependency-cruiser.config.cjs`をsymlinkでそのまま利用する（`sync-manifest.json`にエントリ済み）。プロダクト固有のカスタマイズは想定しない
- **検知対象**: 循環依存と、`frontend/`↔`backend/`間の越境import（frontend側からbackend内部モジュールへの直接import等）の2種類
- **単一パッケージ構成では該当しない**: frontend/backendの単一パッケージ構成（`docs/client-only-vite-spa-pattern.md`）を考える。この構成では越境importルールの対象パスが存在しない。循環依存の検知のみが有効に働く
- **CIへの組み込み**: `reusable-ci.yml`の`enable_architecture_check: true`を指定するだけでよい。`architecture-check` jobがnpx経由でdependency-cruiser本体を取得し実行するため、devDependenciesへの追加は不要。詳細は`docs/reusable-workflows-reference.md`「`reusable-ci.yml`」を参照。`docs/cicd-pipeline-specification.md`「1. CIワークフロー」も参照

## 参考実装

上記の値は、karutaの以下のファイルで実運用中（本ドキュメント作成時点）。

- `frontend/eslint.config.js`・`backend/eslint.config.js`（複雑度・sonarjs・no-unused-vars）
- `stylelint.config.cjs`（dev-standardsルート）はsymlink経由でkarutaへ導入する。`shared/ui/*.css`はdev-standards自身の`npm test`で検証する
- `.github/workflows/codeql.yml`（`reusable-codeql.yml`呼び出し、`push`/`pull_request`/週次`schedule`トリガー）
- `textlint.config.cjs`（dev-standardsルート）。dev-standards自身も参照側リポジトリと同じ`reusable-ci.yml`の`enable_text_lint`・`text_lint_paths`（`text-lint` job）経由で検証する。対象は`docs/*.md`・`README.md`・`CLAUDE.md`・`.claude/skills/**/*.md`。CIの実行経路を一本化するため、`npm test`側の重複実行は行わない（`npm run lint:text`はローカルでの手動実行用に残す）。参照側リポジトリでの実際の有効化例: karuta issue #1179・[PR #1180](https://github.com/bamiyanapp/karuta/pull/1180)で同じ`enable_text_lint`・`text_lint_paths`を導入済み）
