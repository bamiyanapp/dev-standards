# 標準技術スタック（新規プロジェクトのクイックスタート）

新しいプロダクトを立ち上げる際、ゼロから技術選定・雛形作成をせずに最短で始められるよう、実プロダクトで検証済みの構成を要素（関心事）ごとの「標準構成」としてまとめる。個々の要素は既にdev-standards配下に個別ドキュメント・雛形として存在するため、本ドキュメントはそれらを一望できる索引と、着手手順のチェックリストを兼ねる。

対象は、いずれも小規模なWebプロダクト（大規模スケールは想定しない）。**各要素は独立して採用可否を判断する**。ログイン・バックエンドAPI等、プロダクトに不要な要素はその節ごと採用しない。必要な要素のみ、以下の標準構成に従って導入する。

## 選定の考え方

まず「ログインが必要か」「バックエンドAPIが必要か」の2軸で考え、以下から採用する構成の組み合わせを選ぶ。

| ログイン | バックエンドAPI | 採用する構成 |
|---|---|---|
| 必要（閲覧自体を保護） | 任意 | 「2. ログイン」のサイト全体保護構成（`serverless-static-site-pattern.md`）。別オリジンのバックエンドAPIが必要な場合は同ドキュメントの「別オリジンのバックエンドAPIが必要な場合」を参照 |
| 不要（誰でも閲覧可） | 必要（API呼び出し単位で認証） | 「2. ログイン」のAPI単位保護構成（`lambda-api-firebase-auth-pattern.md`） |
| 不要 | 必要（認証不要な公開API） | 「3. バックエンドAPI」の`nextjs-static-lambda-pattern.md`構成（REST APIのみ）または`serverless-spa-pattern.md`構成（WebSocketによるリアルタイム双方向通信も必要な場合） |
| 不要 | 不要 | バックエンド・認証系の節はいずれも採用しない。「1. フロントエンド」＋「4. ホスティング」（GitHub Pages直接デプロイ）のみで完結する |

以下、要素ごとに標準構成を示す。

## 1. フロントエンド（全プロジェクトで採用）

4つの実装パターンがある。複数ページ構成か、TypeScript前提の単一パッケージか、他要素（バックエンドAPI）とモノレポで組み合わせるかで選ぶ。

| パターン | 技術 | 詳細ドキュメント | 検証済みプロダクト |
|---|---|---|---|
| ページごとに独立ビルド | React 19 + Vite + Bootstrap 5.3 | `docs/vite-react-app-template.md` | examination（ページ構成の由来。CSSは元々Tailwind CSS v4 + daisyUI 5だったが、標準構成をBootstrap 5.3へ変更した。examination自体への遡及適用は未実施） |
| 単一パッケージ・TypeScript | React 19 + Vite + TypeScript、CSSフレームワーク不使用、Zustand状態管理 | `docs/client-only-vite-spa-pattern.md`「新規プロジェクトでの始め方」 | shock-lab |
| Next.jsモノレポ | Next.js（App Router、`output: 'export'`静的書き出し）+ Tailwind CSS v4、npm workspaces | `docs/nextjs-static-lambda-pattern.md` | Electric-Chair-Arena |
| 単一SPA（npm workspaces、独自バックエンドAPIと一体） | Vite + React + Bootstrap 5.3（CDN読み込み） | `docs/serverless-spa-pattern.md` | karuta |

横断的UIコンポーネント・共通規約: ナビゲーション・PWA関連コンポーネント・Bootstrapテーマ等のsymlink共有は`docs/shared-ui-components.md`、共通フォント・トップページ必須表示項目（バージョン・更新日時）等の規約は`docs/frontend-ui-conventions.md`を参照（いずれもプロダクトに応じて任意採用）。

テスト・lint: vitest + Testing Library（フロントエンド単体）、oxlint/ESLint（lint）。単一SPAパターン（karuta）ではPlaywrightによる実バックエンド直結のE2Eも行う。詳細は各フロントエンドパターンのドキュメントを参照。

## 2. ログイン（認証）: 必要な場合のみ採用

ログイン不要なプロダクトは本節を採用しない。必要な場合、「閲覧自体を保護する（サイト全体ログイン必須）」か「API呼び出し単位で保護する（フロントは誰でも閲覧可）」かで標準構成が分かれる。

