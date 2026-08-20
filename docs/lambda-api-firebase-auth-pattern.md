# Firebase Authentication + API Gateway/Lambda(OSLS) + DynamoDBによるバックエンドAPIパターン

GitHub Pages等の静的ホスティングで配信するSPAに対し、専用の認証プロキシ層（`docs/serverless-static-site-pattern.md`のLambda@Edge構成）を持たず、フロントエンドが直接IdP（Firebase Authentication）のID Tokenを取得し、バックエンドAPI側でその都度検証する構成。uchi-stock（[bamiyanapp/uchi-stock](https://github.com/bamiyanapp/uchi-stock)）から、プロダクト固有の業務ロジック（在庫管理等）を除いた、他プロダクトでも再利用できるバックエンドAPI・認証・CI/CDの構成部分を切り出したもの。

対象は、家族・チーム等の限定的な範囲で使う小規模なWebプロダクト（`docs/standard-tech-stack.md`と同様）。**フロントエンドの配信方式・UIフレームワークは対象外**（uchi-stockはGitHub Pages配信・Bootstrap構成だが、これらは他プロダクトのReact/Vite/daisyUI構成と独立に選択できる）。ログインなしで使えるアプリ、あるいは`docs/serverless-static-site-pattern.md`のようにサイト全体をログイン必須にしたい場合は、そちらのCognito + Lambda@Edge構成を検討すること。本パターンは「フロントエンド自体は誰でも閲覧でき、API呼び出し単位で認証する」構成に向く。

## 全体構成

| コンポーネント | 役割 |
|---|---|
| フロントエンド | 静的ホスティング（GitHub Pages等）で配信するSPA。Firebase Authentication SDK（Google SSO等）でログインし、取得したID TokenをAPIリクエストの`Authorization: Bearer <token>`ヘッダーに載せる |
| バックエンドAPI | API Gateway（REST API）+ AWS Lambda（`osls`でデプロイ、詳細は後述）。各ハンドラーで`firebase-admin` SDKによりID Tokenを検証し、UIDを取得する |
| データストア | DynamoDB（`PAY_PER_REQUEST`、アクセスが無い間の実行コストがゼロに近い） |

専用の認証プロキシ・セッションCookie管理を持たないため、`docs/serverless-static-site-pattern.md`のような2スタック分割・循環依存の解消手順は不要。バックエンドAPIは単一のServerless serviceとして構築できる。

## ユーザー識別ロジック（優先順位）

バックエンドの各ハンドラーは、以下の優先順位でユーザーIDを特定する。

1. **Firebase ID Token**: `Authorization: Bearer <token>`ヘッダーから取得。`firebase-admin` SDKでトークンを検証しUIDを取得する。本番運用ではこれが必須経路
2. **テストモード**: 固定ヘッダー（例: `x-user-id: test-user`）が指定されている場合、認証なしでのアクセスを許可する。ログイン未済のユーザーが機能を試用するデモモード等に使う
3. **開発用fallback**: `x-user-id`ヘッダーをそのまま信頼する経路。開発・ローカルテストの利便性のためのみに存在し、環境変数（例: `ALLOW_INSECURE_USER_ID=true`）で明示的に有効化しない限り無効にする

`FIREBASE_SERVICE_ACCOUNT`環境変数にサービスアカウントキーのJSON文字列を設定し、Lambda実行環境で`firebase-admin`を初期化する。

## OSLS（Open Serverless）の採用

Serverless Framework（`serverless`パッケージ）はv4.0以降ライセンス体系が変更され、一定規模を超える商用利用に有料サブスクリプションが必要になった。v3系のままオープンソースで開発が継続されている後継/フォークプロジェクトである**OSLS**（npmパッケージ名`osls`、[oss-serverless/osls](https://github.com/oss-serverless/osls)）へ切り替えることで、このライセンス制約を回避する。

- `osls`パッケージは`serverless`・`sls`・`osls`の3つのbinエイリアスを提供する**v3の drop-in代替**のため、既存の`serverless.yml`（v3スキーマ）・`npx serverless ...`系の呼び出しは無変更のまま動作する
- `package.json`の`devDependencies`で`serverless`を`osls`（`^3.x`系、v3スキーマ互換）に置き換えるだけで移行できる
- Serverless Framework v4への追従（ライセンス制約を受け入れる）が許容できないプロダクトでは、新規構築時から最初に`osls`を選択するとよい

## CIのNode.jsバージョンとLambdaランタイムを一致させる

`reusable-ci.yml`の`node_version`（lint/testで使うNode.jsバージョン）と、Lambdaの`provider.runtime`（`serverless.yml`）は、意図的に同じメジャーバージョンへ揃える運用にする。

- CIで検証したNode.jsバージョンと実際のデプロイ先ランタイムが乖離すると、CIでは検知できないランタイム差異のリスクが生まれる（例: 新しいNode.jsバージョンでのみ利用可能なビルトインAPIを使ったコードが、CIでは通るのに実際のLambda実行環境では動かない）
- AWS Lambdaは定期的に古いランタイム（例: `nodejs18.x`）のサポートを終了する。依存パッケージ側が`engines.node`で新しいNode.jsバージョンを要求するようになった場合（`npm warn EBADENGINE`が出る）も含め、両者を同時に見直すタイミングの合図にする
- 見直す際は、`ci.yml`の`node_version`と`serverless.yml`の`runtime`を同一PRで一緒に変更し、CIのfrontend-test/backend-testが新バージョンで成功することを確認してからマージする

## デプロイ運用（`reusable-cd.yml`を使わない場合）

`reusable-cd.yml`は「`base_branch`→`release_branch`の同期・`release_branch`上でのリリース」を前提とした構成だが、semantic-releaseを`base_branch`（`main`）に対して直接実行する運用（`.releaserc.cjs`の`branches: ["main"]`）を選ぶプロダクトでは前提が一致しない。この場合`cd.yml`はプロダクト固有のワークフローとして自前で維持し、`reusable-ci.yml`のみを利用する。

- semantic-releaseの実行・CHANGELOG生成・GitHub Pagesへのフロントエンドデプロイ（`docs/cicd-pipeline-specification.md`の`deploy-github-pages`複合action）・Lambdaへのバックエンドデプロイ（`osls deploy`）を、それぞれ独立したjobとして`cd.yml`に定義する
- Lambdaデプロイ前にDynamoDBの破壊的変更チェック・バックアップを行う運用にする場合、`FORCE_DEPLOY`のような手動フラグで例外的に強行できるようにしておくと、意図した破壊的変更（テーブル構造の変更等）まで機械的にブロックしてしまう事故を避けられる

## 必要なGitHub Secretsの例

| 名前 | 用途 |
|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | GitHub ActionsからAWSリソースを操作するIAMユーザーの認証情報 |
| `FIREBASE_SERVICE_ACCOUNT` | Firebaseサービスアカウントキー（JSON文字列）。Lambda環境変数として渡す |
| `VITE_USER_POOL_ID`等 | フロントエンドのFirebase設定値（プロジェクトIDやAPIキー等、Viteの`VITE_`prefix環境変数としてビルド時に埋め込む） |

## 実例

uchi-stock（`bamiyanapp/uchi-stock`）の`backend/`（`handler.js`・`serverless.yml`）・`.github/workflows/cd.yml`が本パターンの実装例。
