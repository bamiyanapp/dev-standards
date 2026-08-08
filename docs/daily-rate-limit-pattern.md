# 日次利用回数の上限カウンタ（`shared/lambda/dailyRateLimit.js`）

課金・レート制限のある外部API（Gemini/OpenAI等）の呼び出しや、トークン発行回数等を、識別子（メールアドレス等）単位で1日あたり上限まで制限する。DynamoDBの`UpdateItem`（`ADD` + `ConditionExpression`）による単一リクエストでの読み取り・条件判定・更新でレースコンディションを避ける。examinationの`aiApiLimit.js`（examination#124）・`voiceTokenIssuance`相当の実装（examination#69）から、DynamoDBクライアント・`UpdateItemCommand`クラスの両方を呼び出し側から注入する形に汎用化して切り出した。

**このファイル自体は`@aws-sdk/client-dynamodb`を`require`しない**。symlink経由で共有する場合、Node.jsの`require()`はシンボリックリンクの実体パス（dev-standards配下）を起点に`node_modules`を探索するため、このファイル自身がnpmパッケージを`require`すると呼び出し側（examination等）にインストール済みのパッケージを見つけられず`MODULE_NOT_FOUND`になる。フロントエンド（Vite）は`resolve.preserveSymlinks`で回避できるが、AWS Lambdaランタイムには同様の制御手段が無いため、`UpdateItemCommand`クラスも`ddb`と同様に呼び出し側から渡す設計にして依存をゼロにしている。

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

パーティションキー1つ（`keyAttribute`で指定する文字列属性）のみを持ち、TTL（属性名`expiresAt`固定）を有効にしたテーブルを、呼び出し側リポジトリの`serverless.yml`等で用意する。

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

- `ddb`（DynamoDBClientインスタンス）・`UpdateItemCommand`は呼び出し側で生成・requireして渡す（region等はプロダクト側の都合に委ねる）ため、共有側は`@aws-sdk/client-dynamodb`を含め一切の外部依存を持たない（上記のsymlink+Node.js requireの制約を参照）
- キーは`${identifier}#YYYY-MM-DD`（UTC日付）で構成する。日付が変わるたびに新しいカウンタになる
- `ttlSeconds`の既定値（25時間）は、単純な24時間ではなく1時間の余裕を持たせている。TTLによる削除はDynamoDB側でベストエフォート（数分〜数時間の遅延がある）のため、日付境界をまたいだタイミングでのカウンタ削除漏れによる誤判定を避けるため
