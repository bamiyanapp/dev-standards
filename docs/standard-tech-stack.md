# 標準技術スタック（新規プロジェクトのクイックスタート）

新しいプロダクトを立ち上げる際、ゼロから技術選定・雛形作成をせずに最短で始められるよう、実プロダクトで検証済みの構成を要素（関心事）ごとの「標準構成」としてまとめる。個々の要素は既にdev-standards配下に個別ドキュメント・雛形として存在するため、本ドキュメントはそれらを一望できる索引と、着手手順のチェックリストを兼ねる。

対象は、いずれも小規模なWebプロダクト（大規模スケールは想定しない）。**各要素は独立して採用可否を判断する**。ログイン・バックエンドAPI等、プロダクトに不要な要素はその節ごと採用しない。必要な要素のみ、以下の標準構成に従って導入する。

## 選定の考え方

フロントエンド・ホスティングは全プロダクト共通の標準構成を使う。ログイン・バックエンドAPIはそれぞれ独立に要否を判断し、必要な場合のみ該当する節の標準構成を採用する（ログインの要否・方式は、バックエンドAPIの基盤選択に影響しない）。

## 1. フロントエンド（全プロジェクトで採用）

React 19 + Vite + TypeScript + Bootstrap 5.3の単一パッケージ構成。詳細は`docs/client-only-vite-spa-pattern.md`を参照。

横断的UIコンポーネント・共通規約: ナビゲーション・PWA関連コンポーネント・Bootstrapテーマ等のsymlink共有は`docs/shared-ui-components.md`、共通フォント・トップページ必須表示項目（バージョン・更新日時）等の規約は`docs/frontend-ui-conventions.md`を参照（いずれもプロダクトに応じて任意採用）。

テスト・lint: vitest + Testing Library（フロントエンド単体）、oxlint（lint）。バックエンドAPIを持つ場合はPlaywrightによる実バックエンド直結のE2Eも行う。詳細は`docs/client-only-vite-spa-pattern.md`を参照。

## 2. ログイン（認証）: 必要な場合のみ採用

ログイン不要なプロダクトは本節を採用しない。必要な場合も、フロントエンド自体は誰でも閲覧できる状態を保ち（トップページ等での案内が必要なため）、API呼び出し単位で認証する。

| 標準構成 | 詳細ドキュメント | 検証済みプロダクト |
|---|---|---|
| Firebase Authentication（Google SSO）+ API Gateway + Lambda（OSLS）+ DynamoDB | `docs/lambda-api-firebase-auth-pattern.md` | uchi-stock |
| Google OAuthのIDトークンをバックエンドで直接検証 + API Gateway + Lambda + DynamoDB + AWS SAM | `docs/serverless-api-dynamodb-pattern.md` | Camp-Stock |

サイトの閲覧自体（トップページ含め）を非公開にしたい場合は標準構成の対象外。`docs/serverless-static-site-pattern.md`（Cognito + Lambda@Edgeによる全リクエスト認証ゲート）を個別に検討する。

## 3. バックエンドAPI: 必要な場合のみ採用

バックエンドAPIが不要なプロダクトは本節を採用せず、フロントエンドのみで完結させる。標準構成は、フロントエンド配信を分離するかどうかで選ぶ（ログインの有無・方式とは独立に選べる。「2. ログイン」の各構成はどちらの基盤でも組み合わせられる）。

| 標準構成 | 詳細ドキュメント |
|---|---|
| OSLS + Lambda + API Gateway + DynamoDB（REST）。WebSocketによるリアルタイム双方向通信が必要な場合は、同じOSLSサービス内にAPI Gateway WebSocket APIを追加する | 基本構成: `docs/nextjs-static-lambda-pattern.md`「全体構成」のバックエンド部分。WebSocket追加: `docs/serverless-spa-pattern.md`「バックエンド」。Firebase Authenticationとの組み合わせ実装例: `docs/lambda-api-firebase-auth-pattern.md` |
| AWS SAM（フロントエンド配信も同一テンプレートで一体管理したい場合） | `docs/serverless-api-dynamodb-pattern.md`。Google IDトークン直接検証との組み合わせ実装例 |

バックエンド実装上の個別パターン（採用した構成に応じて任意で組み合わせる）: Node.js `https.request`のレスポンスボディ文字化け対策（`docs/https-response-buffer-encoding-pattern.md`）、LLM APIのdual-format JSON応答（`docs/llm-dual-format-response-pattern.md`）、静的コンテンツのDynamoDB冪等同期（`docs/deterministic-seed-id-pattern.md`）、実認証情報の無いサンドボックスからの本番データ調査・修正（`docs/sandboxed-agent-production-data-pattern.md`）、日次利用回数の上限（`docs/daily-rate-limit-pattern.md`）。

## 4. ホスティング（全プロジェクトで採用）

S3 + CloudFront。ログイン・バックエンドAPIの有無によらず共通。詳細は`docs/static-hosting-pattern.md`を参照。

## 5. PWA: 必要な場合のみ採用

