# 標準技術スタック（新規プロジェクトのクイックスタート）

新しいプロダクトを立ち上げる際、ゼロから技術選定・雛形作成をせずに最短で始められるよう、検証済みの構成を「標準スタック」としてまとめる。個々の要素は既にdev-standards配下に個別ドキュメント・雛形として存在するため、本ドキュメントはそれらを一望できる索引と、着手手順のチェックリストを兼ねる。

対象は、いずれも小規模なWebプロダクト（大規模スケールは想定しない）。現在、要件に応じて選べる2つの検証済みスタックがある。

| | スタックA（examination） | スタックB（Electric-Chair-Arena） |
|---|---|---|
| ログイン | 必要（Google OAuth、家族・チーム等の限定公開） | 不要（不特定多数への公開可） |
| フロントエンド | React 19 + Vite、ページごとに独立ビルド | Next.js、npm workspacesモノレポ |
| ホスティング | S3 + CloudFront + Cognito + Lambda@Edge | GitHub Pages |
| 詳細 | 本ドキュメントの以下「スタック一覧」・`docs/serverless-static-site-pattern.md` | `docs/nextjs-static-lambda-pattern.md` |

迷ったら「ログインが必要か」で選ぶ。ログイン不要な小規模プロダクトはスタックBの方がインフラ構成・運用コストともに軽量。

## スタックA一覧（examination、ログインあり）

| レイヤー | 技術 | 詳細ドキュメント |
|---|---|---|
| フロントエンド | React 19 + Vite + Tailwind CSS v4 + daisyUI 5、ページごとに独立ビルドするアプリ構成 | `docs/vite-react-app-template.md` |
| フロントエンド共通コンポーネント | ナビゲーション・PWA関連コンポーネント等をsymlinkで共有 | `docs/shared-ui-components.md` |
| フロントエンド共通規約 | 共通フォント、トップページ必須表示項目（バージョン・更新日時） | `docs/frontend-ui-conventions.md` |
| テスト | vitest + Testing Library（フロントエンド）、oxlint（lint） | `docs/vite-react-app-template.md` |
| PWA | 初期ローディング表示、Service Workerの更新反映パターン、ホーム画面アイコンの生成手順 | `docs/pwa-initial-loading-indicator.md`、`docs/service-worker-update-pattern.md`、`docs/pwa-icon-generation-pattern.md` |
| インフラ・認証（サイト全体をログイン必須にする場合） | S3 + CloudFront + Cognito(Google) + Lambda@Edge、Serverless Framework v3（OSS版） | `docs/serverless-static-site-pattern.md` |
| インフラ・認証（API単位で認証する場合） | GitHub Pages等の静的ホスティング + Firebase Authentication（Google SSO）+ API Gateway + Lambda + DynamoDB、OSLS（Serverless Framework v3互換のOSS） | `docs/lambda-api-firebase-auth-pattern.md` |
| 認証まわりの個別パターン | ログインCSRF対策、別オリジンAPIへの短命トークン認証、日次レート制限 | `docs/oauth-csrf-nonce-pattern.md`、`docs/short-lived-bearer-token-pattern.md`、`docs/daily-rate-limit-pattern.md` |
| バックエンド実装上の罠 | Node.js `https.request`のレスポンスボディはBufferのまま集めてから一度だけデコードする（マルチバイト文字のチャンク境界文字化け対策） | `docs/https-response-buffer-encoding-pattern.md` |
| データ同期 | 静的コンテンツをDynamoDB等へ冪等に同期する決定的ID、ユーザー生成コンテンツとのID体系の使い分け | `docs/deterministic-seed-id-pattern.md` |
| LLM API連携 | dual-format JSON応答の同時生成、緩いJSON出力のパース救済 | `docs/llm-dual-format-response-pattern.md` |
| 運用（サンドボックス環境） | 実認証情報の無いエージェントサンドボックスから、GitHub Actions経由で本番データを安全に調査・修正する（dry-run/apply切り替え） | `docs/sandboxed-agent-production-data-pattern.md` |
| CI/CD | reusable-ci.yml（lint/test/build/自動マージ）+ reusable-cd.yml（semantic-release） | `docs/cicd-pipeline-specification.md` |
| コミット規約 | Conventional Commits（commitlint） | リポジトリルート`commitlint.config.cjs`、`.claude/skills/git-conventions` |
| 開発フロー | Issue駆動、Git運用、コードレビュー観点等（Claude Code向け） | リポジトリルート`CLAUDE.md`、`.claude/skills/` |

## スタックB一覧（Electric-Chair-Arena、ログイン不要）