| 保護単位 | 標準構成 | 詳細ドキュメント | 検証済みプロダクト |
|---|---|---|---|
| サイト全体（閲覧自体に認証を要求） | S3 + CloudFront + Cognito(Google) + Lambda@Edge、Serverless Framework v3（OSS版） | `docs/serverless-static-site-pattern.md` | examination |
| API単位（フロントは誰でも閲覧可） | Firebase Authentication（Google SSO）+ API Gateway + Lambda（OSLS）+ DynamoDB | `docs/lambda-api-firebase-auth-pattern.md` | uchi-stock |

認証まわりの個別パターン（採用した保護単位に応じて任意で組み合わせる）: ログインCSRF対策（`docs/oauth-csrf-nonce-pattern.md`）、別オリジンAPIへの短命トークン認証（`docs/short-lived-bearer-token-pattern.md`）、日次利用回数の上限（`docs/daily-rate-limit-pattern.md`）。

## 3. バックエンドAPI: 必要な場合のみ採用

バックエンドAPIが不要なプロダクトは本節を採用せず、フロントエンドのみで完結させる（後述「4. ホスティング」でGitHub Pagesへ直接デプロイする）。

必要な場合、「2. ログイン」と一体で構築するか、ログイン不要の公開APIとして単独で構築するかで標準構成が分かれる。

| 前提 | 標準構成 |
|---|---|
| サイト全体ログインと一体（別オリジンAPI） | 「2. ログイン」の`serverless-static-site-pattern.md`「別オリジンのバックエンドAPIが必要な場合」＋`docs/short-lived-bearer-token-pattern.md` |
| API単位認証と一体 | 「2. ログイン」の`lambda-api-firebase-auth-pattern.md`（Firebase Authentication + API Gateway + Lambda(OSLS) + DynamoDB） |
| ログイン不要・REST APIのみ（誰でも呼び出し可） | AWS Lambda + API Gateway（HTTP API）+ DynamoDB、OSLS（Serverless Framework v3互換の軽量フォーク）。詳細は`docs/nextjs-static-lambda-pattern.md` |
| ログイン不要・WebSocketによるリアルタイム双方向通信も必要 | Serverless Framework（osls）+ Lambda + DynamoDB + API Gateway REST/WebSocket。単一SPAフロントエンド（上記「1. フロントエンド」の単一SPAパターン）と一体で構築する。詳細は`docs/serverless-spa-pattern.md` |

バックエンド実装上の個別パターン（採用した構成に応じて任意で組み合わせる）: Node.js `https.request`のレスポンスボディ文字化け対策（`docs/https-response-buffer-encoding-pattern.md`）、LLM APIのdual-format JSON応答（`docs/llm-dual-format-response-pattern.md`）、静的コンテンツのDynamoDB冪等同期（`docs/deterministic-seed-id-pattern.md`）、実認証情報の無いサンドボックスからの本番データ調査・修正（`docs/sandboxed-agent-production-data-pattern.md`）。

## 4. ホスティング

| 条件 | 標準構成 |
|---|---|
| ログイン必須でサイト全体を保護する場合 | S3 + CloudFront（`docs/serverless-static-site-pattern.md`の一部） |
| それ以外（ログイン不要、またはAPI単位認証で完結する場合） | GitHub Pages。`.github/actions/deploy-github-pages`複合action、またはNext.jsモノレポ構成では`actions/upload-pages-artifact`＋`actions/deploy-pages`によるネイティブデプロイ（`docs/nextjs-static-lambda-pattern.md`） |

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

2. **「1. フロントエンド」からパターンを選び雛形を用意**

   - ページごと独立ビルド（Bootstrap）: `docs/vite-react-app-template.md`の手順で`templates/vite-react-app/`をコピーし、プレースホルダを置換する。複数ページを持つ場合はページごとにこれを繰り返す
   - 単一パッケージ・TypeScript（CSSフレームワーク無し）: `docs/client-only-vite-spa-pattern.md`「新規プロジェクトでの始め方」に沿ってゼロから構築する（現時点ではコピー可能な雛形ディレクトリは無く、ドキュメント記載の設定を手動で組み立てる）
   - Next.jsモノレポ: `docs/nextjs-static-lambda-pattern.md`の内容（Next.jsアプリの用意、npm workspacesの構成）に沿って構築する
   - 単一SPA（独自バックエンドAPIと一体、npm workspaces）: `npm create vite@latest frontend -- --template react`等で単一SPAとして立ち上げ、`docs/serverless-spa-pattern.md`の構成（Bootstrap 5.3のCDN読み込み、`views/`・`components/`・`hooks/`・`utils/`の層分け、vitest設定）に合わせる。ルートを`package.json`のnpm workspacesに含める

