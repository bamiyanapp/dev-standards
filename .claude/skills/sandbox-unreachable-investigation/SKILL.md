---
name: sandbox-unreachable-investigation
description: Claude実行環境（サンドボックス）のエグレスプロキシ制約で対象（本番ドメイン等）へ直接アクセスできず、かつユーザーの開発環境がスマートフォンオンリーのため`view-source:`等のPC向け確認手段も使えない場合に、GitHub Actionsの一時workflowで情報を取得するSkill。
user_invocable: true
---

# サンドボックス到達不能時の調査

## 目的

CLAUDE.mdの「開発環境の制約（スマホオンリー）」原則は、ユーザーへ依頼する確認手順の制約を定めている。本Skillは、それに加えて**Claude自身の実行環境（サンドボックス）からも対象へ到達できない**場合の対処手順を定める。

典型的な状況: 本番ドメイン（CloudFront等）へのアクセスがサンドボックスのエグレスプロキシで組織ポリシーにより拒否される（`curl`で`403`、WebFetchで`ENOTFOUND`等）。この状態で安易にユーザーへ手動確認を依頼すると、スマホオンリーの制約（`view-source:`が使えない等）とぶつかり、「依頼→失敗→別の依頼」のラリーが発生し時間を浪費する（bamiyanapp/dev-standards#822で実際に発生した）。

## 判断フロー

1. 対象への到達性を確認する。`curl`が組織プロキシの403・`WebFetch`のDNS解決失敗等で拒否される場合がある。この場合、まず`curl -sS "$HTTPS_PROXY/__agentproxy/status"`でサンドボックスのプロキシ状態（`recentRelayFailures`）を確認する。これにより、ユーザーの端末の問題ではなくサンドボックス固有の制約であることを明確にできる
2. 到達不能と判明したら、**ユーザーへの手動確認依頼より先に、GitHub Actionsの一時workflowでの自己解決を検討する**。対象リポジトリのCI/CDがAWS等の対象環境への認証情報を持っている場合、GitHub Actionsのランナーはサンドボックスのエグレス制限を受けないため、そこから`curl`・AWS CLI等で情報を取得できる
3. ユーザーに複雑な手動確認手順（`view-source:`の使用、特定ブラウザへの切り替え、キャッシュ削除の手順案内等）を依頼するのは、上記の自己解決が明らかに不可能な場合（対象環境への認証情報がどこにも存在しない等）に限る

## 一時workflowの作り方

1. 新規ブランチへ、`workflow_dispatch: {}`のみをトリガーとする一時workflowファイル（例: `.github/workflows/diagnose-<topic>.yml`）を追加する
2. 必要な調査コマンド（`curl`でのレスポンス確認、AWS CLIでの実リソース確認等）を実行し、結果を`$GITHUB_STEP_SUMMARY`へ出力する
3. **`$GITHUB_STEP_SUMMARY`の内容はGitHub REST APIから取得する手段が無い**（`get_job_logs`等のツールでは見えない）。このため、出力は`>>`ではなく`| tee -a "$GITHUB_STEP_SUMMARY"`を使い、ジョブログ（`get_job_logs`で取得可能）にも同じ内容を出すこと。これを最初から行っておけば、ユーザーにJob Summary画面を開いて内容を転記してもらう手間が不要になる
4. `workflow_dispatch`は**デフォルトブランチにマージされていないworkflowファイルに対しては実行できない**（GitHub仕様）。このため、一時workflowを使った調査は必ず「ブランチへpush→PR作成→ユーザーにマージを依頼→`workflow_dispatch`で実行」という最低1往復のPRマージが必要になる。ユーザーへの往復を最小化するため、以下を徹底する
   - 最初のPRで必要な調査項目を一度に揃える（後から「もう1点確認したい」と追加PRを出す往復を避ける）
   - ログ出力は最初から`tee`方式にする（本Skill作成の経緯となった実際の作業では、これを後から直すPRを追加で出す往復が発生した）
   - 調査の結果、修正が必要と判明した場合は、同じ一時workflowに修正ステップ（例: KVSの値を正しい状態へ書き込む等）を追加し、調査と修正を同じPRマージで完結させることを検討する
5. 調査・修正が完了したら、一時workflowファイルは削除するPRを別途出す（本線のworkflow群に調査専用の使い捨てファイルを残さない）

## 関連ドキュメント

- CLAUDE.md「開発環境の制約（スマホオンリー）」: 本Skillが前提とする、ユーザー側の制約
- [`safe-bash-commands`](../safe-bash-commands/SKILL.md): Bash実行時のハング回避。本Skillとは別の関心事（到達性そのものの制約）を扱う
