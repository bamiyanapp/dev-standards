# dev-standards

複数リポジトリで共有する開発ルール・設定の共通化リポジトリ。

## 新規プロジェクトを始める

[`docs/standard-tech-stack.md`](docs/standard-tech-stack.md)（標準技術スタックの索引・立ち上げ手順）から始める。

## AIが開発する際のルール

[`CLAUDE.md`](CLAUDE.md)に、Claude Codeが常に守るべき恒久的なルール・制約（Issue駆動の原則、PR承認・マージ禁止等）と、各ドキュメント・Skillへの索引をまとめている。人間向けの本README、プロダクト固有の知識をまとめる`docs/`、特定作業の手順をまとめる[`.claude/skills/`](.claude/skills/)とは役割を分けている。

## dev-standardsの導入方法

参照側リポジトリへの取り込み方（git submodule追加・`bootstrap.js`によるセットアップ）と、`reusable-ci.yml` / `reusable-cd.yml` / `reusable-codeql.yml`の全入力パラメータは[`docs/reusable-workflows-reference.md`](docs/reusable-workflows-reference.md)を参照。CI/CDパイプライン自体の仕様（各ジョブの実行内容・Architecture）は[`docs/cicd-pipeline-specification.md`](docs/cicd-pipeline-specification.md)を参照。

## このリポジトリの構成

`CLAUDE.md`・Skill・`.github/workflows/`等、リポジトリに含まれる各ファイルの一覧は[`docs/repository-contents.md`](docs/repository-contents.md)を参照。

## ドキュメント目次（`docs/`）

**新規ドキュメントを`docs/`へ追加した場合は、この一覧にも追記すること**。

### 索引・導入

- [`standard-tech-stack.md`](docs/standard-tech-stack.md): 標準技術スタックの索引・新規プロジェクトの立ち上げ手順
- [`reusable-workflows-reference.md`](docs/reusable-workflows-reference.md): dev-standards導入手順・reusable workflow全入力リファレンス
- [`repository-contents.md`](docs/repository-contents.md): このリポジトリに含まれるファイル・ディレクトリの一覧
- [`documentation-format-conventions.md`](docs/documentation-format-conventions.md): ドキュメントの表現形式（文章・表・mermaid図）の選び方

### フロントエンド

- [`client-only-vite-spa-pattern.md`](docs/client-only-vite-spa-pattern.md): 単一パッケージReactアプリ（Vite + TypeScript + Bootstrap）構成
- [`shared-ui-components.md`](docs/shared-ui-components.md): 横断的UIコンポーネントのsymlink共有（`shared/ui/`・`shared/pwa/`・`shared/sfx/`）
- [`frontend-ui-conventions.md`](docs/frontend-ui-conventions.md): 共通フォント・トップページの必須の表示項目等のUI規約
- [`pwa-initial-loading-indicator.md`](docs/pwa-initial-loading-indicator.md): PWA起動時の白画面対策
- [`pwa-icon-generation-pattern.md`](docs/pwa-icon-generation-pattern.md): PWAホーム画面アイコンの生成手順・manifest.json構成
- [`service-worker-update-pattern.md`](docs/service-worker-update-pattern.md): Service Workerのキャッシュ更新・反映パターン
- [`ios-safari-audio-unlock-pattern.md`](docs/ios-safari-audio-unlock-pattern.md): iOS Safari自動再生ポリシー対策（音声要素シングルトン解錠パターン）

### インフラ・認証

- [`static-hosting-pattern.md`](docs/static-hosting-pattern.md): S3 + CloudFrontによる静的サイト配信構成（標準ホスティング）
- [`lambda-api-firebase-auth-pattern.md`](docs/lambda-api-firebase-auth-pattern.md): Firebase Authentication + API Gateway/Lambda(OSLS) + DynamoDBのバックエンドAPI構成
- [`serverless-api-dynamodb-pattern.md`](docs/serverless-api-dynamodb-pattern.md): Google IDトークン直接検証の認証ロジック（デプロイツール自体はAWS SAMの実装例、標準はOSLS）
- [`nextjs-static-lambda-pattern.md`](docs/nextjs-static-lambda-pattern.md): ログイン不要のバックエンドAPI（Lambda + API Gateway + DynamoDB、OSLS）構成
- [`serverless-spa-pattern.md`](docs/serverless-spa-pattern.md): 独自バックエンドAPI（WebSocketによるリアルタイム双方向通信を含む）構成
- [`websocket-client-reconnect-pattern.md`](docs/websocket-client-reconnect-pattern.md): WebSocketクライアントの再接続エンジン設計パターン
- [`serverless-static-site-pattern.md`](docs/serverless-static-site-pattern.md): S3 + CloudFront + Cognito(Google) + Lambda@Edgeの認証付き静的サイト配信構成（標準索引からは除外、サイト全体ログイン保護が必要な場合の追加パターン）
- [`oauth-csrf-nonce-pattern.md`](docs/oauth-csrf-nonce-pattern.md): OAuthログインのCSRF対策（サーバー側nonce管理。`serverless-static-site-pattern.md`向け）
- [`short-lived-bearer-token-pattern.md`](docs/short-lived-bearer-token-pattern.md): 別オリジンバックエンドAPIへの短命Bearerトークン認証（`serverless-static-site-pattern.md`向け）

### バックエンド実装パターン

