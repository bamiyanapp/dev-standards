# ハードコードされたクレデンシャルの検知パターン

本書は、ソースコードに誤ってハードコードされた認証情報（APIキー・トークン・秘密鍵等）を、CI（`enable_secret_scan`）でどう検知しているかをまとめる。

## 背景

issue #1337。AI駆動開発では、生成されたコードにクレデンシャルが埋め込まれるリスクがある。既知の形式（AWSキー・GitHubトークン等）だけでなく、既知パターンに該当しない未知の秘密情報も、できる限り検知したい。

## 検討した方式と判断

ESLintレベル（ソースコードのAST解析）でハードコードされた文字列リテラルを検知する仕組み（`eslint-plugin-no-secrets`等）の追加を検討したが、採用しなかった。理由は以下の通り。

- gitleaks（`enable_secret_scan`が使うCLI本体）の標準ルールセットには`generic-api-key`ルールが既に含まれる。「`key`/`token`/`secret`/`password`等を含む変数名への代入＋高エントロピー文字列」を検知できる。これはESLint側で狙っていた「文脈認識」「未知パターンの高エントロピー検知」とほぼ同じアプローチである
- ESLint追加はJS/TSのソースコードに限定されるが、gitleaksは`.env`・YAML・設定ファイル等、全ファイル種別をカバーする
- 誤検知対応の除外設定が、gitleaks側（`.gitleaks.toml`）とESLint側の2箇所に分散してしまう

既存のgitleaksを強化する方針（ドキュメント化・誤検知時の対応手順の明文化）で対応する。

## `generic-api-key`ルールの実証

サンドボックス環境でgitleaks CLI（v8.30.1）を直接実行し、既知形式に該当しない変数名でも検知されることを確認した。

```js
// 検知対象ファイル（例）
const AWS_SECRET_ACCESS_KEY = "pXE4GmhXFU80h06cAO/eTrDqrHiLo2ppR2KPFvBE"; // generic-api-keyで検知
const apiSecretKey = "vnVG8HkERJHL2ZtvDs4kS7r2OJP5PlmnEXO1PhTm"; // generic-api-keyで検知
const githubToken = "ghp_UB3O1a6QlbtdSu8uiX5K4Kykfoo0wRHJqgKw"; // github-pat（既知形式）で検知
```

再現手順: 上記のようなランダム文字列を含むファイルをコミットし、`gitleaks detect --source . --redact -v`を実行する。`generic-api-key`・`github-pat`等のRuleIDとともに検知結果が出力されることを確認できる。

`AKIA`で始まるAWSアクセスキーID等、公式ドキュメントでよく使われる既知のサンプル値（例: `AKIAIOSFODNN7EXAMPLE`）がある。これらはgitleaksの標準allowlistにより誤検知として除外される。実機検証では、サンプル値ではなくランダム生成した文字列を使う必要がある。

## 誤検知対応の手順

`generic-api-key`ルールは変数名ベースの検知のため、テスト用のダミー値・ハッシュ値・UUID等を誤って検知することがある。誤検知が発生した場合、参照側リポジトリのルートに`.gitleaks.toml`を置いてallowlistを設定する（[gitleaksの設定ドキュメント](https://github.com/gitleaks/gitleaks#configuration)参照）。

```toml
# .gitleaks.toml の例
[allowlist]
  description = "既知の誤検知を許可する"
  regexes = [
    '''テスト用ダミー値の正規表現''',
  ]
  paths = [
    '''テストフィクスチャのパス等''',
  ]
```

## 検知範囲（PR差分スキャンと定期フルスキャンの役割分担）

- `enable_secret_scan`（`reusable-ci.yml`のsecret-scan job）: PRのbase_branchとの差分のみを対象にスキャンする。リポジトリ全履歴を毎回スキャンすると既存履歴に残る過去の誤検知で詰まるため、差分のみに限定している
- `reusable-secret-full-scan.yml`: リポジトリ全体の履歴を対象に定期スキャン（週次等）を行う。PR差分スキャンでは一度も対象に入らない「過去にマージ済みのシークレット」を検知する

両方を導入することで、新規の混入（即時検知）と過去の見逃し（定期検知）の両方をカバーする。

## 既存プロジェクトへの適用状況

karuta（[bamiyanapp/karuta](https://github.com/bamiyanapp/karuta)）の導入状況を確認した。`ci.yml`で`enable_secret_scan: true`、`promote-canary.yml`で`reusable-secret-full-scan.yml`を導入済みである。他の参照側リポジトリ（[`consumer-repositories.md`](consumer-repositories.md)参照）は本書作成時点でアクセスできないため未確認である。
