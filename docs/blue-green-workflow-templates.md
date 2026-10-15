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
| `<write-endpoint-name>`・`<read-endpoint-name>`・`<field>`・`<shared-table-name>` | データ共有検証ワークフロー用。検証に使う書き込み/読み取りAPIのエンドポイント名・リクエストのフィールド名・対象DynamoDBテーブル名 | `post-comment`・`get-comments`・`comment`・`karuta-comments` |

## 共有インフラ初期デプロイワークフロー（deploy-infra.yml）

導入時に最初に1回だけ実行する、S3+CloudFront共有スタック（固定の1つのスタックとして常時存在するもの、[`blue-green-stage-pattern.md`](blue-green-stage-pattern.md)「S3 + CloudFrontの最小インフラ」参照）の手動デプロイworkflow。CloudFrontディストリビューションの作成・更新は伝播に15〜20分程度かかるため、頻繁に走る通常のCDとは別の、専用の手動ワークフローとする。

KVSの初期値（`canary_weight`・`force_stable`等）は「未設定のキーのみ」seedする。既存の値は上書きしない。これにより、運用中（例えば管理者ロールバックで`force_stable`をtrueにしている状態）に本ワークフローを再実行（CloudFrontディストリビューション設定の変更等）しても、その値を誤って既定値へ戻してしまうことを防ぐ。

コピー＆調整用テンプレート: [`examples/blue-green-deploy-infra.yml`](examples/blue-green-deploy-infra.yml)

## 自動昇格ワークフロー（promote-canary.yml）

canaryデプロイから猶予期間（`GRACE_PERIOD_DAYS`）が経過し、`force_stable`によるロールバックが行われていなければ、canaryの内容をstableへ自動的に昇格し、canaryスタックを削除する。同時に、canaryへの日次バッチ反映（[`blue-green-stage-pattern.md`](blue-green-stage-pattern.md)「canaryデプロイの日次バッチ化」参照）・緊急デプロイ後の自動最新化（「自動昇格・管理者ロールバック・詰まりの自動解消」参照）も、同じ定期実行の中で判定する。

**推奨: 以下のスタンドアロン版テンプレートより、`bamiyanapp/dev-standards/.github/workflows/reusable-promote-canary.yml`（`workflow_call`で呼び出すreusable workflow）を優先する。**

判定・昇格・キュー処理ロジックは後からこのreusable workflowへ一般化された（dev-standards#757）。「canaryが実際に検証したコミットのみを昇格する」仕組み（git worktree + `canary_tag_name`、dev-standards#919）は、このreusable workflow側にのみ存在する。そのworktree使用に伴うサブモジュール初期化・`timeout-minutes`設定（dev-standards#927、「自動昇格・管理者ロールバック・詰まりの自動解消」参照）も同様である。以下のスタンドアロン版はこれらの修正を含まない古いテンプレートであり、新規導入では使わないこと。

コピー＆調整用テンプレート: [`examples/blue-green-promote-canary-standalone.yml`](examples/blue-green-promote-canary-standalone.yml)

## 運用状態の可視化ワークフロー（canary-status.yml）

KVS・CloudFormationスタックの状態（重み・ロールバック状態・キュー待ち・最終更新時刻・昇格予定日時・各stageの配信中バージョン）は、AWS CLIで見るしかなくPR・CIのログからは掴めない。スマートフォンのGitHub Actions画面から手動実行するだけで現在の状態をJob Summaryへ出力し、1時間おきの定期実行で`docs/generated/canary-status.md`へコミットすることで、GitHubのファイルビュー・コミット履歴だけで最新状態を確認できるようにする。デプロイは一切行わない状態確認専用のworkflow。

mainブランチがリポジトリルール（Rulesets）で「変更は必ずPR経由」になっている場合、直接push（`git push origin HEAD:main`）は拒否される。[`reusable-ci.yml`](reusable-workflows-reference.md)の`render-mermaid-diagrams`ジョブと同じ「新ブランチへpush→PR作成→API経由でsquash merge」方式を使う。この自動コミット部分は、本来は共通のcomposite actionへ切り出すべき重複（issue #830で検討中）である。#830が利用可能になったら、以下のテンプレートの該当ステップをcomposite action呼び出しへ置き換える。

コピー＆調整用テンプレート: [`examples/blue-green-canary-status.yml`](examples/blue-green-canary-status.yml)

## 管理者ロールバックワークフロー（rollback-to-stable.yml）

管理者が問題を検知した際、再デプロイ無しで即座に全トラフィックをstableへ戻す。CloudFront FunctionsのKVS（`force_stable`）をtrueに設定するだけの軽量なworkflow。

誤って元に戻してしまう事故を避けるため、`force_stable`をfalse（通常運用）へ戻す機能は本workflowに持たせない。復帰は自動昇格ワークフロー経由、または必要に応じて別途手動でAWS CLIを実行する運用とする。

コピー＆調整用テンプレート: [`examples/blue-green-rollback-to-stable.yml`](examples/blue-green-rollback-to-stable.yml)

