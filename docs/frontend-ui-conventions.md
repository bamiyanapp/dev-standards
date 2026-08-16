# フロントエンド共通UI規約

複数プロダクトのフロントエンドで統一しておきたいUI規約をここにまとめる。`docs/shared-ui-components.md`（共有UIコンポーネント）・`docs/vite-react-app-template.md`（スキャフォールドテンプレート）と異なり、コンポーネントや雛形そのものではなく、各プロダクトが独自に実装する際に従うべき仕様を定義する。

## 共通フォント

全プロダクトのフロントエンドで、本文・見出し等の共通フォントとして **M PLUS Rounded 1c** を使用する。

- Google Fonts等から読み込み、CSSの`font-family`へ設定する
- 具体的な組み込み方法（`<link>`タグでの読み込み、`@import`、npm経由でのセルフホスティング等）は各プロダクトの既存の資産管理方針に従う

## トップページの必須構成

各プロダクトのトップページ（ランディングページ）には、以下を必須で表示する。

- **バージョン**: `package.json`の`version`フィールドの値
- **更新日時**: 現在デプロイされているバージョンの最終更新日時

`version`はビルド時に埋め込む（例: Viteの`define`でビルド時に`package.json`を読み込み定数化する等）。更新日時の具体的な取得元（デプロイ日時・最終リリース日時・最終コミット日時等）は各プロダクトの実装に委ねるが、実際にデプロイされているバージョンの更新時点を正しく表すものとする。

## 各プロダクトへの適用

このドキュメントはdev-standards側での規約の明文化のみを行うものであり、各プロダクトへの実際の適用（フォントの組み込み、トップページへのバージョン・更新日時表示の実装）はプロダクト側で個別に対応する。

### 適用状況

`docs/consumer-repositories.md`に列挙された全リポジトリを記載する（特定セッションが確認できたリポジトリのみを書かない。未確認のリポジトリも「未確認」として残し、一覧から漏れないようにする）。

| リポジトリ | 共通フォント | トップページ必須構成 | 備考 |
|---|---|---|---|
| bamiyanapp/dev-standards | 対象外 | 対象外 | dev-standards自身はフロントエンドを持たない |
| bamiyanapp/karuta | 対応中（[PR #1006](https://github.com/bamiyanapp/karuta/pull/1006)、未マージ） | 未対応（対応issue未起票） | 共通フォントはkaruta由来のBootstrapテーマ（`shared/ui/bootstrap-theme.css`、issue #232）にfont-family指定が含まれており、PR #1006でkaruta自身もこの共有CSSへ切り替える形で適用する。トップページのバージョン・更新日時表示はまだ着手していない |
| bamiyanapp/Camp-Stock | 適用済み（[PR #130](https://github.com/bamiyanapp/Camp-Stock/pull/130)） | 適用済み（`frontend/src/App.jsx`の`AppHeader`、規約新設前から実装済みだったことを確認） | - |
