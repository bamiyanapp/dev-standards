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

## 運用状態の可視化ワークフロー（canary-status.yml）

KVS・CloudFormationスタックの状態（重み・ロールバック状態・キュー待ち・最終更新時刻・昇格予定日時・各stageの配信中バージョン）は、AWS CLIで見るしかなくPR・CIのログからは掴めない。スマートフォンのGitHub Actions画面から手動実行するだけで現在の状態をJob Summaryへ出力し、1時間おきの定期実行で`docs/generated/canary-status.md`へコミットすることで、GitHubのファイルビュー・コミット履歴だけで最新状態を確認できるようにする。デプロイは一切行わない状態確認専用のworkflow。

mainブランチがリポジトリルール（Rulesets）で「変更は必ずPR経由」になっている場合、直接push（`git push origin HEAD:main`）は拒否される。[`reusable-ci.yml`](reusable-workflows-reference.md)の`render-mermaid-diagrams`ジョブと同じ「新ブランチへpush→PR作成→API経由でsquash merge」方式を使う。この自動コミット部分は、本来は共通のcomposite actionへ切り出すべき重複（issue #830で検討中）である。#830が利用可能になったら、以下のテンプレートの該当ステップをcomposite action呼び出しへ置き換える。

```yaml
name: Canary Status
run-name: Canary Status (${{ github.event_name == 'schedule' && 'scheduled' || 'manual' }})

on:
  schedule:
    - cron: "6 * * * *" # 1時間おき（分を0からずらし、他ワークフローとの同時実行集中を避ける）
  workflow_dispatch: {}

permissions:
  contents: write
  pull-requests: write

jobs:
  status:
    runs-on: ubuntu-latest
    env:
      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      AWS_DEFAULT_REGION: ap-northeast-1
    steps:
      - name: Checkout
        uses: actions/checkout@v7
        with:
          submodules: true
          fetch-depth: 0 # canary最終更新以降のコミット履歴からPRリンクを抽出するために全履歴が必要

      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 22

      - name: Install infra dependencies
        working-directory: infra
        run: npm ci

      - name: KVS ARNを解決する
        id: kvs
        working-directory: infra
        run: |
          set -eu
          INFO=$(npx osls info --config serverless.yml --stage shared --verbose 2>/dev/null)
          KVS_ARN=$(echo "$INFO" | grep "RoutingKeyValueStoreArn" | sed -E 's/^[^:]*: *//')
          echo "kvs_arn=${KVS_ARN}" >> "$GITHUB_OUTPUT"

      - name: 現在の運用状態を取得する
        id: status
        run: |
          set -eu
          GRACE_PERIOD_DAYS=1 # promote-canary.ymlと同じ値
          KVS_ARN="${{ steps.kvs.outputs.kvs_arn }}"

          # URLだけでは判別できないため、タイトル付きのMarkdownリンクとして表示する。
          # squash mergeのコミット件名は末尾の"(#1234)"を除けばPRタイトルそのもの
          # なので、GitHub APIを呼ばずに件名から直接組み立てる
          pr_link() {
            local subject="$1"
            local num title
            num=$(echo "$subject" | grep -oE '#[0-9]+\)$' | tr -d '#)')
            title=$(echo "$subject" | sed -E 's/ *\(#[0-9]+\)$//')
            echo "- [#${num} ${title}](https://github.com/<owner>/<repo>/pull/${num})"
          }

          CANARY_WEIGHT=$(aws cloudfront-keyvaluestore get-key --region us-east-1 --kvs-arn "$KVS_ARN" --key "canary_weight" --query Value --output text 2>/dev/null || echo "（未設定）")
          FORCE_STABLE=$(aws cloudfront-keyvaluestore get-key --region us-east-1 --kvs-arn "$KVS_ARN" --key "force_stable" --query Value --output text 2>/dev/null || echo "false")
          PENDING=$(aws cloudfront-keyvaluestore get-key --region us-east-1 --kvs-arn "$KVS_ARN" --key "canary_queue_pending" --query Value --output text 2>/dev/null || echo "false")
          echo "canary_weight=${CANARY_WEIGHT}" >> "$GITHUB_OUTPUT"
          echo "force_stable=${FORCE_STABLE}" >> "$GITHUB_OUTPUT"
          echo "canary_queue_pending=${PENDING}" >> "$GITHUB_OUTPUT"

          if ! aws cloudformation describe-stacks --stack-name <service>-canary >/dev/null 2>&1; then
            echo "canary_exists=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          echo "canary_exists=true" >> "$GITHUB_OUTPUT"

          LAST_UPDATED=$(aws cloudformation describe-stacks --stack-name <service>-canary --query "Stacks[0].LastUpdatedTime" --output text)
          if [ "$LAST_UPDATED" = "None" ]; then
            LAST_UPDATED=$(aws cloudformation describe-stacks --stack-name <service>-canary --query "Stacks[0].CreationTime" --output text)
          fi
          LAST_UPDATED_EPOCH=$(date -d "$LAST_UPDATED" +%s)
          echo "canary_last_updated=$(TZ=Asia/Tokyo date -d "@${LAST_UPDATED_EPOCH}" +"%Y-%m-%d %H:%M:%S JST")" >> "$GITHUB_OUTPUT"

          ELIGIBLE_EPOCH=$(( LAST_UPDATED_EPOCH + GRACE_PERIOD_DAYS * 86400 ))
          ELIGIBLE_AT=$(TZ=Asia/Tokyo date -d "@${ELIGIBLE_EPOCH}" +"%Y-%m-%d %H:%M:%S JST")
          echo "promotion_eligible_at=${ELIGIBLE_AT}" >> "$GITHUB_OUTPUT"

          # canaryの最終更新以降にmainへマージされたPRをリンクで示す。squash mergeの
          # コミットメッセージ末尾に付くGitHub標準の"(#1234)"形式を持つ件名のみを
          # 対象とする（重複は保持順でuniqする）
          PR_SUBJECTS=$(git log --since="$LAST_UPDATED" --pretty=format:'%s' origin/main | grep -E '\(#[0-9]+\)$' | awk '!seen[$0]++')
          {
            echo "queued_pr_links<<PR_LINKS_EOF"
            if [ -n "$PR_SUBJECTS" ]; then
              while IFS= read -r subject; do
                pr_link "$subject"
              done <<< "$PR_SUBJECTS"
            else
              echo "（該当するPRが見つからなかった）"
            fi
            echo "PR_LINKS_EOF"
          } >> "$GITHUB_OUTPUT"

          # 「canaryには反映済みだがstableへはまだ昇格していない」PRを区別して示す。
          # stableスタックのLastUpdatedTime（promote-canary.ymlのstable_ahead_of_canary
          # 判定と同じ取得方法）からcanaryの最終更新時刻までの間にmainへマージされた
          # PRが対象
          if aws cloudformation describe-stacks --stack-name <service>-stable >/dev/null 2>&1; then
            STABLE_LAST_UPDATED=$(aws cloudformation describe-stacks --stack-name <service>-stable --query "Stacks[0].LastUpdatedTime" --output text)
            if [ "$STABLE_LAST_UPDATED" = "None" ]; then
              STABLE_LAST_UPDATED=$(aws cloudformation describe-stacks --stack-name <service>-stable --query "Stacks[0].CreationTime" --output text)
            fi
            STABLE_LAST_UPDATED_EPOCH=$(date -d "$STABLE_LAST_UPDATED" +%s)
            echo "stable_last_updated=$(TZ=Asia/Tokyo date -d "@${STABLE_LAST_UPDATED_EPOCH}" +"%Y-%m-%d %H:%M:%S JST")" >> "$GITHUB_OUTPUT"

            if [ "$STABLE_LAST_UPDATED_EPOCH" -gt "$LAST_UPDATED_EPOCH" ]; then
              IN_CANARY_PR_SUBJECTS=""
            else
              IN_CANARY_PR_SUBJECTS=$(git log --since="$STABLE_LAST_UPDATED" --until="$LAST_UPDATED" --pretty=format:'%s' origin/main | grep -E '\(#[0-9]+\)$' | awk '!seen[$0]++')
            fi
          else
            echo "stable_last_updated=" >> "$GITHUB_OUTPUT"
            IN_CANARY_PR_SUBJECTS=""
          fi
          {
            echo "in_canary_pr_links<<IN_CANARY_LINKS_EOF"
            if [ -n "$IN_CANARY_PR_SUBJECTS" ]; then
              while IFS= read -r subject; do
                pr_link "$subject"
              done <<< "$IN_CANARY_PR_SUBJECTS"
            else
              echo "（該当するPRが見つからなかった）"
            fi
            echo "IN_CANARY_LINKS_EOF"
          } >> "$GITHUB_OUTPUT"

      # issue #1511のような不整合（canaryが古いバージョンを配信し続ける）の早期検知に
      # 役立つ。各stageのバージョン応答エンドポイント（frontend-ui-conventions.md
      # 「主要画面へのバージョン表示」参照）を叩き、配信中のバージョンを取得する。
      # 疎通不可の場合も他の取得処理と同様にエラーにせず「取得できなかった」旨を
      # 表示する
      - name: canary/stableの配信中バージョンを取得する
        id: version
        run: |
          set -eu
          fetch_version() {
            local url="$1"
            local body
            if ! body=$(curl -fsS --max-time 10 "${url}/get-version" 2>/dev/null); then
              echo "（取得できなかった）"
              return
            fi
            local version
            version=$(echo "$body" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).version||'（取得できなかった）')}catch{console.log('（取得できなかった）')}})")
            echo "$version"
          }
          CANARY_VERSION=$(fetch_version "$(grep -oE 'https://[^ ]+' <frontend-workspace>/.env.canary | head -1)")
          STABLE_VERSION=$(fetch_version "$(grep -oE 'https://[^ ]+' <frontend-workspace>/.env.stable | head -1)")
          echo "canary_version=${CANARY_VERSION}" >> "$GITHUB_OUTPUT"
          echo "stable_version=${STABLE_VERSION}" >> "$GITHUB_OUTPUT"

      - name: 次回promote-canary.yml実行予定を計算する
        id: schedule
        run: |
          set -eu
          NOW_EPOCH=$(date -u +%s)
          TODAY_RUN_EPOCH=$(date -u -d "today 17:37" +%s) # promote-canary.ymlのcronと一致させる
          if [ "$NOW_EPOCH" -lt "$TODAY_RUN_EPOCH" ]; then
            NEXT_RUN_EPOCH=$TODAY_RUN_EPOCH
          else
            NEXT_RUN_EPOCH=$(date -u -d "tomorrow 17:37" +%s)
          fi
          NEXT_RUN_AT=$(TZ=Asia/Tokyo date -d "@${NEXT_RUN_EPOCH}" +"%Y-%m-%d %H:%M:%S JST")
          echo "next_promote_run_at=${NEXT_RUN_AT}" >> "$GITHUB_OUTPUT"

      - name: docs/generated/canary-status.mdを生成する
        if: always()
        run: |
          set -eu
          {
            echo "# canary運用状態"
            echo ""
            echo "このファイルは\`canary-status.yml\`（1時間おきのスケジュール実行）が自動更新する。手動で編集しないこと。"
            echo ""
            echo "最終更新日時: $(TZ=Asia/Tokyo date +"%Y-%m-%d %H:%M:%S JST")。"
            echo ""
            echo "| 項目 | 値 |"
            echo "|---|---|"
            echo "| canary_weight（canaryへ振り分ける割合） | ${{ steps.status.outputs.canary_weight }}% |"
            echo "| force_stable（管理者ロールバック中か） | ${{ steps.status.outputs.force_stable }} |"
            echo "| canary_queue_pending（反映待ちのマージがあるか） | ${{ steps.status.outputs.canary_queue_pending }} |"
            echo "| canaryスタックが存在するか | ${{ steps.status.outputs.canary_exists }} |"
          } > docs/generated/canary-status.md
          if [ "${{ steps.status.outputs.canary_exists }}" = "true" ]; then
            {
              echo "| stableの最終更新 | ${{ steps.status.outputs.stable_last_updated || '（stableスタックが存在しない）' }} |"
              echo "| stableの配信中バージョン | ${{ steps.version.outputs.stable_version }} |"
              echo "| canaryの最終更新 | ${{ steps.status.outputs.canary_last_updated }} |"
              echo "| canaryの配信中バージョン | ${{ steps.version.outputs.canary_version }} |"
              echo "| 本番昇格の条件を満たす日時 | ${{ steps.status.outputs.promotion_eligible_at }}以降 |"
              echo "| 次回の定期チェック予定 | ${{ steps.schedule.outputs.next_promote_run_at }} |"
              echo ""
              echo "## canaryに反映済み・stable昇格待ちの変更"
              echo ""
              echo "${{ steps.status.outputs.in_canary_pr_links }}"
              echo ""
              echo "## キューイング中の変更"
              echo ""
              echo "${{ steps.status.outputs.queued_pr_links }}"
            } >> docs/generated/canary-status.md
          else
            {
              echo "| 次回の定期チェック予定 | ${{ steps.schedule.outputs.next_promote_run_at }} |"
              echo ""
              echo "canaryスタックは現在存在しない。マージ済みでキュー待ちであれば、次回のpromote-canary.yml実行で最新main HEADがcanaryへデプロイされる。"
            } >> docs/generated/canary-status.md
          fi

      # 以下、mainブランチが「変更は必ずPR経由」の場合の自動コミット手順
      # （issue #830でcomposite action化を検討中。利用可能になったら置き換える）
      - name: 変更があればコミットする
        id: commit
        if: always()
        run: |
          set -eu
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          if git diff --quiet -- docs/generated/canary-status.md; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          git add docs/generated/canary-status.md
          git commit -m "chore(canary): canary運用状態を更新する [skip ci]"
          echo "changed=true" >> "$GITHUB_OUTPUT"

      # 新規ブランチへのpushはmainのルール対象外。force pushにしているのは、
      # 過去の失敗試行で同名ブランチが残骸として残っていると、通常のpushが
      # non-fast-forwardで拒否され以後の実行が恒久的に失敗し続けるため
      - name: コミットを新しいブランチへpushする
        id: push-branch
        if: steps.commit.outputs.changed == 'true'
        run: |
          set -eu
          BRANCH="chore/canary-status-${{ github.run_id }}"
          git checkout -b "$BRANCH"
          git push --force origin "$BRANCH"
          echo "branch=${BRANCH}" >> "$GITHUB_OUTPUT"

      - name: PRを作成してsquash mergeする
        if: steps.commit.outputs.changed == 'true'
        uses: actions/github-script@v9
        with:
          script: |
            const branch = "${{ steps.push-branch.outputs.branch }}";
            const baseBranch = "${{ github.ref_name }}";

            let pr;
            try {
              ({ data: pr } = await github.rest.pulls.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                head: branch,
                base: baseBranch,
                title: "chore(canary): canary運用状態を更新する [skip ci]",
                body: "canary-status.ymlによる自動PRです。",
              }));
            } catch (error) {
              if (!error.message.includes("A pull request already exists")) {
                throw error;
              }
              const { data: existingPrs } = await github.rest.pulls.list({
                owner: context.repo.owner,
                repo: context.repo.repo,
                head: `${context.repo.owner}:${branch}`,
                state: "open",
              });
              if (existingPrs.length === 0) {
                throw error;
              }
              pr = existingPrs[0];
            }

            // pushで作成したブランチ直後はGitHub側のmergeable判定が追いついていない
            // ことがあるため、短い間隔でリトライする
            const maxAttempts = 5;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                await github.rest.pulls.merge({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  pull_number: pr.number,
                  merge_method: "squash",
                });
                break;
              } catch (error) {
                if (attempt === maxAttempts) throw error;
                await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
              }
            }

            try {
              await github.rest.git.deleteRef({
                owner: context.repo.owner,
                repo: context.repo.repo,
                ref: `heads/${branch}`,
              });
            } catch (error) {
              if (!(error.status === 422 || error.message.includes("Reference does not exist"))) {
                console.error(`Failed to delete branch ${branch}:`, error.message);
              }
            }
```