## canary_weight手動変更ワークフロー（set-canary-weight.yml）

検証目的で重みを一時的に変えたい場合に備え、`workflow_dispatch`で任意の%（0〜100）を指定してKVSの`canary_weight`を変更する。AWS CLIを手動実行せずスマートフォンからでも調整できる。

コピー＆調整用テンプレート: [`examples/blue-green-set-canary-weight.yml`](examples/blue-green-set-canary-weight.yml)

## ルーティング実機検証ワークフロー（verify-bg-routing.yml）

CloudFront Functionsの重み付けルーティング・sticky Cookie挙動を、実際にデプロイ済みのCloudFront URLへHTTPリクエストを送って自動検証する。サンドボックス環境のネットワーク制限等で直接検証できない場合でも、インターネットに到達可能なGitHub Actionsランナーから実行できる。

検証する内容は以下4点。

1. Cookie無しでアクセスした場合、設定した重みのおおよその割合でcanaryが選ばれる
2. 一度付与されたCookieの値通りに2回目以降のアクセスが固定される
3. KVSの`force_stable`をtrueにすると、Cookieに関わらず常にstableになる
4. `/stable/`への明示アクセスは常にstableの内容を返し、かつ以後のCookie無しアクセスもstableへ一時固定される（手動切り替えリンクパターンとの前方互換、[`blue-green-stage-pattern.md`](blue-green-stage-pattern.md)「CloudFront Functionsによる重み付けルーティング」のviewer-request関数仕様に対応）

このworkflowは検証専用で、デプロイやKVSの既定値を変更する副作用を残さない（`force_stable`検証後は必ずfalseへ戻す）。レスポンス本文から変種を判別する`CANARY`・`STABLE`の文字列は、frontendのビルド時にモードに応じて埋め込むマーカー文字列に置き換える（[`frontend-ui-conventions.md`](frontend-ui-conventions.md)「主要画面へのバージョン表示」等、既存のモード判定の仕組みと合わせる）。

コピー＆調整用テンプレート: [`examples/blue-green-verify-bg-routing.yml`](examples/blue-green-verify-bg-routing.yml)

## データ共有検証ワークフロー（verify-stage-data-sharing.yml）

stable/canaryが同一のデータストアを共有していることは、[`blue-green-stage-pattern.md`](blue-green-stage-pattern.md)「DynamoDBスキーマ互換性ガイドライン（expand/contract方式）」の前提となる中核要件である。本workflowは、一方のステージへ書き込んだデータが、もう一方のステージから読み取れることを実際のAPI呼び出しで検証する。

前提として、`deploy-backend-stage.yml`でstable・canary両方を先にデプロイしておくこと。検証対象が実際の本番データストアのため、検証用レコードには分かりやすいマーカーを付け、確認後に対象ストアから直接削除する（通常のAPIにはdelete相当のエンドポイントが無いことが多いため、AWS CLI/SDKで直接削除する）。

コピー＆調整用テンプレート: [`examples/blue-green-verify-stage-data-sharing.yml`](examples/blue-green-verify-stage-data-sharing.yml)

## 手動per-stageデプロイワークフロー（deploy-backend-stage.yml / deploy-frontend-stage.yml）

通常の変更はCDパイプライン（mainマージ→`canary_queue_pending`キューイング→`promote-canary.yml`での定期反映）経由で届く。緊急修正やstable/canaryいずれかだけの単純な再デプロイが必要な場合向けに、手動実行できるper-stageデプロイworkflowを用意する。

backend側はcanaryへの直接デプロイがキューイング設計を素通りしてしまう事故が実際に起きた。canaryの`LastUpdatedTime`が書き換わり、昇格猶予期間の起点が意図せず前進してしまう事故である。このため`stage=canary`への直接デプロイは既定で禁止し、占有中（スタックが存在し`force_stable`でない）であればデプロイを停止するガードを入れる。`force`入力をtrueにすれば緊急時のみ素通りできる。

コピー＆調整用テンプレート: [`examples/blue-green-deploy-backend-stage.yml`](examples/blue-green-deploy-backend-stage.yml)

frontend側はS3プレフィックス同期のみの単純な操作で、canaryスタック自体を作成・削除しないためLastUpdatedTimeへの影響が無く、occupancyガードは不要。

コピー＆調整用テンプレート: [`examples/blue-green-deploy-frontend-stage.yml`](examples/blue-green-deploy-frontend-stage.yml)

## 参考実装

具体的な実装の経緯・issue番号は[bamiyanapp/karuta](https://github.com/bamiyanapp/karuta)の各workflowファイルを参照する。対象は以下である。

- `.github/workflows/deploy-infra.yml`
- `promote-canary.yml`
- `canary-status.yml`
- `rollback-to-stable.yml`
- `set-canary-weight.yml`
- `verify-bg-routing.yml`（`verify-stable-fallback.yml`の検証項目を統合済み）
- `verify-stage-data-sharing.yml`
- `deploy-backend-stage.yml`
- `deploy-frontend-stage.yml`
