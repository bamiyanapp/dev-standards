# セキュリティ検査の「既定で有効」方針

セキュリティ検査は、既定で有効にする。外す場合は、理由を明示する。
`reusable-ci.yml`の既定値は変えない。変えると破壊的変更になるためである。
代わりに、`standards-check`が未有効の検査を警告する。

## 対象の検査

| 入力 | 検査 | 対象条件 |
| --- | --- | --- |
| `enable_secret_scan` | シークレット検知 | 常に |
| `enable_email_scan` | メールアドレス検知 | `enable_secret_scan`が有効なとき |
| `enable_workflow_security_check` | workflowの脆弱性検査（zizmor） | 常に |
| `enable_eslint_rules_check` | ESLintルールの検査 | 常に |
| `enable_security_headers_check` | セキュリティヘッダー | `serverless*.yml`があるとき |
| `enable_iam_actions_check` | IAM権限 | `serverless*.yml`があるとき |
| `enable_dynamodb_protection_check` | DynamoDB保護設定 | `serverless*.yml`があるとき |

## 警告の挙動

`scripts/check-security-checks.js`が、`.github/workflows/*.yml`を読む。
コメントを除き、`enable_xxx: true`の有無で判定する。
警告のみで、終了コードは常に0である。

## 有効にしない場合

`.github/security-checks-opt-out.json`に、検査名と理由を書く。

```json
{ "enable_iam_actions_check": "IAMを定義するリソースが無い" }
```

理由が空の場合は、無効として警告する。

## 新規プロジェクト

新規プロジェクトの`ci.yml`は、上の検査を最初から`true`にして始める。
導入手順は、[`cicd-pipeline-specification.md`](cicd-pipeline-specification.md)を参照する。
今後追加するセキュリティ検査も、`CHECKS`へ登録して同じ仕組みに載せる。