初期ローディング表示、Service Workerのキャッシュ更新・反映パターン、ホーム画面アイコンの生成手順は`docs/pwa-initial-loading-indicator.md`・`docs/service-worker-update-pattern.md`・`docs/pwa-icon-generation-pattern.md`を参照。

## 6. CI/CD（全プロジェクトで採用）

reusable-ci.yml（lint/test/build/自動マージ）+ reusable-cd.yml（semantic-release）。詳細な入力・仕様は`docs/cicd-pipeline-specification.md`を参照。

## 7. コミット規約・開発フロー（全プロジェクトで採用）

コミット規約（Conventional Commits、commitlint）はリポジトリルート`commitlint.config.cjs`・`.claude/skills/git-conventions`を参照。開発フロー（Issue駆動、Git運用、コードレビュー観点等、Claude Code向け）はリポジトリルート`CLAUDE.md`・`.claude/skills/`を参照。

## 新規プロジェクトの立ち上げ手順（最短ルート）

1. **リポジトリ作成・dev-standardsの取り込み**（共通）

   ```sh
   git submodule add -b main https://github.com/bamiyanapp/dev-standards.git dev-standards
   node dev-standards/scripts/bootstrap.js
   ```

   `CLAUDE.md`を新規作成し先頭で`@dev-standards/CLAUDE.md`をインポートする（README.md「利用方法」参照）。

2. **フロントエンドの雛形を用意**

   `docs/client-only-vite-spa-pattern.md`「新規プロジェクトでの始め方」に沿って構築する（現時点ではコピー可能な雛形ディレクトリは無く、ドキュメント記載の設定を手動で組み立てる）。

3. **横断的UIコンポーネント・PWAパターンの適用**（「1. フロントエンド」共通規約・「5. PWA」が必要な場合のみ）

   `sync-manifest.local.json`へエントリを追加し`node dev-standards/scripts/bootstrap.js`を再実行する（`docs/shared-ui-components.md`・`docs/pwa-initial-loading-indicator.md`・`docs/service-worker-update-pattern.md`参照）。TypeScriptプロジェクトへ導入する場合は`docs/client-only-vite-spa-pattern.md`「PWA・共有UIコンポーネント導入時の注意点」も併せて参照する。

4. **「2. ログイン」が必要な場合、標準構成を導入**（不要なら本手順自体をスキップ）

   - Firebase Authenticationを使う場合: `docs/lambda-api-firebase-auth-pattern.md`に沿ってFirebase Authentication + API Gateway + Lambda（OSLS）+ DynamoDBを構築する
   - Cognito/Firebaseを使わず、独自のバックエンドAPI（DB読み書きを伴う業務ロジック）を持つ場合: `docs/serverless-api-dynamodb-pattern.md`に沿って、API Gateway + Lambda + DynamoDB + AWS SAMの単一スタック構成を構築する。Google IDトークンをバックエンドで直接検証する

5. **「3. バックエンドAPI」が必要な場合、標準構成を導入**（手順4で導入済みの場合、または不要な場合は本手順自体をスキップ）

   `docs/nextjs-static-lambda-pattern.md`に沿ってAWS Lambda + API Gateway + DynamoDB（OSLS）を構築する。WebSocketによるリアルタイム双方向通信も必要な場合は、`docs/serverless-spa-pattern.md`のAPI Gateway WebSocket API追加方法も併せて参照する（フロントエンドはnpm workspaces構成にする。`docs/client-only-vite-spa-pattern.md`「npm workspacesでバックエンドと組み合わせる場合」参照）。

6. **「4. ホスティング」を構築**（共通）

   `docs/static-hosting-pattern.md`に沿ってS3 + CloudFrontを構築する。

7. **「6. CI/CD」を有効化**

   `docs/cicd-pipeline-specification.md`に沿って`.github/workflows/ci.yml`・`cd.yml`から`reusable-ci.yml`・`reusable-cd.yml`を`uses:`で呼び出す。`workspaces`（バックエンドと組み合わせる場合）・`enable_release`（semantic-release運用する場合）・`enable_e2e_test`（Playwright E2Eを行う場合）等、プロダクトに応じた入力を選ぶ。

8. **各種lint/test/buildが通ることを確認してから最初のPRを作成する**

## この索引に無いもの

上記に当てはまらない個別の技術判断（特定の外部API連携の設計、プロダクト固有のドメインロジック等）は、この標準スタックの対象外。プロダクトごとの`infra/README.md`・`CLAUDE.md`（プロジェクト固有ルール）に記載する。

既存プロダクトの中には、上記標準構成と異なるフロントエンドフレームワーク（examinationの元々のTailwind CSS v4 + daisyUI 5構成、Electric-Chair-ArenaのNext.js構成）・ホスティング（GitHub Pages）・ログイン方式（サイト全体保護、`docs/serverless-static-site-pattern.md`）を使うものも存在する。これらへの遡及適用は本ドキュメントの対象外で、新規プロダクトの標準としてのみ上記構成を採用する。

新しいプロダクトで得られた知見が複数プロダクトへ再利用できると判断した場合は、既存ドキュメントへの追記または新規ドキュメント追加を検討し、本ドキュメントの一覧へ追加する。
