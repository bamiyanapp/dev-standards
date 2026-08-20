# 標準技術スタック（新規プロジェクトのクイックスタート）

新しいプロダクトを立ち上げる際、ゼロから技術選定・雛形作成をせずに最短で始められるよう、examination（[bamiyanapp/examination](https://github.com/bamiyanapp/examination)）・karuta（[bamiyanapp/karuta](https://github.com/bamiyanapp/karuta)）で検証済みの構成を「標準スタック」としてまとめる。個々の要素は既にdev-standards配下に個別ドキュメント・雛形として存在するため、本ドキュメントはそれらを一望できる索引と、着手手順のチェックリストを兼ねる。

対象は、家族・チーム等の限定的な範囲で使う小規模なWebプロダクト（不特定多数への公開・大規模スケールは想定しない）。

## どちらの構成を選ぶか

バックエンドの要件によって、実績のある2つのアーキテクチャ・プロファイルから選ぶ。

| | **静的サイト配信プロファイル**（examination） | **SPA + 独自バックエンドAPIプロファイル**（karuta） |
|---|---|---|
| 向いているプロダクト | ログインが必要、コンテンツが主でページ数が多い | ログイン不要、専用API・リアルタイム双方向通信（WebSocket等）が必要 |
| フロントエンド | ページごとに独立ビルドするReact + Tailwind CSS v4 + daisyUI 5 | 単一SPA（Vite + React + Bootstrap 5.3） |
| バックエンド/配信 | S3 + CloudFront + Cognito(Google) + Lambda@Edge（認証ゲートのみ、業務ロジックは持たない） | Serverless Framework（osls）+ AWS Lambda + DynamoDB + API Gateway REST/WebSocket（業務ロジック一式） |
| 詳細ドキュメント | `docs/serverless-static-site-pattern.md` | `docs/serverless-spa-pattern.md` |

両プロファイルとも、フロントエンド共通コンポーネント・共通規約・CI/CD・開発フロー等の下表の要素は共通して使う。判断に迷う場合や、両方の要素を組み合わせたい場合（例: 静的サイト配信＋別オリジンの独自バックエンドAPI）は、`docs/serverless-static-site-pattern.md`の「別オリジンのバックエンドAPIが必要な場合」を参照する。

## スタック一覧

| レイヤー | 技術 | 詳細ドキュメント |
|---|---|---|
| フロントエンド | 上記「どちらの構成を選ぶか」参照 | `docs/vite-react-app-template.md`（静的サイト配信）／`docs/serverless-spa-pattern.md`（SPA） |
| フロントエンド共通コンポーネント | ナビゲーション・PWA関連コンポーネント・Bootstrapテーマ等をsymlinkで共有 | `docs/shared-ui-components.md` |
| フロントエンド共通規約 | 共通フォント、トップページ必須表示項目（バージョン・更新日時） | `docs/frontend-ui-conventions.md` |
| テスト | vitest + Testing Library（フロントエンド単体）、Playwright（E2E、SPAプロファイルでは実バックエンド直結）、oxlint/ESLint（lint） | `docs/vite-react-app-template.md`、`docs/serverless-spa-pattern.md` |
| PWA | 初期ローディング表示、Service Workerの更新反映パターン | `docs/pwa-initial-loading-indicator.md`、`docs/service-worker-update-pattern.md` |
| インフラ・認証（静的サイト配信） | S3 + CloudFront + Cognito(Google) + Lambda@Edge、Serverless Framework v3（OSS版） | `docs/serverless-static-site-pattern.md` |
| バックエンドAPI（SPA） | Serverless Framework（osls）+ Lambda + DynamoDB + API Gateway REST/WebSocket | `docs/serverless-spa-pattern.md` |
| 認証まわりの個別パターン | ログインCSRF対策、別オリジンAPIへの短命トークン認証、日次レート制限 | `docs/oauth-csrf-nonce-pattern.md`、`docs/short-lived-bearer-token-pattern.md`、`docs/daily-rate-limit-pattern.md` |
| バックエンド実装上の罠 | Node.js `https.request`のレスポンスボディはBufferのまま集めてから一度だけデコードする（マルチバイト文字のチャンク境界文字化け対策） | `docs/https-response-buffer-encoding-pattern.md` |
| CI/CD | reusable-ci.yml（lint/test/build/自動マージ）+ reusable-cd.yml（semantic-release）+ デプロイ用複合action（GitHub Pages・Serverless Framework） | `docs/cicd-pipeline-specification.md` |
| コミット規約 | Conventional Commits（commitlint） | リポジトリルート`commitlint.config.cjs`、`.claude/skills/git-conventions` |
| 開発フロー | Issue駆動、Git運用、コードレビュー観点等（Claude Code向け） | リポジトリルート`CLAUDE.md`、`.claude/skills/` |

## 新規プロジェクトの立ち上げ手順（最短ルート）

1. **リポジトリ作成・dev-standardsの取り込み**

   ```sh
   git submodule add -b main https://github.com/bamiyanapp/dev-standards.git dev-standards
   node dev-standards/scripts/bootstrap.js
   ```

   `CLAUDE.md`を新規作成し先頭で`@dev-standards/CLAUDE.md`をインポートする（README.md「利用方法」参照）。

2. **フロントエンドアプリの雛形を用意**

   - 静的サイト配信プロファイル（ページごとに独立ビルドする構成）の場合: `docs/vite-react-app-template.md`の手順で`templates/vite-react-app/`をコピーし、プレースホルダを置換する。複数ページを持つ場合はページごとにこれを繰り返す
   - SPAプロファイルの場合: `npm create vite@latest frontend -- --template react`等で単一SPAとして立ち上げ、`docs/serverless-spa-pattern.md`の構成（Bootstrap 5.3のCDN読み込み、`views/`・`components/`・`hooks/`・`utils/`の層分け、vitest設定）に合わせる。ルートを`package.json`のnpm workspacesに含める

3. **横断的UIコンポーネント・PWAパターンの適用**

   ナビゲーション・共有ボタン・共通フォント・Bootstrapテーマ・初期ローディング表示・Service Worker更新通知等が必要なら、`sync-manifest.local.json`へエントリを追加し`node dev-standards/scripts/bootstrap.js`を再実行する（`docs/shared-ui-components.md`・`docs/pwa-initial-loading-indicator.md`・`docs/service-worker-update-pattern.md`参照）。

4. **バックエンドを構築**

   - ログインが必要な静的サイト配信プロファイルの場合: `docs/serverless-static-site-pattern.md`に沿って`auth-stack`（Cognito）・`site-stack`（S3+CloudFront+Lambda@Edge）を構築する。別バックエンドAPI（LINE bot・外部AI連携等）が必要な場合は同ドキュメントの「別オリジンのバックエンドAPIが必要な場合」を参照し、`docs/short-lived-bearer-token-pattern.md`で接続する
   - SPAプロファイルの場合: `docs/serverless-spa-pattern.md`に沿って`backend/`にServerless Framework（osls）構成（`serverless.yml`・Lambdaハンドラー・DynamoDBテーブル）を構築する

5. **CI/CDの有効化**

   `docs/cicd-pipeline-specification.md`に沿って`.github/workflows/ci.yml`・`cd.yml`から`reusable-ci.yml`・`reusable-cd.yml`を`uses:`で呼び出す。`packages`入力（ページごとに独立ビルドする構成の場合）・`workspaces`（SPAプロファイル等npm workspaces構成の場合）・`enable_release`（semantic-release運用する場合）・`enable_e2e_test`等、プロダクトに応じた入力を選ぶ。デプロイは`.github/actions/deploy-github-pages`・`.github/actions/deploy-serverless`複合actionを使う。

6. **各種lint/test/buildが通ることを確認してから最初のPRを作成する**

## この索引に無いもの

上記に当てはまらない個別の技術判断（特定の外部API連携の設計、プロダクト固有のドメインロジック等）は、この標準スタックの対象外。プロダクトごとの`infra/README.md`・`CLAUDE.md`（プロジェクト固有ルール）に記載する。

新しいプロダクトで得られた知見が複数プロダクトへ再利用できると判断した場合は、既存ドキュメントへの追記または新規ドキュメント追加を検討し、本ドキュメントの一覧へ追加する。