## ルーティング実機検証ワークフロー（verify-bg-routing.yml）

CloudFront Functionsの重み付けルーティング・sticky Cookie挙動を、実際にデプロイ済みのCloudFront URLへHTTPリクエストを送って自動検証する。サンドボックス環境のネットワーク制限等で直接検証できない場合でも、インターネットに到達可能なGitHub Actionsランナーから実行できる。

検証する内容は以下3点。

1. Cookie無しでアクセスした場合、設定した重みのおおよその割合でcanaryが選ばれる
2. 一度付与されたCookieの値通りに2回目以降のアクセスが固定される
3. KVSの`force_stable`をtrueにすると、Cookieに関わらず常にstableになる

このworkflowは検証専用で、デプロイやKVSの既定値を変更する副作用を残さない（`force_stable`検証後は必ずfalseへ戻す）。レスポンス本文から変種を判別する`CANARY`・`STABLE`の文字列は、frontendのビルド時にモードに応じて埋め込むマーカー文字列に置き換える（[`frontend-ui-conventions.md`](frontend-ui-conventions.md)「主要画面へのバージョン表示」等、既存のモード判定の仕組みと合わせる）。

```yaml
name: Verify Blue-Green Routing
run-name: Verify Blue-Green Routing (manual)

on:
  workflow_dispatch: {}

permissions:
  contents: read

jobs:
  verify:
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

      - name: Install infra dependencies
        working-directory: infra
        run: npm ci

      - name: Resolve CloudFront domain and KVS ARN
        id: resolve
        working-directory: infra
        run: |
          set -eu
          INFO=$(npx osls info --config serverless.yml --stage shared --verbose 2>/dev/null)
          DOMAIN=$(echo "$INFO" | grep "FrontendDistributionDomainName" | sed -E 's/^[^:]*: *//')
          KVS_ARN=$(echo "$INFO" | grep "RoutingKeyValueStoreArn" | sed -E 's/^[^:]*: *//')
          echo "domain=${DOMAIN}" >> "$GITHUB_OUTPUT"
          echo "kvs_arn=${KVS_ARN}" >> "$GITHUB_OUTPUT"
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: "1. 重み付け抽選（Cookie無し、設定した重みの割合でcanaryになることを確認）"
        id: weight
        run: |
          set -eu
          DOMAIN="${{ steps.resolve.outputs.domain }}"
          N=100
          CANARY_COUNT=0
          for i in $(seq 1 "$N"); do
            BODY=$(curl -sS "https://${DOMAIN}/" --max-time 15)
            if echo "$BODY" | grep -q "CANARY"; then
              CANARY_COUNT=$((CANARY_COUNT + 1))
            fi
          done
          echo "canary_count=${CANARY_COUNT}" >> "$GITHUB_OUTPUT"
          echo "total=${N}" >> "$GITHUB_OUTPUT"

      - name: "2. Cookie固定化（1回目の結果が2回目以降も維持されることを確認）"
        id: sticky
        run: |
          set -eu
          DOMAIN="${{ steps.resolve.outputs.domain }}"
          JAR=$(mktemp)

          FIRST_BODY=$(curl -sS "https://${DOMAIN}/" --max-time 15 -c "$JAR")
          FIRST_VARIANT=$(echo "$FIRST_BODY" | grep -o "CANARY\|STABLE" | head -1)

          MISMATCH=0
          for i in 1 2 3; do
            BODY=$(curl -sS "https://${DOMAIN}/" --max-time 15 -b "$JAR" -c "$JAR")
            VARIANT=$(echo "$BODY" | grep -o "CANARY\|STABLE" | head -1)
            if [ "$VARIANT" != "$FIRST_VARIANT" ]; then
              MISMATCH=1
            fi
          done
          echo "mismatch=${MISMATCH}" >> "$GITHUB_OUTPUT"
          echo "first_variant=${FIRST_VARIANT}" >> "$GITHUB_OUTPUT"

      - name: "3. force_stable強制切り替えの準備（KVSをtrueに設定）"
        working-directory: infra
        run: |
          set -eu
          KVS_ARN="${{ steps.resolve.outputs.kvs_arn }}"
          ETAG=$(aws cloudfront-keyvaluestore describe-key-value-store --region us-east-1 --kvs-arn "$KVS_ARN" --query ETag --output text)
          aws cloudfront-keyvaluestore put-key --region us-east-1 --kvs-arn "$KVS_ARN" --if-match "$ETAG" --key "force_stable" --value "true" >/dev/null
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: "4. force_stable=true時、Cookieに関わらず常にstableになることを確認"
        id: force_stable_check
        run: |
          set -eu
          DOMAIN="${{ steps.resolve.outputs.domain }}"
          # KVSの更新はCloudFrontのエッジ拠点への伝播が非同期（AWSの文書では
          # 通常数秒、最大で数分かかる場合があるとされる）。書き込み直後に
          # 確認すると伝播が追いついておらず誤って「反映されていない」と
          # 判定する可能性があるため、確認できるまで一定間隔でリトライする
          # （最大120秒）
          MAX_WAIT_ATTEMPTS=12
          WAIT_SECONDS=10
          PROPAGATED=0
          for attempt in $(seq 1 "$MAX_WAIT_ATTEMPTS"); do
            BODY=$(curl -sS "https://${DOMAIN}/" --max-time 15 -b "canary=canary")
            VARIANT=$(echo "$BODY" | grep -o "CANARY\|STABLE" | head -1)
            if [ "$VARIANT" = "STABLE" ]; then
              PROPAGATED=1
              break
            fi
            sleep "$WAIT_SECONDS"
          done
          echo "propagated=${PROPAGATED}" >> "$GITHUB_OUTPUT"

          N=10
          NON_STABLE_COUNT=0
          for i in $(seq 1 "$N"); do
            # canary Cookieを明示的に持たせた状態でもforce_stableが優先され
            # stableになることを確認する（curlの-bは'='を含む文字列を
            # ファイル名ではなく生のCookieとして解釈する）
            BODY=$(curl -sS "https://${DOMAIN}/" --max-time 15 -b "canary=canary")
            VARIANT=$(echo "$BODY" | grep -o "CANARY\|STABLE" | head -1)
            if [ "$VARIANT" != "STABLE" ]; then
              NON_STABLE_COUNT=$((NON_STABLE_COUNT + 1))
            fi
          done
          echo "non_stable_count=${NON_STABLE_COUNT}" >> "$GITHUB_OUTPUT"

      - name: "5. force_stableを既定値(false)へ戻す"
        if: always()
        working-directory: infra
        run: |
          set -eu
          KVS_ARN="${{ steps.resolve.outputs.kvs_arn }}"
          ETAG=$(aws cloudfront-keyvaluestore describe-key-value-store --region us-east-1 --kvs-arn "$KVS_ARN" --query ETag --output text)
          aws cloudfront-keyvaluestore put-key --region us-east-1 --kvs-arn "$KVS_ARN" --if-match "$ETAG" --key "force_stable" --value "false" >/dev/null
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: Write summary
        if: always()
        run: |
          set -eu
          {
            echo "## 自動検証結果"
            echo ""
            echo "### 1. 重み付け抽選（Cookie無し）"
            echo "${{ steps.weight.outputs.total }}回中${{ steps.weight.outputs.canary_count }}回がcanary"
            echo ""
            echo "### 2. Cookie固定化"
            echo "1回目の結果: ${{ steps.sticky.outputs.first_variant }} / 以降不一致: ${{ steps.sticky.outputs.mismatch == '1' && 'あり（NG）' || 'なし（OK）' }}"
            echo ""
            echo "### 3. force_stable強制切り替え"
            echo "KVS更新の反映: ${{ steps.force_stable_check.outputs.propagated == '1' && '確認できた' || '120秒待っても確認できなかった（要調査）' }}"
            echo "10回中stable以外になった回数: ${{ steps.force_stable_check.outputs.non_stable_count }}（0が正常）"
          } >> "$GITHUB_STEP_SUMMARY"
```

