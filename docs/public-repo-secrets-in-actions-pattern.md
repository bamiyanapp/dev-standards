# 公開リポジトリのGitHub Actionsで秘密情報を露出させないパターン

**前提**: `docs/public-repo-no-pii-pattern.md`と同じく、bamiyanapp配下のリポジトリは基本的に公開（Public）である。GitHub Actionsの実行履歴（ログ・Job Summary含む）は、公開リポジトリでは**未ログインの第三者でも閲覧できる**。同文書が「個人情報」を対象にしているのに対し、本書は「秘密情報・認証情報（トークン・パスワード・APIキー等）」を対象にする。

対象読者は、`docs/sandboxed-agent-production-data-pattern.md`のような`workflow_dispatch`＋Job Summaryパターンを使う全プロダクト。

## 原則: Job Summary・ログは公開リポジトリでは公開ページである

`docs/sandboxed-agent-production-data-pattern.md`は、スマホオンリー環境（ローカルCLI操作ができない）向けに「`workflow_dispatch`はGitHubのWeb/モバイルアプリから実行でき、結果はJob Summaryでその場から確認できる」という設計を積極的に推奨している。この設計自体は有効だが、**Job Summaryへ出力してよいのは非機密情報（調査結果・処理件数・成否等）に限る**。秘密情報を一度でもJob Summaryへ平文出力すると、その実行履歴が残っている限り誰でも閲覧できてしまう。

## アンチパターン: 人間にコピー&ペーストさせるためJob Summaryへ平文表示する

`workflow_dispatch`ワークフローが秘密情報（APIトークン等）を取得し、人間が値を読んでGitHub Secretsへ手動登録する運用は避ける。「人間が読める形で見せる」ことと「公開されている」ことは、公開リポジトリでは同じ意味になる。

GitHub Actionsは`::add-mask::`した値をログだけでなくJob Summaryでも一律「***」に伏せる仕様を持つが、これは**秘密情報を意図的に隠したい場合の機能**であり、「人間に見せたいから`::add-mask::`しない」という判断は、その値を全世界へ公開する判断と同義になる。

## 実際に発生したインシデント

bamiyanapp/examination#514。E2Eテスト専用Cognitoユーザーの`refresh_token`を、`AdminInitiateAuth`で取得した後にJob Summaryへ意図的に平文表示し、人間が`E2E_SECRETS_JSON` Secretへ手動でコピー登録する設計になっていた。examinationは公開リポジトリのため、この実行履歴のJob Summaryが誰でも閲覧可能な状態で残り続け、`refresh_token`が実質的に公開されていた。

## 安全なパターン: ワークフロー自身がSecretsへ直接書き込む

人間の手動コピー&ペーストを介さず、ワークフロー自身が[GitHub CLIの`gh secret set`](https://cli.github.com/manual/gh_secret_set)等でSecretsへ直接書き込む設計にする。

```yaml
- name: Update secret
  env:
    GH_TOKEN: ${{ secrets.BOT_TOKEN }} # GITHUB_TOKEN既定値はSecretsを書き込めない
  run: |
    echo -n "$NEW_SECRET_VALUE" | gh secret set MY_SECRET --repo "${{ github.repository }}"
```

- `gh secret set`の呼び出しには、対象リポジトリのSecretsへ書き込める権限を持つトークンが必要。デフォルトの`GITHUB_TOKEN`にはこの権限が無いため、`repo`スコープを持つclassic PAT、またはSecrets書き込み権限を持つfine-grained PAT（`BOT_TOKEN`等）を使う
- 取得した値自体は、他の秘密情報と同様に`::add-mask::`し、Job Summary・ログのいずれにも出力しない
- Job Summaryには「Secretの更新に成功したかどうか」等の非機密な結果のみを出力する

## 既に平文表示してしまった秘密情報への対応

過去の実行でJob Summary・ログへ平文出力してしまった秘密情報は、**リポジトリのコミット履歴と同様に「後から消せない」前提で扱う**（`docs/public-repo-no-pii-pattern.md`「原則: 一度コミットした個人情報は『消せない』前提で運用する」と同じ考え方）。ワークフローの修正だけでは不十分で、以下をあわせて行う。

- 露出した認証情報自体を失効・再発行する（例: Cognitoの`AdminUserGlobalSignOut`でrefresh_tokenを無効化してから再発行する、APIキーをローテーションする等）
- 可能であれば、過去に平文表示された実行履歴自体の削除も検討する

## `workflow_dispatch`＋Job Summaryパターン自体は禁止ではない

`docs/sandboxed-agent-production-data-pattern.md`が提供する「調査・修正ロジックをコード化しGitHub Actions側に委ねる」設計自体は引き続き有効であり、非機密情報（DynamoDBの調査結果、処理件数、成否等）をJob Summaryへ出力すること自体に問題はない。**出力する値が秘密情報かどうかを都度判断し、秘密情報であれば本書の安全なパターンへ切り替える**、という使い分けが要点である。

## チェックリスト

`workflow_dispatch`ワークフローを新規作成・変更する際に確認する。

- [ ] Job Summary・通常のログ出力に、認証情報・トークン・パスワード・APIキー等の秘密情報が含まれていないか
- [ ] 秘密情報をGitHub Secretsへ反映する必要がある場合、人間の手動コピー&ペーストではなく、ワークフロー自身が`gh secret set`等でSecretsへ直接書き込む設計になっているか
- [ ] 秘密情報を扱うステップで`::add-mask::`を意図的に外していないか（外す場合は、その値がJob Summary等どこにも表示されないことを別途保証できているか）

## 実例

bamiyanapp/examination#514・PR #515。`.github/workflows/setup-e2e-test-fixtures.yml`の修正で、`refresh_token`の平文表示を廃止し`gh secret set`による直接書き込みへ変更した。

## 関連ドキュメント

- `docs/public-repo-no-pii-pattern.md`: 同じ「公開リポジトリ前提」の個人情報版
- `docs/sandboxed-agent-production-data-pattern.md`: 本書が注意点を補足する対象の`workflow_dispatch`＋Job Summaryパターン
