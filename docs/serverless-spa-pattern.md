# SPA（Vite + React + Bootstrap）+ Serverless Framework独自バックエンドAPIパターン

専用のバックエンドAPI・リアルタイム双方向通信（WebSocket等）が必要な、ログイン不要の小規模〜中規模プロダクト向けの構成。karuta（[bamiyanapp/karuta](https://github.com/bamiyanapp/karuta)）から、プロダクト固有の業務ロジックを除いた、他プロダクトでも再利用できるアーキテクチャ・設定パターンを切り出したもの。

`docs/serverless-static-site-pattern.md`（S3 + CloudFront + Cognitoによる認証付き静的サイト配信）とは異なる系統。ログイン・独自ドメイン配信が不要で、代わりに「サーバー側で状態を持つ独自API」「複数クライアント間のリアルタイム同期」が必要な場合はこちらを選ぶ（使い分けは`docs/standard-tech-stack.md`参照）。

コードそのものの共有（symlink化）ではなく、**モノレポ構成・インフラ構成・設計判断の共有**が目的。実際の完全な実装例はkarutaの`frontend/`・`backend/`を参照する。

## 全体構成

npm workspaces構成のモノレポで、`frontend`（SPA）と`backend`（Serverless Framework）を1リポジトリにまとめる。

```json
{
  "private": true,
  "workspaces": ["frontend", "backend"]
}
```

- ルート直下の`package-lock.json`1本で両ワークスペースの依存を一括管理する（CI/CDの`workspaces: true`系入力と対応する。後述）
- `.npmrc`に`install-strategy=nested`を指定する。Lambda関数を`package.individually: true`で個別zip化する構成（後述）と組み合わせるため、hoisted構成より確実にワークスペース単位で依存が解決される
- `.nvmrc`でNode.jsバージョンをLambdaランタイム（例: `nodejs22.x`）と統一しておく。frontend・backend・CI・CDの4箇所すべてで同じバージョンを指定する

`dev-standards`は`git submodule add -b main`でルートに取り込み、`sync-manifest.local.json`経由で横断的UIコンポーネント（`docs/shared-ui-components.md`）等をsymlink共有する。手順は`docs/standard-tech-stack.md`の立ち上げ手順を参照。

## フロントエンド（`frontend/`）

- **Vite + React 19**。UIフレームワークは**Bootstrap 5.3を`index.html`のCDN `<link>`で読み込む**（`docs/client-only-vite-spa-pattern.md`の標準フロントエンド構成と同じCSSフレームワーク）。共通フォント・ダークモード対応・ボタン押下フィードバック等は`shared/ui/bootstrap-theme.css`（`docs/shared-ui-components.md`）をsymlinkして`@import`する
- PWA化する場合は`vite-plugin-pwa`を使う。

  ```js
  VitePWA({
    registerType: 'prompt', // 自動更新ではなく、ユーザー操作を経て更新する
    injectRegister: 'auto',
    manifest: { name, short_name, start_url: './', scope: './', display: 'standalone', icons: [...] },
    workbox: { cleanupOutdatedCaches: true },
  })
  ```

  `registerType: 'prompt'`を選ぶ場合、更新通知UI（`useRegisterSW`）は自前実装が必要になる。「操作中は更新ボタンを出さない」等のガードが要るなら、`main.jsx`でアプリ本体の兄弟としてグローバルマウントされたコンポーネントへ、`useSyncExternalStore`ベースの最小限store（例: 「印刷中かどうか」「プレイ中かどうか」等）経由で状態を伝える。props経由で直接つなげないため
- `build.sourcemap: true`を指定する（後述のE2E JSカバレッジのソースマッピングに必須）
- ディレクトリ構成: `views/`＝画面単位のコンポーネント、`components/`＝画面内で再利用する部品、`hooks/`＝状態・副作用ロジック、`utils/`＝純関数。**テストは実装と同じディレクトリに`*.test.jsx`/`*.test.js`を併置**する
- テストはvitest（jsdom環境）+ Testing Library。`vite.config.js`の`test.exclude`にE2E用ディレクトリ（例: `./e2e/**`）を追加し、vitestの既定`*.spec.js`マッチと衝突しないようにする
- **E2Eテスト（Playwright）はモックを作らず、実際にデプロイ済みのバックエンドAPIへ直結して実行する**。ローカル確認用の`npm run preview`サーバーのみがローカル動作で、APIは常に実環境を使う。これにより「モックとの乖離」による見落としを避けられる一方、外部要因（バックエンドのコールドスタート・依存する外部AI/合成API等のレイテンシ）に起因する既知のflakyが発生し得る前提を受け入れる必要がある（対応の実例は後述のCI/CD節参照）
- E2Eの実行結果はスクリーンショット付きでPRへ自動投稿される（`docs/cicd-pipeline-specification.md`「1. CIワークフロー」参照）。開発環境がCLIから離れている（スマートフォンのみ等）場合でも、実装した画面をその場で目視確認できる

## バックエンド（`backend/`）

**Serverless Framework v3系（`osls`、OSS版フォーク。Serverless Dashboardへのログイン不要）+ AWS SDK v3**で構成する。

```yaml
service: my-app
plugins:
  - serverless-esbuild
package:
  individually: true
provider:
  name: aws
  runtime: nodejs22.x
  region: ap-northeast-1
custom:
  esbuild:
    external: [] # 動的importするネイティブ依存（例: @sparticuz/chromium）等、バンドル対象から除外したいパッケージ
  allowedOrigins: # CORS許可オリジンを1箇所で管理し、全httpイベントのcors.originsから参照する
    - https://example.github.io
    - http://localhost:5173 # npm run dev
    - http://localhost:4173 # npm run preview
functions:
  getPhrase:
    handler: handler.getPhrase
    events:
      - http:
          path: get-phrase
          method: get
          cors:
            origins: ${self:custom.allowedOrigins}
```

- **`serverless-esbuild` + `package.individually: true`**: 関数ごとに実際に使うコードだけをesbuildでバンドルしてからzip化する。理由は速度だけでなく、npm workspaces（`install-strategy=nested`）構成で関数数が増えると、`node_modules`をそのまま個別zip化する素朴な方式では、CIランナーのファイルディスクリプタ上限（既定1024）を超えて`EMFILE: too many open files`でデプロイが失敗することがあるため（zipサイズ縮小・コールドスタート改善も副次効果）。ネイティブ依存や動的importのみのパッケージ（Chromiumバイナリ等）は`custom.esbuild.external`でバンドル対象から除外し、実体ファイルのまま含める
- **DynamoDBは`BillingMode: PAY_PER_REQUEST`を既定にする**（低トラフィックなプロダクトでキャパシティプランニングが不要）。一時的・自動失効させたいデータ（キャッシュ、無人ルーム等）は`TimeToLiveSpecification`でTTL属性を設定する。

  ```yaml
  QuizRoomConnectionsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: my-app-connections
      AttributeDefinitions:
        - AttributeName: connectionId
          AttributeType: S
        - AttributeName: roomId
          AttributeType: S
      KeySchema:
        - AttributeName: connectionId
          KeyType: HASH
      GlobalSecondaryIndexes: # ルーム内の全接続を逆引きするために必要
        - IndexName: roomId-index
          KeySchema:
            - AttributeName: roomId
              KeyType: HASH
          Projection:
            ProjectionType: ALL
      BillingMode: PAY_PER_REQUEST
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true
  ```
- **リアルタイム双方向通信が必要な機能はAPI Gateway WebSocket**を使う（`$connect`/`$disconnect`ルート＋業務ルート）。接続ごとの状態（役割・所属ルーム等）はDynamoDBで管理し、ブロードキャストは接続一覧をQuery（GSI）した上で`ApiGatewayManagementApi`へ個別送信する
- **IAMは`provider.iam.role.statements`に必要最小限のアクションのみ列挙する**（`dynamodb:Scan/Query/GetItem/PutItem/UpdateItem`を用途ごとに区別する等）。他の関数を非同期起動する（`lambda:InvokeFunction`）等、循環参照が起きる権限は関数専用のIAMロールへ分離する
- ハンドラーはフラット配置（`src/`を必ずしも作らない）でよい。REST用（`handler.js`）・WebSocket用（`xxxHandler.js`）・共通レスポンス生成（`httpResponse.js`）程度の粒度に分ける
- 単体テストは**vitest + `aws-sdk-client-mock`**。

  ```js
  import { mockClient } from 'aws-sdk-client-mock';
  import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

  const ddbMock = mockClient(DynamoDBDocumentClient);

  beforeEach(() => { ddbMock.reset(); });

  it('...', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [...] });
    // ...
  });
  ```

  実AWSリソースへは接続せず、コマンド単位でモックする。テストファイルはハンドラーと同じディレクトリに併置する

## デプロイ

`.github/actions/deploy-serverless`複合action（[#147](https://github.com/bamiyanapp/dev-standards/issues/147)）を使う。`setup-node → npm ci → デプロイコマンド実行`の定型パターンに加え、npm workspaces + `package.individually: true`構成で起きがちな`EMFILE`対策（ファイルディスクリプタのソフトリミットをハードリミットまで引き上げる）をデフォルトで内蔵している。

```yaml
- uses: bamiyanapp/dev-standards/.github/actions/deploy-serverless@v2.3.0
  with:
    working-directory: backend
    node-version: 22
    deploy-command: npx osls deploy
    workspaces: true
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

フロントエンドは`.github/actions/deploy-github-pages`（`docs/standard-tech-stack.md`参照）でGitHub Pagesへ、`workspaces: true`を指定して同様にデプロイする。両方とも`reusable-cd.yml`の`release`ジョブ（semantic-release）に`needs`させ、新バージョンがリリースされた場合のみ実行する。

## CI/CD連携（`reusable-ci.yml`）

`docs/cicd-pipeline-specification.md`の機能を、このアーキテクチャ向けに以下の入力で有効化する。

| 入力 | 値の目安 | 理由 |
|---|---|---|
| `frontend_dir` / `backend_dir` | `frontend` / `backend` | 2ワークスペース構成であることを伝える |
| `workspaces` | `true` | 依存インストールをリポジトリルートで一括実行する |
| `enable_e2e_test` | `true` | Playwright E2E（実バックエンド直結）を実行する |
| `coverage_threshold` + `coverage_metrics` | 実測値をベースラインにしたラチェット方式 | `@vitest/coverage-v8`の`branches`指標はCI実行のたびに不安定になりやすいため、`statements,functions,lines`の3指標に限定するのが安定する |
| `e2e_coverage_threshold` | 同上 | PlaywrightのJSカバレッジ（`build.sourcemap: true`が前提）をユニットテストと同じゲートへ合流させる |
| `enable_duplication_check` + `duplication_threshold` | 実測値ベース | jscpdによるコード重複検知 |
| `enable_standards_check` | `true` | `sync-manifest.local.json`のsymlink整合性を検証する |
| `skip_verification_on_push` | `true`（up-to-date required + Squash merge運用の場合） | push-to-mainのツリーは直前のPRで検証済みのため、lint/test/buildの再実行を省略できる |

**実バックエンド直結のE2Eが外部要因（バックエンドのコールドスタート等）で既知のflakyになる場合**、キャッシュのウォームアップやCI側の自動リトライは一般に費用対効果が見合わないことが多い。該当箇所を`try/catch`で囲み、タイムアウト時に`test.skip(true, reason)`でそのテストのみskip扱いにする（テスト内容自体は60秒等の許容時間内に収まった実行では引き続き全て検証される）運用上の割り切りが有効な場合がある。

## 実例

karuta（`bamiyanapp/karuta`）の`frontend/`・`backend/serverless.yml`・`.github/workflows/ci.yml`・`cd.yml`が本パターンの完全な実装例。