| レイヤー | 技術 | 詳細ドキュメント |
|---|---|---|
| フロントエンド | Next.js（App Router、`output: 'export'`静的書き出し）+ Tailwind CSS v4、npm workspacesモノレポ構成 | `docs/nextjs-static-lambda-pattern.md` |
| ホスティング | GitHub Pages（`actions/upload-pages-artifact` + `actions/deploy-pages`によるネイティブデプロイ） | `docs/nextjs-static-lambda-pattern.md` |
| バックエンド | AWS Lambda + API Gateway（HTTP API）+ DynamoDB、OSLS（Serverless Framework v3互換の軽量フォーク）でデプロイ | `docs/nextjs-static-lambda-pattern.md` |
| テスト | vitest + Testing Library（ユニット）、Playwright + monocart-reporter（E2E・カバレッジ） | `docs/nextjs-static-lambda-pattern.md`、`docs/cicd-pipeline-specification.md` |
| CI/CD | reusable-ci.yml（lint/test/e2e/build/自動マージ）。semantic-release運用は必須ではない | `docs/cicd-pipeline-specification.md`、`docs/nextjs-static-lambda-pattern.md` |
| コミット規約・開発フロー | スタックAと共通（Conventional Commits、Issue駆動） | リポジトリルート`commitlint.config.cjs`・`CLAUDE.md`、`.claude/skills/` |

## 新規プロジェクトの立ち上げ手順（最短ルート、スタックA）

以下はスタックA（examination、ログインあり）向けの手順。スタックB（ログイン不要）を選ぶ場合は、手順1・6は共通、手順2〜5を`docs/nextjs-static-lambda-pattern.md`の内容（Next.jsアプリの用意・npm workspacesの構成・`deploy-github-pages`/`deploy-serverless`複合actionを使ったCI/CD呼び出し）へ読み替える。

1. **リポジトリ作成・dev-standardsの取り込み**

   ```sh
   git submodule add -b main https://github.com/bamiyanapp/dev-standards.git dev-standards
   node dev-standards/scripts/bootstrap.js
   ```

   `CLAUDE.md`を新規作成し先頭で`@dev-standards/CLAUDE.md`をインポートする（README.md「利用方法」参照）。

2. **フロントエンドアプリの雛形をコピー**（ページごとに独立ビルドする構成にする場合）

   `docs/vite-react-app-template.md`の手順で`templates/vite-react-app/`をコピーし、プレースホルダを置換する。複数ページを持つ場合はページごとにこれを繰り返す。

3. **横断的UIコンポーネント・PWAパターンの適用**

   ナビゲーション・共有ボタン・共通フォント・初期ローディング表示・Service Worker更新通知等が必要なら、`sync-manifest.local.json`へエントリを追加し`node dev-standards/scripts/bootstrap.js`を再実行する（`docs/shared-ui-components.md`・`docs/pwa-initial-loading-indicator.md`・`docs/service-worker-update-pattern.md`参照）。

4. **ログインが必要な場合はインフラ構成を導入**

   どちらの認証モデルが適するかで構成を選ぶ。

   - **サイト全体をログイン必須にする**（閲覧自体に認証を要求する）場合: `docs/serverless-static-site-pattern.md`に沿って`auth-stack`（Cognito）・`site-stack`（S3+CloudFront+Lambda@Edge）を構築する。別バックエンドAPI（LINE bot・外部AI連携等）が必要な場合は同ドキュメントの「別オリジンのバックエンドAPIが必要な場合」を参照し、`docs/short-lived-bearer-token-pattern.md`で接続する
   - **フロントエンドは誰でも閲覧でき、API呼び出し単位で認証する**場合: `docs/lambda-api-firebase-auth-pattern.md`に沿ってFirebase Authentication + API Gateway + Lambda（OSLS）+ DynamoDBを構築する

5. **CI/CDの有効化**

   `docs/cicd-pipeline-specification.md`に沿って`.github/workflows/ci.yml`・`cd.yml`から`reusable-ci.yml`・`reusable-cd.yml`を`uses:`で呼び出す。`packages`入力（ページごとに独立ビルドする構成の場合）・`enable_release`（semantic-release運用する場合）等、プロダクトに応じた入力を選ぶ。

6. **各種lint/test/buildが通ることを確認してから最初のPRを作成する**

## この索引に無いもの

上記に当てはまらない個別の技術判断（特定の外部API連携の設計、プロダクト固有のドメインロジック等）は、この標準スタックの対象外。プロダクトごとの`infra/README.md`・`CLAUDE.md`（プロジェクト固有ルール）に記載する。

フロントエンドのUIフレームワーク・デザインシステムの選択（本ドキュメントのテンプレートはTailwind CSS v4 + daisyUI 5が前提だが、Bootstrap等の他フレームワークを使うプロダクトも存在する）も本ドキュメントの対象外。バックエンド・認証・CI/CDの各パターンはUIフレームワークの選択と独立しており、どの組み合わせでも適用できる。

新しいプロダクトで得られた知見が複数プロダクトへ再利用できると判断した場合は、既存ドキュメントへの追記または新規ドキュメント追加を検討し、本ドキュメントの一覧へ追加する。
