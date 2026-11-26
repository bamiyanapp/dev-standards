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
| `enable_iac_check` | IaCの静的検査（checkov） | `serverless*.yml`があるとき |
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

新規プロジェクトの`ci.yml`は、次の入力を最初から`true`にして始める。
`serverless*.yml`が無ければ、IAM・DynamoDB・ヘッダーの3つは不要である。

```yaml
    with:
      self_ref: v2.x.y # uses:と同じバージョン
      enable_secret_scan: true
      enable_email_scan: true
      enable_workflow_security_check: true
      enable_eslint_rules_check: true
      enable_security_headers_check: true
      enable_iac_check: true
      enable_iam_actions_check: true
      enable_dynamodb_protection_check: true
```

導入手順は、[`reusable-workflows-reference.md`](reusable-workflows-reference.md)を参照する。
今後追加するセキュリティ検査も、`CHECKS`へ登録して同じ仕組みに載せる。