## 手動per-stageデプロイワークフロー（deploy-backend-stage.yml / deploy-frontend-stage.yml）

通常の変更はCDパイプライン（mainマージ→`canary_queue_pending`キューイング→`promote-canary.yml`での定期反映）経由で届く。緊急修正やstable/canaryいずれかだけの単純な再デプロイが必要な場合向けに、手動実行できるper-stageデプロイworkflowを用意する。

backend側はcanaryへの直接デプロイがキューイング設計を素通りしてしまう事故が実際に起きた。canaryの`LastUpdatedTime`が書き換わり、昇格猶予期間の起点が意図せず前進してしまう事故である。このため`stage=canary`への直接デプロイは既定で禁止し、占有中（スタックが存在し`force_stable`でない）であればデプロイを停止するガードを入れる。`force`入力をtrueにすれば緊急時のみ素通りできる。

```yaml
name: Deploy Backend Stage
run-name: Deploy Backend Stage (manual, ${{ inputs.stage }})

on:
  workflow_dispatch:
    inputs:
      stage:
        description: "デプロイ先のstage"
        required: true
        type: choice
        options:
          - stable
          - canary
      force:
        description: "canaryが占有中（promote-canary.ymlの猶予期間カウント中）でも強制デプロイする"
        required: false
        type: boolean
        default: false

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      AWS_DEFAULT_REGION: ap-northeast-1
    steps:
      - name: Checkout
        uses: actions/checkout@v7
        with:
          submodules: true

      # 占有中のcanaryへ直接デプロイするとLastUpdatedTimeが書き換わり、
      # 昇格猶予期間が意図せず延長される（前述）。force入力が無い限り停止する
      - name: canaryの占有状態を確認する（stage=canaryのみ）
        if: inputs.stage == 'canary' && inputs.force != true
        working-directory: infra
        run: |
          set -eu
          npm ci
          if ! aws cloudformation describe-stacks --stack-name <service>-canary >/dev/null 2>&1; then
            echo "canaryスタックは存在しない（空き状態）ため、デプロイを続行する"
            exit 0
          fi
          INFO=$(npx osls info --config serverless.yml --stage shared --verbose 2>/dev/null)
          KVS_ARN=$(echo "$INFO" | grep "RoutingKeyValueStoreArn" | sed -E 's/^[^:]*: *//')
          FORCE_STABLE=$(aws cloudfront-keyvaluestore get-key --region us-east-1 --kvs-arn "$KVS_ARN" --key "force_stable" --query Value --output text 2>/dev/null || echo "false")
          if [ "$FORCE_STABLE" = "true" ]; then
            echo "force_stable=trueのため、canaryは空き状態とみなしデプロイを続行する"
            exit 0
          fi
          echo "::error::canaryは現在占有中（promote-canary.ymlの猶予期間カウント中）です。このworkflowで直接デプロイすると、canaryのLastUpdatedTimeが書き換わり昇格スケジュールが意図せず延長されます。通常の変更はcd.ymlのマージ経路（canary_queue_pending=true）でキューイングされ、canaryが空いた時点で反映されます。緊急時のみforce入力をtrueにして再実行してください。"
          exit 1

      - name: 🚀 Deploy Backend (osls, Serverless Framework v3 OSS fork)
        uses: bamiyanapp/dev-standards/.github/actions/deploy-serverless@main
        with:
          working-directory: <backend-dir>
          node-version: 22
          deploy-command: npx osls deploy --stage ${{ inputs.stage }}
          workspaces: true
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: Show endpoints
        working-directory: <backend-dir>
        run: |
          set -eu
          INFO=$(npx osls info --stage ${{ inputs.stage }} --verbose 2>/dev/null)
          echo "$INFO"
          {
            echo "## backend デプロイ結果（stage: ${{ inputs.stage }}）"
            echo ""
            echo '```'
            echo "$INFO"
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"
```

frontend側はS3プレフィックス同期のみの単純な操作で、canaryスタック自体を作成・削除しないためLastUpdatedTimeへの影響が無く、occupancyガードは不要。

```yaml
name: Deploy Frontend Stage
run-name: Deploy Frontend Stage (manual, ${{ inputs.stage }})

