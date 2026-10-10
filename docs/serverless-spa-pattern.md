# SPA（Vite + React + Bootstrap）+ Serverless Framework独自バックエンドAPIパターン

専用のバックエンドAPI・リアルタイム双方向通信（WebSocket等）が必要な、ログイン不要の小規模〜中規模プロダクト向けの構成。karuta（[bamiyanapp/karuta](https://github.com/bamiyanapp/karuta)）から、プロダクト固有の業務ロジックを除いた、他プロダクトでも再利用できるアーキテクチャ・設定パターンを切り出したもの。

[`serverless-static-site-pattern.md`](serverless-static-site-pattern.md)（S3 + CloudFront + Cognitoによる認証付き静的サイト配信）とは異なる系統。ログイン・独自ドメイン配信が不要な場合がある。代わりに「サーバー側で状態を持つ独自API」「複数クライアント間のリアルタイム同期」が必要な場合はこちらを選ぶ（使い分けは[`standard-tech-stack.md`](standard-tech-stack.md)参照）。

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

`dev-standards`は`git submodule add -b main`でルートに取り込む。`sync-manifest.local.json`経由で横断的UIコンポーネント（[`shared-ui-components.md`](shared-ui-components.md)）等をsymlink共有する。手順は[`standard-tech-stack.md`](standard-tech-stack.md)の立ち上げ手順を参照。

## フロントエンド（`frontend/`）

- **Vite + React 19**。UIフレームワークは**Bootstrap 5.3を`index.html`のCDN `<link>`で読み込む**。これは[`client-only-vite-spa-pattern.md`](client-only-vite-spa-pattern.md)の標準フロントエンド構成と同じCSSフレームワークである。共通フォント・ダークモード対応・ボタン押下フィードバック等がある。これらは`shared/ui/bootstrap-theme.css`（[`shared-ui-components.md`](shared-ui-components.md)）をsymlinkして`@import`する
- PWA化する場合は`vite-plugin-pwa`を使う。

  ```js
  VitePWA({
    registerType: 'prompt', // 自動更新ではなく、ユーザー操作を経て更新する
    injectRegister: 'auto',
    manifest: { name, short_name, start_url: './', scope: './', display: 'standalone', icons: [...] },
    workbox: { cleanupOutdatedCaches: true },
  })
  ```

  `registerType: 'prompt'`を選ぶ場合、更新通知UI（`useRegisterSW`）は自前実装が必要になる。「操作中は更新ボタンを出さない」等のガードが要る場合がある。`main.jsx`でアプリ本体の兄弟としてグローバルマウントされたコンポーネントへ状態を伝える。`useSyncExternalStore`ベースの最小限store（例: 「印刷中かどうか」「プレイ中かどうか」等）経由で行う。props経由で直接つなげないため
- `build.sourcemap: true`を指定する（後述のE2E JSカバレッジのソースマッピングに必須）
- ディレクトリ構成: `views/`＝画面単位のコンポーネント、`components/`＝画面内で再利用する部品、`hooks/`＝状態・副作用ロジック、`utils/`＝純関数。**テストは実装と同じディレクトリに`*.test.jsx`/`*.test.js`を併置**する
- テストはvitest（jsdom環境）+ Testing Library。`vite.config.js`の`test.exclude`にE2E用ディレクトリ（例: `./e2e/**`）を追加し、vitestの既定`*.spec.js`マッチと衝突しないようにする
- **E2Eテスト（Playwright）はモックを作らず、実際にデプロイ済みのバックエンドAPIへ直結して実行する**。ローカル確認用の`npm run preview`サーバーのみがローカル動作で、APIは常に実環境を使う。これにより「モックとの乖離」による見落としを避けられる。一方、外部要因（バックエンドのコールドスタート・依存する外部AI/合成API等のレイテンシ）に起因する既知のflakyが発生し得る前提を受け入れる必要がある（対応の実例は後述のCI/CD節参照）
- E2Eの実行結果はスクリーンショット付きでPRへ自動投稿される（[`cicd-pipeline-specification.md`](cicd-pipeline-specification.md)「1. CIワークフロー」参照）。開発環境がCLIから離れている（スマートフォンのみ等）場合でも、実装した画面をその場で目視確認できる

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

- **`serverless-esbuild` + `package.individually: true`**: 関数ごとに実際に使うコードだけをesbuildでバンドルしてからzip化する。理由は速度だけではない。npm workspaces（`install-strategy=nested`）構成で関数数が増えると、`node_modules`をそのまま個別zip化する素朴な方式では問題が起きる。CIランナーのファイルディスクリプタ上限（既定1024）を超えることがある。`EMFILE: too many open files`でデプロイが失敗する（zipサイズ縮小・コールドスタート改善も副次効果）。ネイティブ依存や動的importのみのパッケージ（Chromiumバイナリ等）は`custom.esbuild.external`でバンドル対象から除外し、実体ファイルのまま含める
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
- **リアルタイム双方向通信が必要な機能はAPI Gateway WebSocket**を使う（`$connect`/`$disconnect`ルート＋業務ルート）。接続ごとの状態（役割・所属ルーム等）はDynamoDBで管理し、ブロードキャストは接続一覧をQuery（GSI）した上で`ApiGatewayManagementApi`へ個別送信する。この接続管理・ブロードキャスト部分には共通ロジックがある。内容は、接続取得、GSIによるルーム内接続一覧Queryである。加えて、`GoneException`（410）時の接続レコード自動掃除を含む個別送信、複数接続への一括配信、役割ガード＋catch共通化のラッパーでもある。これは`shared/lambda/webSocketBroadcast.js`としてsymlink共有できる。[`shared-ui-components.md`](shared-ui-components.md)と同様の索引は無いため、本ファイルから直接参照する。業務メッセージの内容自体（`type`ごとのディスパッチ処理等）はこの共通化の対象外である。フロントエンド側の設計知見は[`websocket-client-reconnect-pattern.md`](websocket-client-reconnect-pattern.md)を参照
- **IAMは`provider.iam.role.statements`に必要最小限のアクションのみ列挙する**。例えば`dynamodb:Scan/Query/GetItem/PutItem/UpdateItem`を用途ごとに区別する。他の関数を非同期起動する（`lambda:InvokeFunction`）等、循環参照が起きる権限は関数専用のIAMロールへ分離する
- ハンドラーはフラット配置（`src/`を必ずしも作らない）でよい。REST用（`handler.js`）・WebSocket用（`xxxHandler.js`）・共通レスポンス生成程度の粒度に分ける。REST（HTTPプロキシ統合）ハンドラ向けの共通CORSレスポンス生成関数がある（`jsonResponse`/`badRequest`/`notFound`/`serverError`）。これらは`shared/lambda/httpResponse.js`としてsymlink共有できる。API Gateway側でCORSを設定する構成（[`serverless-api-dynamodb-pattern.md`](serverless-api-dynamodb-pattern.md)）ではなく、Lambda側でCORSヘッダーを付与する構成向け
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

`.github/actions/deploy-serverless`複合action（[#147](https://github.com/bamiyanapp/dev-standards/issues/147)）を使う。`setup-node → npm ci → デプロイコマンド実行`の定型パターンに加え、`EMFILE`対策も持つ。npm workspaces + `package.individually: true`構成ではこの問題が起きがちである。そのため、ファイルディスクリプタのソフトリミットをハードリミットまで引き上げる対策をデフォルトで内蔵している。

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

フロントエンドは`.github/actions/deploy-github-pages`（[`standard-tech-stack.md`](standard-tech-stack.md)参照）でGitHub Pagesへデプロイする。`workspaces: true`を指定して同様にデプロイする。両方とも`reusable-cd.yml`の`release`ジョブ（semantic-release）に`needs`させ、新バージョンがリリースされた場合のみ実行する。

## 運用: オンデマンドバックアップワークフロー

PITR（Point-in-Time Recovery、過去35日間の任意の時点への復旧用、常時有効）とは別に、スキーマ移行・リソースインポート等の破壊的な作業の直前に「このタイミングの状態を明示的に残す」ための追加の保険として、手動実行できるオンデマンドバックアップworkflowを用意する。`workflow_dispatch`のみのため、スマートフォンのGitHub Web/モバイルアプリのActionsタブから実行できる。

```yaml
name: Backup DynamoDB Tables
run-name: Backup DynamoDB Tables (manual)

on:
  workflow_dispatch: {}

permissions:
  contents: read

jobs:
  backup:
    runs-on: ubuntu-latest
    env:
      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      AWS_DEFAULT_REGION: ap-northeast-1 # backend/serverless.ymlのprovider.regionと統一する
    steps:
      - name: Create on-demand backups
        run: |
          set -u

          # テーブル名はbackend/serverless.ymlのcustom.*TableNameと一致させる。
          # テーブル追加・リネーム時はこの配列も更新すること
          TABLES=(
            "<table-name-1>"
            "<table-name-2>"
          )

          TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
          FAILED=0

          echo "## DynamoDB バックアップ結果 (${TIMESTAMP})" >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "| テーブル | 結果 | Backup ARN |" >> "$GITHUB_STEP_SUMMARY"
          echo "|---|---|---|" >> "$GITHUB_STEP_SUMMARY"

          for TABLE in "${TABLES[@]}"; do
            BACKUP_NAME="${TABLE}-manual-${TIMESTAMP}"
            if RESULT=$(aws dynamodb create-backup \
              --table-name "$TABLE" \
              --backup-name "$BACKUP_NAME" \
              --output json 2>&1); then
              ARN=$(echo "$RESULT" | jq -r '.BackupDetails.BackupArn')
              echo "✅ ${TABLE}: ${ARN}"
              echo "| ${TABLE} | ✅ 成功 | \`${ARN}\` |" >> "$GITHUB_STEP_SUMMARY"
            else
              echo "❌ ${TABLE}: ${RESULT}" >&2
              echo "| ${TABLE} | ❌ 失敗 | ${RESULT} |" >> "$GITHUB_STEP_SUMMARY"
              FAILED=1
            fi
          done

          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "オンデマンドバックアップはPITRと異なり自動削除されないため、不要になったら手動で削除すること。" >> "$GITHUB_STEP_SUMMARY"

          if [ "$FAILED" -ne 0 ]; then
            echo "一部のテーブルでバックアップに失敗した。上記サマリーを確認すること" >&2
            exit 1
          fi
```

## 運用: CloudFormationリソースインポート（スタック分割・移管）

Serverless Framework（`osls`）は、既存のAWSリソースを新しいCloudFormationスタックの管理下へ取り込む「IMPORT」操作に対応していない。ステートフルリソース（DynamoDBテーブル等）を既存の`serverless.yml`から専用スタックへ分離する場合（[`blue-green-stage-pattern.md`](blue-green-stage-pattern.md)の導入等）、AWS CLIを直接オーケストレーションして実現する。

危険な操作（既存リソースの取り込み）を伴うため、change set作成のみを行う`preview`と、実際に実行する`execute`の二段階に分ける。

**事前準備（本workflow実行前）**:

1. 元の`serverless.yml`から対象リソースの定義を削除したPRをマージし、CDで本番へデプロイしておく。`DeletionPolicy: Retain`により物理リソースは削除されず、スタックの管理対象から外れて孤立した状態になる。CloudFormationのIMPORTは、取り込み対象の物理リソースがどのスタックにも属していないことを要求するため、この手順が必要になる
2. 新しい専用スタック定義（下記の`<data-stack-config>`、分離後のリソースのみを含む）を用意する

```yaml
name: Import Data Resources (CloudFormation IMPORT)
run-name: Import Data Resources (manual, ${{ inputs.action }})

on:
  workflow_dispatch:
    inputs:
      action:
        description: "preview: change setを作成して内容を確認するのみ（安全）。execute: 作成済みのchange setを実行する（実際にリソースが移管される）"
        required: true
        type: choice
        options:
          - preview
          - execute

permissions:
  contents: read

env:
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  AWS_DEFAULT_REGION: ap-northeast-1
  STACK_NAME: <data-stack-name>
  CHANGE_SET_NAME: <data-stack-name>-import

jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          submodules: true

      - uses: actions/setup-node@v7
        with:
          node-version: 22

      - name: Install backend dependencies
        working-directory: <backend-dir>
        run: npm ci

      # 読み取り専用API（DescribeTable等）のみを使い、実際のAWSリソースの
      # 現在の構成が新スタック定義と一致するかを事前確認する任意のスクリプト
      # （プロダクト固有のため同梱しない）。不一致があればここで止まり、
      # change set作成（実際のIMPORT操作）には進ませない
      - name: Verify live resource configuration (preview only)
        if: inputs.action == 'preview'
        working-directory: <backend-dir>
        run: |
          set -eu -o pipefail
          ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
          node <verify-script>.js "$ACCOUNT_ID" | tee verify-result.md
          {
            echo "## 実リソース構成の事前確認"
            echo ""
            cat verify-result.md
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Generate CloudFormation template (preview only)
        if: inputs.action == 'preview'
        working-directory: <backend-dir>
        run: |
          set -eu
          npx osls package --config <data-stack-config> --stage shared --package .data-package

          # osls（deploymentMethod: directでも）は常にデプロイ用S3バケット
          # （ServerlessDeploymentBucket・そのバケットポリシー）をテンプレートへ
          # 含めてしまう。CloudFormationのIMPORT（新規スタック作成）は、
          # テンプレート内の全リソースがresources-to-importに列挙されていることを
          # 要求するため、実在しないこの2リソースを含んだままでは失敗する。
          # 取り込み対象外として事前に取り除く
          node -e "
            const fs = require('fs');
            const path = '.data-package/cloudformation-template-update-stack.json';
            const template = JSON.parse(fs.readFileSync(path, 'utf-8'));
            delete template.Resources.ServerlessDeploymentBucket;
            delete template.Resources.ServerlessDeploymentBucketPolicy;
            delete template.Outputs;
            fs.writeFileSync(path, JSON.stringify(template, null, 2));
            console.log('Resources in template:', Object.keys(template.Resources));
          "

      - name: Build resources-to-import mapping (preview only)
        if: inputs.action == 'preview'
        working-directory: <backend-dir>
        run: |
          set -eu
          ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
          cat > .data-package/resources-to-import.json <<EOF
          [
            {"ResourceType": "AWS::DynamoDB::Table", "LogicalResourceId": "<LogicalId1>", "ResourceIdentifier": {"TableName": "<table-name-1>"}},
            {"ResourceType": "AWS::S3::Bucket", "LogicalResourceId": "<LogicalId2>", "ResourceIdentifier": {"BucketName": "<bucket-name>-${ACCOUNT_ID}"}}
          ]
          EOF

      - name: Create change set (preview only)
        if: inputs.action == 'preview'
        working-directory: <backend-dir>
        run: |
          set -eu
          aws cloudformation create-change-set \
            --stack-name "$STACK_NAME" \
            --change-set-name "$CHANGE_SET_NAME" \
            --change-set-type IMPORT \
            --template-body file://.data-package/cloudformation-template-update-stack.json \
            --resources-to-import file://.data-package/resources-to-import.json

          echo "change setの作成を待機中..."
          aws cloudformation wait change-set-create-complete \
            --stack-name "$STACK_NAME" \
            --change-set-name "$CHANGE_SET_NAME" || true

      - name: Describe change set (preview only)
        if: inputs.action == 'preview'
        working-directory: <backend-dir>
        run: |
          set -eu
          aws cloudformation describe-change-set \
            --stack-name "$STACK_NAME" \
            --change-set-name "$CHANGE_SET_NAME" > change-set-result.json

          STATUS=$(node -e "console.log(require('./change-set-result.json').Status)")
          REASON=$(node -e "console.log(require('./change-set-result.json').StatusReason || '')")

          echo "Status: ${STATUS}"
          [ -n "$REASON" ] && echo "Reason: ${REASON}"

          {
            echo "## CloudFormation IMPORT change set プレビュー"
            echo ""
            echo "Status: \`${STATUS}\`"
          } >> "$GITHUB_STEP_SUMMARY"
          if [ -n "$REASON" ]; then
            echo "" >> "$GITHUB_STEP_SUMMARY"
            echo "理由: ${REASON}" >> "$GITHUB_STEP_SUMMARY"
          fi
          {
            echo ""
            echo "| リソース | Action | Replacement |"
            echo "|---|---|---|"
          } >> "$GITHUB_STEP_SUMMARY"

          node -e "
            const result = require('./change-set-result.json');
            for (const c of (result.Changes || [])) {
              const rc = c.ResourceChange;
              console.log(\`| \${rc.LogicalResourceId} | \${rc.Action} | \${rc.Replacement || '-'} |\`);
            }
          " >> "$GITHUB_STEP_SUMMARY"

          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "全リソースのActionが\`Import\`になっていることを確認してから、action: executeで実行すること。Add/Remove/Modify-replaceが含まれる場合は実行せず調査すること。" >> "$GITHUB_STEP_SUMMARY"

          if [ "$STATUS" != "CREATE_COMPLETE" ] && [ "$STATUS" != "REVIEW_IN_PROGRESS" ]; then
            echo "change setの作成に失敗した可能性がある。Statusを確認すること" >&2
            exit 1
          fi

      - name: Execute change set (execute only)
        if: inputs.action == 'execute'
        working-directory: <backend-dir>
        run: |
          set -eu
          aws cloudformation execute-change-set \
            --stack-name "$STACK_NAME" \
            --change-set-name "$CHANGE_SET_NAME"

          echo "スタックの更新完了を待機中..."
          aws cloudformation wait stack-import-complete --stack-name "$STACK_NAME"

          aws cloudformation describe-stacks --stack-name "$STACK_NAME" > stack-result.json
          STATUS=$(node -e "console.log(require('./stack-result.json').Stacks[0].StackStatus)")

          {
            echo "## CloudFormation IMPORT 実行結果"
            echo ""
            echo "StackStatus: \`${STATUS}\`"
          } >> "$GITHUB_STEP_SUMMARY"

          if [ "$STATUS" != "IMPORT_COMPLETE" ]; then
            echo "インポートが完了しなかった。AWSコンソールでスタックイベントを確認すること" >&2
            exit 1
          fi
          echo "インポート成功。リソースが${STACK_NAME}スタックの管理下に入った。" >> "$GITHUB_STEP_SUMMARY"
```

change setは一定時間後に自動的に失効する。previewから時間を空けすぎた場合は再度previewから実行すること。

## CI/CD連携（`reusable-ci.yml`）

[`cicd-pipeline-specification.md`](cicd-pipeline-specification.md)の機能を、このアーキテクチャ向けに以下の入力で有効化する。

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

**実バックエンド直結のE2Eが外部要因（バックエンドのコールドスタート等）で既知のflakyになる場合**、キャッシュのウォームアップやCI側の自動リトライは一般に費用対効果が見合わないことが多い。該当箇所を`try/catch`で囲む。タイムアウト時に`test.skip(true, reason)`でそのテストのみskip扱いにする（テスト内容自体は60秒等の許容時間内に収まった実行では引き続き全て検証される）。この運用上の割り切りが有効な場合がある。

## ドキュメント自動生成（`serverless.yml`駆動）

`backend/serverless.yml`は環境変数・APIルート・DynamoDBテーブル定義等、プロダクトの構成情報を集約した単一の正（source of truth）である。これを手動でドキュメントへ転記すると、`serverless.yml`の変更に追従できず実態と乖離する（ドキュメントドリフト）。`serverless.yml`をパースしてMarkdownを自動生成し、`docs/generated/`へ出力する仕組みを設けると、この乖離を構造的に防げる。

- **共通ローダー**: `js-yaml`の`CORE_SCHEMA`にカスタムスキーマを追加する。CloudFormation組み込み関数（`!GetAtt`・`!Sub`・`!Ref`等）のタグを`{ "Fn::<Tag>": <値> }`として素通しするだけの最小限のものである。これを使ってパースする（値の解決は行わない。静的なルート・テーブル定義の抽出が目的のため）。`${self:custom.xxx}`変数参照は`custom`セクションの実値へ解決する
- **個別の生成スクリプト**: 共通ローダーが返したオブジェクトから、用途ごとに必要な情報だけを抽出する。環境変数の一覧・HTTP APIルート一覧・WebSocketルート一覧・DynamoDBテーブル定義（属性・キースキーマ・GSI・TTL）等をMarkdownへ整形する。テーブル形式が向くもの（環境変数の一覧等）がある。Mermaid図（ER図・シーケンス図・フロー図）が向くもの（テーブル関連・API呼び出しフロー・アーキテクチャ図）もある。両者は[`documentation-format-conventions.md`](documentation-format-conventions.md)の基準で使い分ける
- **出力先とワークフロー**: 生成先の`docs/generated/`配下に「手動編集禁止・再生成コマンドで上書きされる」旨を明記したREADMEを置く。`npm run docs:generate`のような単一コマンドで全生成スクリプトを実行できるようにする。`serverless.yml`を変更したPRではこのコマンドを実行してから生成物ごとコミットする運用にする

コード自体はプロダクトごとに`serverless.yml`の構成（リソース名・関数名等）が異なるため、共通ローダー・生成スクリプトのsymlink共有はせず、このパターン記述と実装例の参照にとどめる。

## 実例

karuta（`bamiyanapp/karuta`）の`frontend/`・`backend/serverless.yml`が本パターンの実装例である。`.github/workflows/ci.yml`・`cd.yml`も同様に完全な実装例である。ドキュメント自動生成は`scripts/docs/serverless-yaml.js`（共通ローダー）が実例である。`scripts/docs/generate-env-vars.js`等の各生成スクリプト・`docs/generated/`も実例である。