- [`https-response-buffer-encoding-pattern.md`](docs/https-response-buffer-encoding-pattern.md): `https.request`のレスポンスボディ文字化け対策
- [`llm-dual-format-response-pattern.md`](docs/llm-dual-format-response-pattern.md): LLM APIのdual-format JSON応答・パース救済
- [`deterministic-seed-id-pattern.md`](docs/deterministic-seed-id-pattern.md): 静的コンテンツのDynamoDB冪等同期（決定的ID）
- [`dynamodb-safe-backfill-pattern.md`](docs/dynamodb-safe-backfill-pattern.md): DynamoDBの安全なバックフィル・移行スクリプトパターン
- [`daily-rate-limit-pattern.md`](docs/daily-rate-limit-pattern.md): 日次利用回数の上限カウンタ（`shared/lambda/dailyRateLimit.js`）
- [`ops-monitoring-pattern.md`](docs/ops-monitoring-pattern.md): 運用監視（サイレント障害検知）パターン。CloudWatch Alarm→SNS→運用監視専用LINE Bot（`shared/lambda/opsAlertNotifier.js`）
- [`client-error-reporting-pattern.md`](docs/client-error-reporting-pattern.md): フロントエンドError Boundary＋サーバーサイドロギング（`shared/ui/ErrorBoundary.jsx`, `shared/lambda/clientErrorReporting.js`）

### CI/CD・運用

- [`cicd-pipeline-specification.md`](docs/cicd-pipeline-specification.md): `reusable-ci.yml` / `reusable-cd.yml`の仕様
- [`consumer-repositories.md`](docs/consumer-repositories.md): 参照側リポジトリの登録簿
- [`code-quality-conventions.md`](docs/code-quality-conventions.md): lintルール規約（複雑度チェック・sonarjs等）
- [`sandboxed-agent-production-data-pattern.md`](docs/sandboxed-agent-production-data-pattern.md): 実認証情報の無いサンドボックスからの本番データ調査・修正

## 参照側アプリ一覧

本リポジトリを参照している各アプリの一覧。参照方法・適用状況等の技術的な登録簿は[`docs/consumer-repositories.md`](docs/consumer-repositories.md)を参照する。

**新しい参照側アプリが増えた場合は、この一覧にも追記すること**。

| アプリ名 | アプリのリンク | Gitプロジェクトのリンク |
|---|---|---|
| karuta | [bamiyanapp.github.io/karuta](https://bamiyanapp.github.io/karuta/) | [bamiyanapp/karuta](https://github.com/bamiyanapp/karuta) |
| Camp-Stock（キャンプ道具管理アプリ） | [d2mfi7ve53o8zl.cloudfront.net](https://d2mfi7ve53o8zl.cloudfront.net/) †1 | [bamiyanapp/Camp-Stock](https://github.com/bamiyanapp/Camp-Stock) |
| examination（小学校の受験対策ナレッジベース） | [d3b80dryg4uis7.cloudfront.net](https://d3b80dryg4uis7.cloudfront.net/) †2 | [bamiyanapp/examination](https://github.com/bamiyanapp/examination) |
| uchi-stock（家庭用品の在庫管理アプリ） | [bamiyanapp.github.io/uchi-stock](https://bamiyanapp.github.io/uchi-stock/) | [bamiyanapp/uchi-stock](https://github.com/bamiyanapp/uchi-stock) |
| kingyo（金魚すくい体験アプリ） | [dmuxvf1bg8ldn.cloudfront.net](https://dmuxvf1bg8ldn.cloudfront.net/) †3 | [uchi-stock/kingyo](https://github.com/uchi-stock/kingyo) |
| Electric-Chair-Arena（電気イスゲームAI対戦） | [bamiyanapp.github.io/Electric-Chair-Arena](https://bamiyanapp.github.io/Electric-Chair-Arena/) | [bamiyanapp/Electric-Chair-Arena](https://github.com/bamiyanapp/Electric-Chair-Arena) |
| hanko-master-kentei（ハンコ捺印の作法をテーマにした風刺Webアプリ） | [bamiyanapp.github.io/hanko-master-kentei](https://bamiyanapp.github.io/hanko-master-kentei/) | [bamiyanapp/hanko-master-kentei](https://github.com/bamiyanapp/hanko-master-kentei) |
| shock-lab（車両サスペンション物理シミュレータ） | [bamiyanapp.github.io/shock-lab](https://bamiyanapp.github.io/shock-lab/) | [bamiyanapp/shock-lab](https://github.com/bamiyanapp/shock-lab) |

†1: `cd.yml`実行時にCloudFormation/SAMのスタック出力からCloudFrontドメインを動的に取得する構成のため、コードの静的な確認だけでは固定URLを特定できない（`cd`ワークフロー実行ログ、`Deploy to AWS` jobのJob Summary出力から確認済み）。Google OAuthログインで保護された利用である。ユーザー（プロダクト所有者）の判断により、他者に使われること・それに伴うクラウド利用費増加を許容し、参考情報として掲載する（メールアドレスの許可リスト等は無く、Googleアカウントを持つ人であれば誰でもログインしフルアクセスの利用者になれる点に留意）。

†2: examinationも同様にCloudFront配信だが、現時点で確認できた実際のドメイン。スタックを削除・再作成しない限り変わらない想定だが、こちらもGoogle OAuthログインで保護された家族限定利用のため、一般公開の入り口としてではなく参考情報として掲載する。

†3: kingyoも同様にCloudFormationのスタック出力から動的に取得する構成のためコードの静的確認だけでは特定できないが、`uchi-stock/kingyo`の`cd`ワークフロー実行ログ（`deploy` jobのJob Summary出力）から実際のドメインを確認済み。ログイン機構は無く全員共通ランキングを扱う仕様（issue #110）のため、examination・Camp-Stockとは異なり一般公開の入り口として案内して問題ない。