on:
  workflow_dispatch:
    inputs:
      stage:
        description: "デプロイ先のstage"
        required: true
        type: choice
        options:
          - stable
          - canary

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      AWS_DEFAULT_REGION: ap-northeast-1
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

      - name: Build frontend
        working-directory: <frontend-workspace>
        run: npm run build:${{ inputs.stage }}

      - name: Deploy to S3 and invalidate CloudFront cache
        run: |
          set -eu
          OUTPUTS=$(aws cloudformation describe-stacks --stack-name <infra-shared-stack> --query "Stacks[0].Outputs" --output json)
          BUCKET=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="FrontendBucketName") | .OutputValue')
          DIST_ID=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="FrontendDistributionId") | .OutputValue')
          aws s3 sync <frontend-workspace>/dist "s3://${BUCKET}/${{ inputs.stage }}/" --delete
          # DefaultCacheBehaviorがCachingOptimized（オリジン側Cache-Controlに従う）
          # のため、同期しただけでは最大24時間古いキャッシュが返り続ける。対象の
          # プレフィックス配下のみを明示的に無効化する
          aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/${{ inputs.stage }}/*"
          {
            echo "## frontend デプロイ結果（stage: ${{ inputs.stage }}）"
            echo ""
            echo "S3バケット: ${BUCKET}"
            echo "同期先プレフィックス: ${{ inputs.stage }}/"
          } >> "$GITHUB_STEP_SUMMARY"
```

## 参考実装

具体的な実装の経緯・issue番号は[bamiyanapp/karuta](https://github.com/bamiyanapp/karuta)の各workflowファイルを参照する。対象は`.github/workflows/promote-canary.yml`・`canary-status.yml`・`verify-bg-routing.yml`・`deploy-backend-stage.yml`・`deploy-frontend-stage.yml`である。
