# フロントエンド共通UI規約

複数プロダクトのフロントエンドで統一しておきたいUI規約をここにまとめる。[`shared-ui-components.md`](shared-ui-components.md)（共有UIコンポーネント）とは異なる。[`client-only-vite-spa-pattern.md`](client-only-vite-spa-pattern.md)（スキャフォールド構成）とも異なる。コンポーネントや雛形そのものではなく、各プロダクトが独自に実装する際に従うべき仕様を定義する。

## 共通フォント

全プロダクトのフロントエンドで、本文・見出し等の共通フォントとして **M PLUS Rounded 1c** を使用する。

- Google Fonts等から読み込み、CSSの`font-family`へ設定する
- 具体的な組み込み方法（`<link>`タグでの読み込み、`@import`、npm経由でのセルフホスティング等）は各プロダクトの既存の資産管理方針に従う

## トップページの必須構成

各プロダクトのトップページ（ランディングページ）には、以下を必須で表示する。

- **バージョン**: `package.json`の`version`フィールドの値
- **更新日時**: 現在デプロイされているバージョンの最終更新日時

`version`はビルド時に埋め込む。Viteを使うプロダクトは`shared/ui/getAppVersionDefine.js`・`shared/ui/formatBuildTime.js`を利用する。詳細は[`shared-ui-components.md`](shared-ui-components.md)を参照。`package.json`の読み込み・`define`埋め込み・表示用の日時整形を個別実装せず共有する。更新日時の具体的な取得元（デプロイ日時・最終リリース日時・最終コミット日時等）は各プロダクトの実装に委ねる。実際にデプロイされているバージョンの更新時点を正しく表すものとする（上記共有ヘルパーはビルド時刻を使う）。

## バージョン情報の外部公開（任意、ブルーグリーン運用等向け）

`getAppVersionDefine.js`が埋め込む`__APP_VERSION__`はViteの`define`でJSバンドルへ直接埋め込まれる値であり、`index.html`自体には一切現れない。そのため`curl`等JSを実行しない方法では外部から取得できない。

[`blue-green-stage-pattern.md`](blue-green-stage-pattern.md)のようにstable/canary等、複数stageを並行デプロイする構成を考える。各stageで実際にデプロイされているフロントエンドのバージョンを外部から検証したい場合がある（運用状態の可視化ワークフロー等）。この場合、`shared/ui/createVersionJsonPlugin.js`を利用し、ビルド時に`dist`直下へ`version.json`（`{version, buildTime}`）を書き出す。

```js
// vite.config.js
import createVersionJsonPlugin from "./createVersionJsonPlugin.js"; // symlink
export default defineConfig({
  plugins: [
    createVersionJsonPlugin(new URL("../package.json", import.meta.url)),
  ],
});
```

デプロイ後、`https://<フロントエンド配信URL>/version.json`として`curl`のみで取得できる。これは必須構成ではなく、複数stage並行デプロイ構成を採るプロダクトのみが対象の任意機能である。

## API失敗時の表示

- API失敗時に、固定値・モックデータを実データのように表示しない。フォールバック表示をする場合は、未接続であることを画面に必ず示す。架空のデータを`localStorage`等へ書き込まない（モックが残り、本番API停止に約11日間気づけなかった事例がある）
- `fetch`には中断（タイムアウト）の指定を付ける。無いと、応答が返らないときに画面が固まる。共通APIクライアント（#1408）で扱う

## データ更新方式

複数人が同じデータを操作し、スマートフォンのPWAで使うプロダクト向けの方式である。

| 操作 | 方式 |
|---|---|
| チェックの切り替え等、頻度の高い操作 | 楽観的更新し、失敗時に元へ戻す |
| 作成・更新・削除 | APIの応答でローカルの状態を更新する。成功後に全件を再取得しない |
| 自動の再取得 | 読み込み中の表示を出さない。失敗しても画面にエラーを出さない |

- 自動の再取得は、`shared/hooks/useAutoRefresh.js`で行う。画面の再表示時と、表示中の一定間隔でcallbackを呼ぶ
- 楽観的更新の実行中に届いた再取得の結果は捨てる。古い値でチェックが戻るのを防ぐ
- DynamoDBのGSI経由の一覧は結果整合である。書き込み直後の再取得には、新しいデータが含まれないことがある。そのため、応答で状態を更新する方式が必要になる
- リアルタイム通信が必要な場合は、[`websocket-client-reconnect-pattern.md`](websocket-client-reconnect-pattern.md)を参照する。数人規模では過剰なことが多い

## 破壊的操作の確認

- 元に戻せない操作（削除、共有リンクの無効化、メンバーの除外等）は、実行前に確認を挟む。`shared/ui/ConfirmDialog.jsx`を使う
- 確認の文言には、何が消えるかと、元に戻せないことを書く
- 実行ボタンの文言は動詞にする（「OK」ではなく「削除する」）
- `window.confirm`は使わない

## エラー通知

