# Next.js静的サイト + GitHub Pages + Lambda（ログイン不要構成）パターン

ログインを必要としない小規模なWebプロダクト（不特定多数への公開・大規模スケールは想定しない）を、`docs/serverless-static-site-pattern.md`（S3 + CloudFront + Cognito構成）よりも軽量に構築するための構成。Electric-Chair-Arena（[bamiyanapp/Electric-Chair-Arena](https://github.com/bamiyanapp/Electric-Chair-Arena)）で検証済み。

コードそのものの共有（symlink化）ではなく、**技術選定・設計判断の共有**が目的。実際の完全な実装例はElectric-Chair-Arenaのリポジトリ全体を参照する。

## 全体構成

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js（App Router）+ Tailwind CSS v4。`output: 'export'`で静的サイトとして書き出す（サーバーサイド機能・API Routesは使わない） |
| フロントエンドのモノレポ構成 | npm workspaces（ルート直下に単一の`package-lock.json`）でfrontend/backendを1リポジトリにまとめる。examinationの「ページごとに独立ビルド」（`docs/vite-react-app-template.md`）とは異なるアプローチ |
| フロントエンドのデプロイ | GitHub Pages。専用ブランチへのpublish（`peaceiris/actions-gh-pages`）ではなく、GitHub Actionsネイティブのpages機能（`actions/upload-pages-artifact` + `actions/deploy-pages`）を`.github/actions/deploy-github-pages`複合actionで呼び出す |
| バックエンド | AWS Lambda + API Gateway（HTTP API）+ DynamoDB |
| バックエンドのIaC・デプロイ | OSLS（`osls`パッケージ）。Serverless Framework本家ではない。`.github/actions/deploy-serverless`複合actionで呼び出せる |
| テスト | Vitest + Testing Library（frontend/backend共通のユニットテスト）、Playwright + monocart-reporter（E2E、CDPカバレッジ収集） |
| 認証 | 無し。ログインが必要な場合は`docs/serverless-static-site-pattern.md`（S3 + CloudFront + Cognito構成）を選ぶこと |

## `docs/serverless-static-site-pattern.md`との使い分け

| 観点 | 本パターン（Electric-Chair-Arena） | S3 + CloudFront + Cognito構成（examination） |
|---|---|---|
| ログイン | 不要 | 必要（Google OAuth） |
| フロントエンドのホスティング | GitHub Pages（無料、リポジトリ内で完結） | S3 + CloudFront（独自ドメイン・CDN・アクセス制御が必要な場合） |
| フロントエンドのビルド構成 | Next.js、npm workspacesモノレポ | Vite、ページごとに独立ビルド |
| バックエンド | Lambda + API Gateway + DynamoDB（OSLS） | 同左（構成は共通）。詳細は`docs/serverless-static-site-pattern.md`「別オリジンのバックエンドAPIが必要な場合」参照 |
| 向いているケース | 不特定多数がアクセスしてよい、ログイン管理のインフラコストを避けたい小規模プロダクト | 家族・チーム等の限定公開で、閲覧制限が必須のプロダクト |

両者は排他的ではない。GitHub Pages配信を採用しつつ、ログインが必要になった場合はCognito等を別途組み合わせることもできるが、その場合はLambda@Edgeによる全リクエストゲートが使えない（GitHub PagesはCloudFrontではない）ため、フロントエンド側での認証状態管理が別途必要になる点に注意する。

## なぜこの構成か

- **GitHub Pagesネイティブ機能 vs 専用ブランチpublish**: 当初はビルド成果物を`gh-pages`ブランチへ`peaceiris/actions-gh-pages`でpushする方式だったが、GitHub Actionsネイティブのpages機能（`actions/upload-pages-artifact` + `actions/deploy-pages`）へ移行した（Electric-Chair-Arena#189）。専用ブランチが不要になり、デプロイ履歴がGitHubの「Environments」タブで確認できる。移行時、リポジトリのSettings > Pages > Sourceを「GitHub Actions」へ手動で切り替える一度限りの作業が必要（この切り替えが済むまでは`deploy-frontend` jobが失敗するが、`gh-pages`ブランチ上の既存公開内容はそのまま残るため実害はない）
- **OSLS vs Serverless Framework本家**: Serverless Framework本家はv4以降、ライセンス・利用形態（アカウント必須化・利用量に応じた課金）を変更した。OSLS（[oss-serverless/osls](https://github.com/oss-serverless/osls)）はv3互換のまま追従できるオープンな軽量フォークで、`serverless.yml`の構文（`frameworkVersion: '3'`）・CLIコマンド名（`serverless`/`sls`/`osls`のいずれでも起動可能）を変更せずに移行できる（Electric-Chair-Arena#201）
- **npm workspacesモノレポ vs ページごとの独立ビルド**: examinationの「ページごとに独立したViteアプリ」は認証境界・独立デプロイ単位が明確な多ページ構成に向くが、Electric-Chair-Arenaのような単一SPA（1つのフロントエンド + 1つのバックエンドAPI）ではオーバーヘッドが大きい。frontend/backendそれぞれをworkspaceとして1つの`package-lock.json`で管理し、`reusable-ci.yml`/`reusable-cd.yml`の`workspaces: true`入力で依存インストールをリポジトリルートに寄せる

## GitHub Pagesの罠（basePath）

GitHub Pagesのプロジェクトサイト（`https://<owner>.github.io/<repo>/`）は、リポジトリ名がURLパスのプレフィックス（basePath）になる。Next.jsの`next.config.mjs`側で、`GITHUB_ACTIONS`環境変数（GitHub Actions実行時に自動的に`true`になる）を見てbasePathを動的に決定する。

```javascript
const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
const repoName = isGithubActions && process.env.GITHUB_REPOSITORY
  ? process.env.GITHUB_REPOSITORY.split('/')[1]
  : '';
const basePath = isGithubActions ? `/${repoName}` : '';
```

このbasePathに起因する罠が2つある。

1. **静的アセットの404**: `output: 'export'`で書き出したページを`https://<owner>.github.io/<repo>/`配下でホストする場合、静的アセットへの絶対パス（`/`始まり）にbasePathが含まれていないとブラウザがファイルを読み込めず404になる。`next.config.mjs`の`basePath`/`assetPrefix`設定に加え、Next.jsのクライアントルーターが組み立てる内部URL（クエリのみの変更を含む）にも一貫してbasePathを反映させるため、`trailingSlash: true`も併せて設定する必要がある（`"/path"`へのリクエストに`"path/index.html"`を返す静的ホスティングのディレクトリindex解決と、Next.jsの書き出し形式を一致させるため）
2. **PlaywrightのE2Eテストでのナビゲーション**: E2EのbaseURLをbasePath込み（例: `http://localhost:4173/<repo>/`）で設定した場合、`page.goto('/')`は**basePathを無視してoriginのルートへ遷移してしまう**（WHATWG URLの解決規則上、先頭が`/`の相対参照はbase URLのpath部分を丸ごと置き換えるため。`new URL('/', 'http://localhost:4173/repo/')`は`http://localhost:4173/`になる）。`page.goto('./')`（空の相対参照相当）を使うとbase URLのpathを保持したまま遷移できる。ローカル開発時は`GITHUB_ACTIONS`が未設定でbasePathが空文字のため、この問題はCI環境でしか再現しない点に注意（Electric-Chair-Arena#228で実際に全E2Eテストがこの原因でCI上でのみ失敗した）

## ローカル開発

- フロントエンド: `next dev`
- バックエンド: `serverless-offline` + `serverless-dynamodb-local`（`npx osls offline start`）。`custom.dynamodb.stages`・`start.inMemory: true`でインメモリDynamoDBを使う

## E2Eテスト・カバレッジ

Playwright + monocart-reporterによるE2E・カバレッジ収集、スクリーンショットのJob Summary/PRコメントへの報告は`reusable-ci.yml`の`frontend-e2e-test` job・`docs/cicd-pipeline-specification.md`「1. CIワークフロー」の呼び出し規約に従う（Electric-Chair-Arena#187）。

本構成固有の追加事項:

- `output: 'export'`構成では`next start`が使えない（本番ビルドはプロダクションサーバーではなく静的ファイル一式のため）。PlaywrightのwebServerには静的書き出し成果物の配信ではなく`next dev`を直接指定する
- E2EのbaseURLは前述のGitHub Pagesのbasepath算出ロジック（`next.config.mjs`と同じもの）を`playwright.config.mjs`側でも再現し、CI環境でも正しいURLへアクセスできるようにする
- monocart-reporterのCDPカバレッジは既定でNext.js自身のランタイム同梱コード（`node_modules/next/src/`配下のdev-overlay等）まで拾ってしまい、実際のアプリケーションコードのカバレッジ率を大きく見誤る。`coverage.sourceFilter`で`node_modules`を除外し`src/**`のみに絞る

  ```javascript
  coverage: {
    sourceFilter: {
      '**/node_modules/**': false,
      'src/**': true,
    },
  }
  ```

## CI/CD呼び出し例

`ci.yml`（`reusable-ci.yml`呼び出し）:

```yaml
jobs:
  ci:
    uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@<固定タグ>
    with:
      frontend_dir: frontend
      backend_dir: backend
      node_version: '24'
      enable_release: false   # semantic-releaseは非採用（プロダクト側でバージョン管理不要な場合）
      workspaces: true
      enable_standards_check: true
      enable_duplication_check: true
      duplication_threshold: 2   # 実測値に基づくラチェット値。プロダクトごとに実測して決める
      coverage_threshold: 90
      coverage_metrics: 'statements,functions,lines'
      enable_e2e_test: true
      e2e_coverage_threshold: 50   # 同上、実測値に基づくラチェット値
      e2e_coverage_metrics: 'statements,functions,lines'
      enable_mermaid_render: true
      mermaid_doc_paths: "docs/architecture.md\nREADME.md"
```

`cd.yml`のfrontendデプロイは`.github/actions/deploy-github-pages`、backendデプロイは`.github/actions/deploy-serverless`をそれぞれ呼び出す（両複合actionの詳細は`docs/cicd-pipeline-specification.md`「2. CDワークフロー」参照）。semantic-releaseによるバージョン管理が不要なプロダクトでは、`reusable-cd.yml`自体は呼び出さず、`cd.yml`にこれらの複合actionを直接組み込む構成でよい。

## OSLS採用に伴う罠

- **npm workspaces環境でのpeerDependency競合**: `serverless-offline`（ローカル開発用プラグイン）の`peerDependencies`は`serverless: ^4.0.0`を要求する。OSLS（v3系）と共存させると、npmが`serverless-offline`のpeerDependencyを満たすために実体の`serverless@4`パッケージを自動インストールしてしまう（`node_modules/serverless`が実在する状態になる）。これは`node_modules/.bin/serverless`等のbin解決には影響しない（実際に使われるのは`osls`側のbinで、`serverless@4`は未使用のまま残る）ため実害は無いが、`npm install`実行時に無関係な`serverless@4`のpostinstallスクリプト（バイナリ取得のネットワークアクセスを伴う）が走る点は許容する必要がある。root `package.json`の`overrides`でこれを完全に排除しようとすると、npm workspaces全体のlockfile再解決が必要になり、他のworkspace（frontend側）の依存解決へ意図しない副作用が及ぶリスクがあるため、この程度の無害な混入は許容し、無理に排除しないという判断で構わない（Electric-Chair-Arena#201）
- **Lambdaランタイムのバージョン**: OSLSの設定バリデータおよび`serverless-offline`は`nodejs18.x`等の古いランタイムを非サポートとして拒否することがある。`serverless.yml`の`provider.runtime`は現行のLTS（`nodejs22.x`等）を指定する

## 必要なGitHub Secrets / Variablesの例

| 名前 | 用途 |
|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | GitHub ActionsからLambda/API Gateway/DynamoDBを操作するIAMユーザーの認証情報（`deploy-serverless`複合actionへ渡す） |
| （GitHub Pages用の追加Secretsは不要） | `deploy-github-pages`複合actionは`GITHUB_TOKEN`のみで動作する |

## 初回セットアップ時によくある失敗

- **GitHub Pages Sourceの未切り替え**: `deploy-github-pages`複合actionへ初めて切り替えた直後は、リポジトリのSettings > Pages > SourceをGitHub Web UIから手動で「GitHub Actions」へ変更するまで`deploy-frontend` jobが失敗し続ける。これはコード側では解決できない一度限りの手動作業として、PR本文・完了報告に明記しておく
- **jscpd/E2Eカバレッジの閾値設定**: `duplication_threshold`・`e2e_coverage_threshold`はプロダクトごとの実測値に依存するため、他プロダクトの値をそのまま流用しない。CI実行を複数回行い、安定した実測値に対しラチェット方式（実測値より少し厳しい値）で設定する
- **basePath関連の404**: 前述のGitHub Pagesの罠を参照

## 実例

Electric-Chair-Arena（`bamiyanapp/Electric-Chair-Arena`）が本パターンの完全な実装例。関連issue: #189（GitHub Pagesデプロイ移行）、#201（OSLS移行）、#187（Playwright E2E導入）、#228（basePath起因のE2E失敗修正）。
