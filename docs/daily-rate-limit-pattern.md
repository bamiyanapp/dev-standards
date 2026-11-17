# 日次利用回数の上限カウンタ（`shared/lambda/dailyRateLimit.js`）

課金・レート制限のある外部API（Gemini/OpenAI等）の呼び出しや、トークン発行回数等を、識別子（メールアドレス等）単位で1日あたり上限まで制限する。DynamoDBの`UpdateItem`（`ADD` + `ConditionExpression`）による単一リクエストでの読み取り・条件判定・更新でレースコンディションを避ける。examinationの`aiApiLimit.js`（examination#124）・`voiceTokenIssuance`相当の実装（examination#69）がベースである。そこから、DynamoDBクライアント・`UpdateItemCommand`クラスの両方を呼び出し側から注入する形に汎用化して切り出した。

**このファイル自体は`@aws-sdk/client-dynamodb`を`require`しない**。symlink経由で共有する場合、Node.jsの`require()`はシンボリックリンクの実体パス（dev-standards配下）を起点に`node_modules`を探索する。このファイル自身がnpmパッケージを`require`すると呼び出し側（examination等）にインストール済みのパッケージを見つけられず`MODULE_NOT_FOUND`になる。フロントエンド（Vite）は`resolve.preserveSymlinks`で回避できる。しかしAWS Lambdaランタイムには同様の制御手段が無い。そのため、`UpdateItemCommand`クラスも`ddb`と同様に呼び出し側から渡す設計にして依存をゼロにしている。

## 使い方

```js
const { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { incrementAndCheckDailyLimit } = require("./dailyRateLimit.js"); // symlink先

const ddb = new DynamoDBClient({ region: "us-east-1" });

async function callExternalApi(email) {
  const allowed = await incrementAndCheckDailyLimit({
    ddb,
    UpdateItemCommand,
    tableName: "my-app-ai-api-issuance",
    keyAttribute: "emailDate", // テーブルのパーティションキー属性名
    identifier: email,
    limit: 100,
  });
  if (!allowed) {
    throw new Error("1日あたりの利用上限に達しました");
  }
  // ...実際の外部API呼び出し
}
```

## 前提となるDynamoDBテーブル定義

パーティションキー1つ（`keyAttribute`で指定する文字列属性）のみを持つテーブルを用意する。TTL（属性名`expiresAt`固定）を有効にする。呼び出し側リポジトリの`serverless.yml`等で用意する。

```yaml
MyAppAiApiIssuanceTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: my-app-ai-api-issuance
    AttributeDefinitions:
      - AttributeName: emailDate
        AttributeType: S
    KeySchema:
      - AttributeName: emailDate
        KeyType: HASH
    BillingMode: PAY_PER_REQUEST
    TimeToLiveSpecification:
      AttributeName: expiresAt
      Enabled: true
```

呼び出し側のLambda実行ロールに、このテーブルへの`dynamodb:UpdateItem`権限を付与すること。

## 設計上の要点

- `ddb`（DynamoDBClientインスタンス）・`UpdateItemCommand`は呼び出し側で生成・requireして渡す（region等はプロダクト側の都合に委ねる）。このため共有側は`@aws-sdk/client-dynamodb`を含め一切の外部依存を持たない（上記のsymlink+Node.js requireの制約を参照）
- キーは`${identifier}#YYYY-MM-DD`（UTC日付）で構成する。日付が変わるたびに新しいカウンタになる
- `ttlSeconds`の既定値（25時間）は、単純な24時間ではなく1時間の余裕を持たせている。TTLによる削除はDynamoDB側でベストエフォート（数分〜数時間の遅延がある）のため、日付境界をまたいだタイミングでのカウンタ削除漏れによる誤判定を避けるため

## 認証なしの公開APIをIP単位で制限する

認証の無いエンドポイントは、識別子を送信元IPにして制限できる（dev-standards#1406）。`dailyRateLimit.js`の薄いラッパーを使う。`incrementAndCheckDailyLimit`のシグネチャは変わらない。

```js
const { rateLimitIdentifier, checkRateLimitFailOpen } = require("./dailyRateLimit.js"); // symlink先
const { tooManyRequests } = require("./httpResponse.js");

const allowed = await checkRateLimitFailOpen({
  ddb, UpdateItemCommand, tableName, keyAttribute: "key",
  identifier: rateLimitIdentifier(event, "send-notice"),
  limit: 20, // 通常の利用で到達しない水準にする。根拠をコメントに残す
});
if (!allowed) return tooManyRequests(origin, "しばらくしてからお試しください");
```

- `rateLimitIdentifier(event, name)`は、`<name>#<送信元IP>`を返す。REST API（v1）と、HTTP API（v2）の両方に対応する。IPを取れないときは、`<name>#unknown`にする（例外を投げない）
- `checkRateLimitFailOpen`は、テーブルへのアクセス自体が失敗したとき、`onError`（既定は`console.error`）で記録して`true`を返す。レート制限の障害で、本来の機能を止めないためである。上限に達したときは、従来どおり`false`を返す
- 全体の総量の上限（IPを変えながら送られても、外部通知の送信数を使い切らないようにする）は、識別子を固定文字列（例: `send-notice#all`）にすれば作れる

### 上限値の選び方

- 学校・イベント会場等では、多数の端末が同じIPを共有する。上限値は、通常の利用で到達しない水準にする
- キャッシュヒットは数えない。キャッシュミス（課金が発生した場合）だけを数える

### API Gatewayのスロットリングとの使い分け

| 目的 | 手段 |
|---|---|
| 費用の上限を掛けたい（誰からの呼び出しでも合計で制限する） | API Gatewayのスロットリング |
| 利用者・送信元ごとに公平に制限したい（1人が上限を使い切っても、他の人は使える） | `dailyRateLimit` |

- スロットリングは、Lambdaの起動前に429で落ちる。Lambdaとログの費用が発生しない。一方、API全体で共有されるため、攻撃を受けている間は、正規の利用者も429になる
- `dailyRateLimit`は、リクエストごとに`UpdateItem`の課金が発生し、専用テーブルも要る。一方、1人が上限を使い切っても、他の人は使える
- WAFは、固定費がある。「1日の総量」も抑えられない。REST APIのステージ単位のスロットリングは、osls標準では設定できない
- API Gatewayのスロットリングの設定例は、[`serverless-api-hardening-checklist.md`](serverless-api-hardening-checklist.md)を参照する