- `alert()`は使わない。JavaScriptの実行を止め、PWAでは見た目も馴染まない。`shared/ui/NotificationProvider.jsx`のトーストを使う
- 画面の主要な内容が取得できなかった場合は、トーストではなく、画面内のエラー表示と再試行ボタンを出す

## 各プロダクトへの適用

このドキュメントはdev-standards側での規約を明文化するものである。共通フォント（`shared/ui/common-theme.css`等）は共有コードとして提供している。トップページのバージョン/更新日時表示ヘルパー（`shared/ui/getAppVersionDefine.js`・`formatBuildTime.js`）も共有コードとして提供している。提供元は[`shared-ui-components.md`](shared-ui-components.md)側である。各プロダクトへの実際の適用（symlinkの追加、マークアップへの組み込み）はプロダクト側で個別に対応する。

### 適用状況

[`consumer-repositories.md`](consumer-repositories.md)に列挙された全リポジトリを記載する。特定セッションが確認できたリポジトリのみを書かない。未確認のリポジトリも「未確認」として残し、一覧から漏れないようにする。

| リポジトリ | 共通フォント | トップページ必須構成 | 備考 |
|---|---|---|---|
| bamiyanapp/dev-standards | 対象外 | 対象外 | dev-standards自身はフロントエンドを持たない |
| bamiyanapp/karuta | 適用済み（[PR #1006](https://github.com/bamiyanapp/karuta/pull/1006)） | 適用済み（issue #1186、[PR #1212](https://github.com/bamiyanapp/karuta/pull/1212)） | 共通フォントはkaruta由来のBootstrapテーマ（`shared/ui/bootstrap-theme.css`、issue #232）にfont-family指定が含まれており、PR #1006でkaruta自身もこの共有CSSへ切り替える形で適用済み。トップページ必須構成は`shared/ui/getAppVersionDefine.js`・`formatBuildTime.js`への切り替えも完了し、division選択画面のfooterに表示している。「バージョン情報の外部公開」で追加した`shared/ui/createVersionJsonPlugin.js`（issue #896）も、karuta#1565で導入したkaruta固有実装から本ヘルパーへ移行済み（karuta#1567） |
| bamiyanapp/Camp-Stock | 適用済み（[PR #130](https://github.com/bamiyanapp/Camp-Stock/pull/130)） | 適用済み（`frontend/src/App.jsx`の`AppHeader`） | トップページ必須構成は`shared/ui/getAppVersionDefine.js`・`shared/ui/formatBuildTime.js`（issue #338）への切り替えも完了済み（[Camp-Stock PR #218](https://github.com/bamiyanapp/Camp-Stock/pull/218)） |
| bamiyanapp/examination | 適用済み（[PR #202](https://github.com/bamiyanapp/examination/pull/202)、マージ済み） | 適用済み（`app/top/src/pages/TopPage.jsx`、examination#131・#137で規約新設前から実装済みだったことを確認） | 共通フォントは`shared/ui/common-theme.css`をsymlink経由で`app/`配下の全8app（top/mock-interviews/education-overview/interview-questions/profile-edit/voice-practice/line-link/allowed-emails）へ導入する形で適用する（examination#201） |
| bamiyanapp/uchi-stock | 未確認 | 未確認 | - |
| uchi-stock/kingyo | 未確認 | 未確認 | - |
| bamiyanapp/Electric-Chair-Arena | 未確認 | 未確認 | - |
| bamiyanapp/hanko-master-kentei | 適用済み（[PR #288](https://github.com/bamiyanapp/hanko-master-kentei/pull/288)。適用中に発見したbootstrap-theme.css側の不具合はissue #379/PR #380で別途修正済み） | 適用済み（`frontend/src/app/page.tsx`、issue #248・PR #260で本表新設前から実装済みだったことを確認） | 共通フォントは`shared/ui/bootstrap-theme.css`をsymlink経由で`frontend/src/app/`へ導入する形で適用（hanko-master-kentei#240）。トップページ必須構成は`NEXT_PUBLIC_APP_VERSION`/`NEXT_PUBLIC_APP_BUILD_SHA`/`NEXT_PUBLIC_APP_BUILD_TIME`を用いたバージョン・ビルド日時表示 |
| bamiyanapp/shock-lab | 適用済み（issue #239、[PR #253](https://github.com/bamiyanapp/shock-lab/pull/253)、マージ済み） | 適用済み（[PR #237](https://github.com/bamiyanapp/shock-lab/pull/237)、マージ済み） | 共通フォントはBootstrap 5.3導入（issue #239）にあわせて`index.css`を廃止し、`shared/ui/bootstrap-theme.css`（`:root, #root`・`--bs-body-font-family`経由でfont-family指定、issue #232・#379対応済み）をsymlink導入する形で適用した。トップページ必須構成は`vite.config.ts`の`define`でリポジトリルートの`package.json`の`version`・ビルド元コミット日時をビルド時に埋め込み、`AppVersionInfo.tsx`で表示する形で実装。CDのdeployジョブが実際に成功しGitHub Pagesへ反映されたことを確認済み |
