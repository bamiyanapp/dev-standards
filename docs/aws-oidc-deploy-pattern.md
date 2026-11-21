# AWSへのデプロイをOIDCにして、長期アクセスキーをなくす

## 目的

GitHub ActionsからAWSへデプロイするとき、IAMユーザーの長期アクセスキーを使わない。代わりに、OIDCで一時クレデンシャルを取得する。
長期キーは、漏えいすると、失効させるまで悪用できる。ローテーションも人手になる。一時クレデンシャルなら、この両方が要らない。
`deploy-serverless`複合アクションは、`role-to-assume`を指定すると、OIDCで認証する（[#1363](https://github.com/bamiyanapp/dev-standards/issues/1363)）。

## 呼び出し側の書き方

```yaml
deploy-backend:
  runs-on: ubuntu-latest
  permissions:
    contents: read
    id-token: write
  steps:
    - uses: actions/checkout@v7
      with:
        submodules: true
    - uses: bamiyanapp/dev-standards/.github/actions/deploy-serverless@<タグ>
      with:
        working-directory: backend
        role-to-assume: arn:aws:iam::<アカウントID>:role/<アプリ名>-github-deploy
        aws-region: ap-northeast-1
```

- `role-to-assume`と`aws-region`はセットで指定する。`aws-region`が無いと、複合アクションは失敗する
- `role-to-assume`と、アクセスキーの両方を指定すると、OIDCを優先して警告する。アクセスキーの指定は削除する
- どちらの認証情報も無いと、最初のstepで失敗する
- `role-to-assume`を指定しなければ、従来どおりアクセスキーで動く。この場合、`id-token`権限は要らない

### `permissions`の注意

`id-token: write`は、複合アクションからは宣言できない。呼び出し側のjobに書く。
**jobに`permissions`を書くと、書かなかった権限は、すべて無しになる。** `contents: read`も、あわせて書く。書かないと、`actions/checkout`が失敗する。
jobの権限を足す変更は、呼び出し側のworkflowを書き換えるPRになる。権限の不足は、`startup_failure`として現れることがある（[#1334](https://github.com/bamiyanapp/dev-standards/issues/1334)）。展開は、1つのjobから始めて、実行結果を確かめる。

## 再利用workflowでの書き方

`deploy-serverless`以外に、AWSを使う再利用workflowがある。対応状況は、次のとおり（[#1582](https://github.com/bamiyanapp/dev-standards/issues/1582)）。

| workflow | OIDC（`role_to_assume`） |
|---|---|
| `reusable-backup-dynamodb.yml` | 対応済み。呼び出し側のjobに`id-token: write`を書く |
| `reusable-canary-status.yml`・`reusable-promote-canary.yml`・`reusable-rollback-to-stable.yml` | 未対応。先頭の`permissions:`で権限を絞っており、`id-token: write`を足すと、許可していない既存の呼び出しが起動失敗になる（破壊的変更） |

## IAM側の定義（CloudFormation）

OIDCプロバイダと、デプロイ用のロールを作る。人手のコンソール操作は要らない。Serverless Frameworkの`resources:`にも、同じ内容を書ける。

```yaml
Resources:
  GitHubOidcProvider:
    Type: AWS::IAM::OIDCProvider
    Properties:
      Url: https://token.actions.githubusercontent.com
      ClientIdList:
        - sts.amazonaws.com

  DeployRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: <アプリ名>-github-deploy
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Federated: !Ref GitHubOidcProvider
            Action: sts:AssumeRoleWithWebIdentity
            Condition:
              StringEquals:
                token.actions.githubusercontent.com:aud: sts.amazonaws.com
              StringLike:
                token.actions.githubusercontent.com:sub: repo:<オーナー>/<リポジトリ>:ref:refs/heads/main
      ManagedPolicyArns:
        - !Ref DeployPolicy

  DeployPolicy:
    Type: AWS::IAM::ManagedPolicy
    Properties:
      PolicyDocument:
        Version: "2012-10-17"
        Statement: []   # 現行のIAMユーザーと同等以下の権限を、ここへ書く
```

### 信頼ポリシーの`sub`

`sub`は、**呼び出し元のリポジトリ**の値で決まる。dev-standardsの値ではない。
ブランチを限定しないと、任意のPRブランチから、ロールを引き受けられる。`ref:refs/heads/main`のように限定する。
`environment`を使うjobなら、`repo:<オーナー>/<リポジトリ>:environment:<環境名>`にする。

### 権限

ロールの権限は、現行のIAMユーザーと同等以下にする。広げない。
まず、現行のIAMユーザーに付いているポリシーを、そのまま移す。動作を確かめた後で、使われていない権限を絞る。

## 落とし穴

- **OIDCプロバイダは、1つのAWSアカウントに1つしか作れない。** 同じアカウントを使う複数のプロダクトが、それぞれ作ろうとすると、2つ目以降は失敗する。プロバイダは専用のスタックに分ける。または、既にあれば作らないようにする
- **ジョブ冒頭の認証stepも置き換える。** `deploy-serverless`以外で`aws`コマンドを直接使うjob（S3の同期等）がある。その認証は、`aws-actions/configure-aws-credentials`の`role-to-assume`へ置き換える。複合アクションだけ直しても、長期キーは消せない

## 移行の手順

「鶏と卵」の問題がある。ロールを作るスタックを、デプロイするには、認証が要る。そのため、3段階に分ける。**①と②は、同じPRにしない。**

1. 既存の長期キーで、OIDCプロバイダとロールを、デプロイする
2. workflowを、OIDCに切り替える（`role-to-assume`を指定する）
3. OIDCでのデプロイが成功したことを確かめてから、長期キーを削除する

各参照側の移行は、それぞれのリポジトリで進める。dev-standardsは、アクションの対応と、この文書までを受け持つ。
