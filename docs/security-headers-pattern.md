# CloudFront配信のセキュリティヘッダー標準

標準構成（S3 + CloudFront、[`standard-tech-stack.md`](standard-tech-stack.md)）で配信する参照側は、セキュリティヘッダーを付ける。他の文書には、`Content-Security-Policy`・`ResponseHeadersPolicy`・`Strict-Transport-Security`の記載が無かった。issue #1407で追加した。

本書は、段階1（文書化）、段階2（CSP違反のE2E検知）、段階3（設定漏れのCI検知）を扱う。

## 付与するヘッダーの標準セット

| ヘッダー | 値の例 | 目的 |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | HTTPSへの強制 |
| `X-Content-Type-Options` | `nosniff` | MIMEタイプの推測による実行の防止 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 外部へ送るリファラの制限 |
| `X-Frame-Options` | `DENY`（または、CSPの`frame-ancestors`） | クリックジャッキングの防止 |
| `Content-Security-Policy` | 次節 | スクリプト・通信先の制限 |

## CSPの出発点

次の形から始める。実際のアプリで、違反が出ないことを確認してから狭める。

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' blob:;
connect-src 'self' https://api.example.com;
frame-ancestors 'none';
base-uri 'self';
object-src 'none'
```

- `script-src 'self'`にする。インラインスクリプトは、外部ファイルへ移す。ハッシュ指定は採らない。スクリプトを変えるたびに、インフラ側の更新が必要になる。更新を忘れると、画面が壊れる
- `style-src 'unsafe-inline'`は、Reactの`style`属性のために許可する
- `connect-src`には、APIのドメインを入れる。使う外部サービスは、ここへ足す
- `img-src`・`media-src`の`data:`・`blob:`は、使っている場合だけ許可する
- iOSアプリ（Capacitor）は、CloudFrontを経由しないため、本書の対象外である

## `AWS::CloudFront::ResponseHeadersPolicy`の例

```yaml
Resources:
  SecurityHeadersPolicy:
    Type: AWS::CloudFront::ResponseHeadersPolicy
    Properties:
      ResponseHeadersPolicyConfig:
        Name: ${self:service}-${sls:stage}-security-headers
        SecurityHeadersConfig:
          StrictTransportSecurity:
            AccessControlMaxAgeSec: 31536000
            IncludeSubdomains: true
            Override: true
          ContentTypeOptions:
            Override: true
          ReferrerPolicy:
            ReferrerPolicy: strict-origin-when-cross-origin
            Override: true
          FrameOptions:
            FrameOption: DENY
            Override: true
          ContentSecurityPolicy:
            ContentSecurityPolicy: "default-src 'self'; script-src 'self'; ..."
            Override: true

  Distribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        DefaultCacheBehavior:
          ResponseHeadersPolicyId: !Ref SecurityHeadersPolicy
```

## 展開の順序

**ポリシーを適用した時点で、CSPが即座に効く。** ディストリビューションがstable・canaryで共有される構成（[`blue-green-stage-pattern.md`](blue-green-stage-pattern.md)）では、stableのフロントエンドにも効く。次の順に進める。

1. フロントエンドを修正する（インラインスクリプトの外部化など）
2. その修正を、先にstableへ昇格する
3. そのあとで、インフラ（`ResponseHeadersPolicy`）を変更する

先にインフラを変えると、stableが、CSPに違反して壊れる。

## previewサーバーにも同じCSPを付ける

E2Eが、本番と同じ制約で動くようにするため、`vite preview`にも同じCSPを付ける。CSPの文字列は、インフラ（`ResponseHeadersPolicy`）とpreviewサーバーで、1か所に定義して共有する。例えば、`csp.js`に文字列を置き、`serverless.yml`（`${file(./csp.js)}`）と`vite.config.js`の`preview.headers`が、同じ値を読む。

## CSP違反のE2E検知（`shared/e2e/cspFixture.js`）

開発環境がスマートフォンのみで、ブラウザの開発者ツールで違反を目視できない。そのため、CSP違反を自動で検知する。`cspFixture.js`は、各テストの実行中に`securitypolicyviolation`イベントを監視する。違反が1件でもあれば、テストを失敗させる（issue #1407 段階2）。

```js
import { test, expect } from './cspFixture.js'; // symlink先
```

`coverageFixture.js`と併用する場合は、`mergeTests`で合わせる。

```js
import { mergeTests } from '@playwright/test';
import { test as csp } from './cspFixture.js';
import { test as coverage, expect } from './coverageFixture.js';
export const test = mergeTests(csp, coverage);
```

- previewサーバーに、本番と同じCSPを付ける（上の節）。付けていないと、E2Eでは違反が出ない
- 失敗メッセージに、違反した指令・遮断先・場所を出す。CSPを緩める前に、そのスクリプトや通信先が必要かを確認する
- Report-Onlyの違反も集める。本番へ強制する前に、違反を見つけられる
- 違反を許す正当な理由があるテストは、`test.use({ allowCspViolations: true })`で無効にできる
- 違反を集める部品（`cspWatcher.js`）は、`@playwright/test`に依存しない。単体テストがある

## 設定漏れのCI検知（`enable_security_headers_check`）

`ResponseHeadersPolicyId`の関連付けが無いCloudFrontディストリビューションを、CIで警告する（issue #1407 段階3）。同じ方式の静的検査として、`enable_dynamodb_protection_check`がある（[`reusable-workflows-reference.md`](reusable-workflows-reference.md)参照）。

- `DefaultCacheBehavior`と、`CacheBehaviors`の各要素が対象である。一部のパスだけ関連付けが無い場合は、そのパスを示す
- 入力は、`enable_security_headers_check`・`security_headers_files`・`security_headers_mode`である。`self_ref`も必要である
- 導入時は、既存の参照側が違反になりうる。`security_headers_mode`の既定は`warn`である。是正後に`fail`へ切り替える
- 除外するときは、リソースの`Metadata.DevStandardsSecurityHeadersExempt`へ理由を書く。理由の無い除外は、違反になる
- `!Ref`などのタグと、Serverless Frameworkの変数は、解決しない。構造だけを読む

## 参照側の現状

参照側ごとの実際のヘッダー設定状況は、未確認である。各参照側の`serverless.yml`を確認し、`ResponseHeadersPolicyId`の関連付けの有無を、issue #1407へコメントする。標準構成で配信する参照側は、同じ状態の可能性が高い。