3. **横断的UIコンポーネント・PWAパターンの適用**（「1. フロントエンド」共通規約・「5. PWA」が必要な場合のみ）

   `sync-manifest.local.json`へエントリを追加し`node dev-standards/scripts/bootstrap.js`を再実行する（`docs/shared-ui-components.md`・`docs/pwa-initial-loading-indicator.md`・`docs/service-worker-update-pattern.md`参照）。TypeScriptプロジェクト（単一パッケージパターン）へ導入する場合は`docs/client-only-vite-spa-pattern.md`「PWA・共有UIコンポーネント導入時の注意点」も併せて参照する。

4. **「2. ログイン」が必要な場合、保護単位に応じて構成を導入**（不要なら本手順自体をスキップ）

   - サイト全体をログイン必須にする場合: `docs/serverless-static-site-pattern.md`に沿って`auth-stack`（Cognito）・`site-stack`（S3+CloudFront+Lambda@Edge）を構築する。別バックエンドAPI（LINE bot・外部AI連携等）が必要な場合は同ドキュメントの「別オリジンのバックエンドAPIが必要な場合」を参照し、`docs/short-lived-bearer-token-pattern.md`で接続する
   - フロントエンドは誰でも閲覧でき、API呼び出し単位で認証する場合: `docs/lambda-api-firebase-auth-pattern.md`に沿ってFirebase Authentication + API Gateway + Lambda（OSLS）+ DynamoDBを構築する

5. **「3. バックエンドAPI」が必要な場合、前提に応じて構成を導入**（手順4で導入済みの場合、または不要な場合は本手順自体をスキップ）

   ログイン不要の公開APIとして単独で必要な場合、REST APIのみなら`docs/nextjs-static-lambda-pattern.md`に沿ってAWS Lambda + API Gateway + DynamoDB（OSLS）を構築する。WebSocketによるリアルタイム双方向通信も必要な場合は、`docs/serverless-spa-pattern.md`に沿って`backend/`にServerless Framework（osls）構成（`serverless.yml`・Lambdaハンドラー・DynamoDBテーブル）を構築する（フロントエンドは手順2の単一SPAパターンと組み合わせる）。

6. **「6. CI/CD」を有効化**

   `docs/cicd-pipeline-specification.md`に沿って`.github/workflows/ci.yml`・`cd.yml`から`reusable-ci.yml`・`reusable-cd.yml`を`uses:`で呼び出す。`packages`入力（ページごとに独立ビルドする構成の場合）・`workspaces`（単一SPA等npm workspaces構成の場合）・`enable_release`（semantic-release運用する場合）・`enable_e2e_test`（Playwright E2Eを行う場合）等、プロダクトに応じた入力を選ぶ。デプロイは`.github/actions/deploy-github-pages`（GitHub Pages）・`.github/actions/deploy-serverless`（Serverless Framework）複合actionを使う。GitHub Pagesへのデプロイ構成例は`docs/client-only-vite-spa-pattern.md`「CI/CDの構成例」参照。

7. **各種lint/test/buildが通ることを確認してから最初のPRを作成する**

## この索引に無いもの

上記に当てはまらない個別の技術判断（特定の外部API連携の設計、プロダクト固有のドメインロジック等）は、この標準スタックの対象外。プロダクトごとの`infra/README.md`・`CLAUDE.md`（プロジェクト固有ルール）に記載する。

「ページごとに独立ビルド」パターンのCSSフレームワークはBootstrap 5.3を標準構成とする（`shared/ui/bootstrap-theme.css`によるダークモード対応込み）が、既存プロダクトの中にはこれと異なるUIフレームワーク・デザインシステムを使うものも存在する（examination・Next.jsモノレポパターン等はTailwind CSS v4、単一パッケージ・TypeScriptパターンはCSSフレームワーク不使用）。これらの個別事情への対応は本ドキュメントの対象外。バックエンド・認証・CI/CDの各パターンはUIフレームワークの選択と独立しており、どの組み合わせでも適用できる。

新しいプロダクトで得られた知見が複数プロダクトへ再利用できると判断した場合は、既存ドキュメントへの追記または新規ドキュメント追加を検討し、本ドキュメントの一覧へ追加する。
