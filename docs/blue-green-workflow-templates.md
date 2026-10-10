# ブルーグリーン運用workflowテンプレート集

[`blue-green-stage-pattern.md`](blue-green-stage-pattern.md)で説明した設計を実際に動かすGitHub Actions workflowのコピー＆調整用テンプレートをまとめる。CloudFront Functionsのコードテンプレートは同ドキュメント側に掲載済みのため、本ドキュメントでは運用側のworkflow（自動昇格・手動per-stageデプロイ等）のみを扱う。

掲載順は、新規・既存リポジトリへ導入する際の組み込み順と一致させている。導入手順の全体像は[`blue-green-stage-pattern.md`](blue-green-stage-pattern.md)「導入手順」を参照する。

各テンプレートは[bamiyanapp/karuta](https://github.com/bamiyanapp/karuta)の実装（issue #1331・#1449・#1448等）から、プロダクト固有のissue番号・コメントを除いて一般化したものである。以下の値はプロダクトごとに書き換える。

| プレースホルダー | 内容 | karutaでの実際の値 |
|---|---|---|
| `<service>` | デプロイツールのサービス名 | `karuta-app` |
| `<infra-shared-stack>` | S3+CloudFrontの固定インフラスタック名 | `karuta-infra-shared` |
| `<frontend-workspace>` | frontendのnpm workspace名（npm workspaces構成でない場合は調整） | `frontend` |
| `<backend-dir>` | backendのデプロイ対象ディレクトリ | `backend` |

## 自動昇格ワークフロー（promote-canary.yml）

canaryデプロイから猶予期間（`GRACE_PERIOD_DAYS`）が経過し、`force_stable`によるロールバックが行われていなければ、canaryの内容をstableへ自動的に昇格し、canaryスタックを削除する。同時に、canaryへの日次バッチ反映（[`blue-green-stage-pattern.md`](blue-green-stage-pattern.md)「canaryデプロイの日次バッチ化」参照）・緊急デプロイ後の自動最新化（「自動昇格・管理者ロールバック・詰まりの自動解消」参照）も、同じ定期実行の中で判定する。

```yaml
name: Promote Canary to Stable
run-name: Promote Canary to Stable (${{ github.event_name == 'schedule' && 'scheduled' || 'manual' }})

on:
  schedule:
    - cron: "37 17 * * *" # 毎日 02:37 JST（UTC 17:37）に判定する。プロダクトに応じて調整する
  workflow_dispatch: {}

permissions:
  contents: read

env:
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  AWS_DEFAULT_REGION: ap-northeast-1

jobs:
  promote:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7
        with:
          submodules: true

      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 22

      - name: Install dependencies
        run: npm ci

      - name: KVS ARNを解決する
        id: kvs
        working-directory: infra
        run: |
          set -eu
          INFO=$(npx osls info --config serverless.yml --stage shared --verbose 2>/dev/null)
          KVS_ARN=$(echo "$INFO" | grep "RoutingKeyValueStoreArn" | sed -E 's/^[^:]*: *//')
          echo "kvs_arn=${KVS_ARN}" >> "$GITHUB_OUTPUT"

      - name: 昇格対象かどうかを判定する
        id: check
        run: |
          set -eu
          GRACE_PERIOD_DAYS=1 # 運用しながら調整する。最初は1週間程度で始めてもよい

          if ! aws cloudformation describe-stacks --stack-name <service>-canary >/dev/null 2>&1; then
            echo "canaryスタックが存在しないため対象外"
            echo "eligible=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          LAST_UPDATED=$(aws cloudformation describe-stacks --stack-name <service>-canary --query "Stacks[0].LastUpdatedTime" --output text)
          if [ "$LAST_UPDATED" = "None" ]; then
            LAST_UPDATED=$(aws cloudformation describe-stacks --stack-name <service>-canary --query "Stacks[0].CreationTime" --output text)
          fi
          LAST_UPDATED_EPOCH=$(date -d "$LAST_UPDATED" +%s)
          NOW_EPOCH=$(date -u +%s)
          ELAPSED_DAYS=$(( (NOW_EPOCH - LAST_UPDATED_EPOCH) / 86400 ))
          echo "canaryスタックの最終更新から${ELAPSED_DAYS}日経過（${LAST_UPDATED}）"

          if [ "$ELAPSED_DAYS" -lt "$GRACE_PERIOD_DAYS" ]; then
            echo "猶予期間（${GRACE_PERIOD_DAYS}日）未経過のため対象外"
            echo "eligible=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          KVS_ARN="${{ steps.kvs.outputs.kvs_arn }}"
          FORCE_STABLE=$(aws cloudfront-keyvaluestore get-key --region us-east-1 --kvs-arn "$KVS_ARN" --key "force_stable" --query Value --output text 2>/dev/null || echo "false")
          if [ "$FORCE_STABLE" = "true" ]; then
            echo "force_stableがtrue（ロールバック済み）のため対象外"
            echo "eligible=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          # 緊急手動デプロイ（deploy-backend-stage.ymlでstage=stable）でstableへ直接
          # デプロイした場合、canaryを経由していないためcanaryがstableより古い内容の
          # ままになることがある。この状態で昇格すると、緊急対応した内容がcanaryの
          # 古いコードで上書きされ退行してしまう。stableの最終更新がcanaryより新しい
          # （＝canaryを追い越している）場合は、昇格を安全側にスキップする
          if aws cloudformation describe-stacks --stack-name <service>-stable >/dev/null 2>&1; then
            STABLE_LAST_UPDATED=$(aws cloudformation describe-stacks --stack-name <service>-stable --query "Stacks[0].LastUpdatedTime" --output text)
            if [ "$STABLE_LAST_UPDATED" = "None" ]; then
              STABLE_LAST_UPDATED=$(aws cloudformation describe-stacks --stack-name <service>-stable --query "Stacks[0].CreationTime" --output text)
            fi
            STABLE_LAST_UPDATED_EPOCH=$(date -d "$STABLE_LAST_UPDATED" +%s)
            if [ "$STABLE_LAST_UPDATED_EPOCH" -gt "$LAST_UPDATED_EPOCH" ]; then
              echo "stableの最終更新（${STABLE_LAST_UPDATED}）がcanaryより新しいため対象外"
              echo "eligible=false" >> "$GITHUB_OUTPUT"
              echo "stable_ahead_of_canary=true" >> "$GITHUB_OUTPUT"
              exit 0
            fi
          fi

          echo "eligible=true" >> "$GITHUB_OUTPUT"

      - name: 1. KVSの重みをcanary 100%へ更新する
        if: steps.check.outputs.eligible == 'true'
        run: |
          set -eu
          KVS_ARN="${{ steps.kvs.outputs.kvs_arn }}"
          ETAG=$(aws cloudfront-keyvaluestore describe-key-value-store --region us-east-1 --kvs-arn "$KVS_ARN" --query ETag --output text)
          aws cloudfront-keyvaluestore put-key --region us-east-1 --kvs-arn "$KVS_ARN" --if-match "$ETAG" --key "canary_weight" --value "100" >/dev/null

      - name: "2. canaryのコードでbackend stableスタックを再デプロイする（昇格）"
        if: steps.check.outputs.eligible == 'true'
        uses: bamiyanapp/dev-standards/.github/actions/deploy-serverless@main
        with:
          working-directory: <backend-dir>
          node-version: 22
          deploy-command: npx osls deploy --stage stable
          workspaces: true
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: "2. canaryのビルドでfrontend stable/を再デプロイする（昇格）"
        if: steps.check.outputs.eligible == 'true'
        run: |
          set -eu
          npm run build:stable --workspace=<frontend-workspace>
          OUTPUTS=$(aws cloudformation describe-stacks --stack-name <infra-shared-stack> --query "Stacks[0].Outputs" --output json)
          BUCKET=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="FrontendBucketName") | .OutputValue')
          DIST_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="FrontendDistributionId") | .OutputValue')
          aws s3 sync <frontend-workspace>/dist "s3://${BUCKET}/stable/" --delete
          aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/stable/*'

      - name: 3. canaryスタックを削除する
        if: steps.check.outputs.eligible == 'true'
        working-directory: <backend-dir>
        run: npx osls remove --stage canary

      - name: 4. KVSをリセットする（重みを既定値10%、force_stableをfalseへ）
        if: steps.check.outputs.eligible == 'true'
        run: |
          set -eu
          KVS_ARN="${{ steps.kvs.outputs.kvs_arn }}"
          ETAG=$(aws cloudfront-keyvaluestore describe-key-value-store --region us-east-1 --kvs-arn "$KVS_ARN" --query ETag --output text)
          aws cloudfront-keyvaluestore put-key --region us-east-1 --kvs-arn "$KVS_ARN" --if-match "$ETAG" --key "canary_weight" --value "10" >/dev/null
          ETAG2=$(aws cloudfront-keyvaluestore describe-key-value-store --region us-east-1 --kvs-arn "$KVS_ARN" --query ETag --output text)
          aws cloudfront-keyvaluestore put-key --region us-east-1 --kvs-arn "$KVS_ARN" --if-match "$ETAG2" --key "force_stable" --value "false" >/dev/null
          # canaryスタックを削除したため、/canary/への明示アクセス時にstableへ
          # フォールバックできるようcanary_existsをfalseへ更新する
          ETAG3=$(aws cloudfront-keyvaluestore describe-key-value-store --region us-east-1 --kvs-arn "$KVS_ARN" --query ETag --output text)
          aws cloudfront-keyvaluestore put-key --region us-east-1 --kvs-arn "$KVS_ARN" --if-match "$ETAG3" --key "canary_exists" --value "false" >/dev/null

      - name: "5. canaryを最新化すべきか判定する"
        id: refresh
        run: |
          set -eu
          KVS_ARN="${{ steps.kvs.outputs.kvs_arn }}"
          REFRESH=false

          if [ "${{ steps.check.outputs.stable_ahead_of_canary }}" = "true" ]; then
            # stableがcanaryより新しい＝canaryは古くて意味の無いトライアルのため、
            # キュー待ちの有無に関わらず強制的に最新化する
            REFRESH=true
          else
            FREE=false
            if ! aws cloudformation describe-stacks --stack-name <service>-canary >/dev/null 2>&1; then
              FREE=true
            else
              FORCE_STABLE=$(aws cloudfront-keyvaluestore get-key --region us-east-1 --kvs-arn "$KVS_ARN" --key "force_stable" --query Value --output text 2>/dev/null || echo "false")
              if [ "$FORCE_STABLE" = "true" ]; then
                FREE=true
              fi
            fi
            if [ "$FREE" = "true" ]; then
              PENDING=$(aws cloudfront-keyvaluestore get-key --region us-east-1 --kvs-arn "$KVS_ARN" --key "canary_queue_pending" --query Value --output text 2>/dev/null || echo "false")
              if [ "$PENDING" = "true" ]; then
                REFRESH=true
              fi
            fi
          fi
          echo "refresh=${REFRESH}" >> "$GITHUB_OUTPUT"

      - name: "5. 最新のmain HEADでbackend canaryをデプロイする"
        if: steps.refresh.outputs.refresh == 'true'
        uses: bamiyanapp/dev-standards/.github/actions/deploy-serverless@main
        with:
          working-directory: <backend-dir>
          node-version: 22
          deploy-command: npx osls deploy --stage canary
          workspaces: true
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: "5. 最新のmain HEADでfrontend canaryをデプロイする"
        if: steps.refresh.outputs.refresh == 'true'
        run: |
          set -eu
          npm run build:canary --workspace=<frontend-workspace>
          OUTPUTS=$(aws cloudformation describe-stacks --stack-name <infra-shared-stack> --query "Stacks[0].Outputs" --output json)
          BUCKET=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="FrontendBucketName") | .OutputValue')
          DIST_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="FrontendDistributionId") | .OutputValue')
          aws s3 sync <frontend-workspace>/dist "s3://${BUCKET}/canary/" --delete
          aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/canary/*'

      - name: canaryを最新化したら、canary_queue_pendingをfalseへリセットし、canary_existsをtrueにする
        if: steps.refresh.outputs.refresh == 'true'
        run: |
          set -eu
          KVS_ARN="${{ steps.kvs.outputs.kvs_arn }}"
          ETAG=$(aws cloudfront-keyvaluestore describe-key-value-store --region us-east-1 --kvs-arn "$KVS_ARN" --query ETag --output text)
          aws cloudfront-keyvaluestore put-key --region us-east-1 --kvs-arn "$KVS_ARN" --if-match "$ETAG" --key "canary_queue_pending" --value "false" >/dev/null
          ETAG2=$(aws cloudfront-keyvaluestore describe-key-value-store --region us-east-1 --kvs-arn "$KVS_ARN" --query ETag --output text)
          aws cloudfront-keyvaluestore put-key --region us-east-1 --kvs-arn "$KVS_ARN" --if-match "$ETAG2" --key "canary_exists" --value "true" >/dev/null
```

## 参考実装

具体的な実装の経緯・issue番号は[bamiyanapp/karuta](https://github.com/bamiyanapp/karuta)の`.github/workflows/promote-canary.yml`を参照する。
