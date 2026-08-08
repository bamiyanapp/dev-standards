# CloudFront+Cognito静的サイト→別バックエンドAPIの短命Bearerトークン認証パターン

CloudFront + Lambda@Edge + Cognitoでログイン管理する静的サイトから、別オリジンで動くバックエンドAPI（API Gateway + Lambda等）をブラウザから直接呼びたい場合の認証パターン。examinationの`/_voice-token`（[examination#62](https://github.com/bamiyanapp/examination/issues/62)）で採用している設計を、他プロダクトでも参考にできるようレシピ化する。コードの共有ではなく、Cognito/CloudFront/Lambda@Edgeという特定インフラに強く結合した**設計判断**の共有が目的。

## 問題: 静的サイトのログインセッションと別バックエンドAPIをどう繋ぐか

CloudFrontの`id_token`Cookie（Lambda@Edgeで検証）によるログインセッションは、そのCloudFrontディストリビューション自身が処理するリクエストにしか効かない。別オリジンのAPI Gateway等へブラウザから直接fetchする場合、そちらは別のCookie検証の仕組みを持たない（あるいは持たせるとCloudFront側の認証ロジックを二重に実装することになる）。

かといって、CognitoのIDトークン（JWT）自体をブラウザ→バックエンドAPIへそのまま渡す設計は、有効期限が長め（既定1時間、リフレッシュも絡む）でスコープも広いトークンを別オリジンへ露出させることになり、バックエンドAPI側でのJWT検証ロジック（JWKS取得等）の重複実装も必要になる。

## 解決: 用途汎用・短命なトークンをCloudFront側で発行し、バックエンドAPIはそれだけを検証する

1. **発行側**（CloudFrontのLambda@Edge、Cognitoセッションを検証できる立場）: ログイン済み・許可済みユーザーからのリクエストに対し、ランダムな短命トークンを発行してDynamoDBへ保存し、レスポンスボディで返す
2. **ブラウザ側**: このトークンを`Authorization: Bearer <token>`ヘッダーに載せて、別オリジンのバックエンドAPIへCORS越しにリクエストする
3. **検証側**（バックエンドAPI Lambda）: `Authorization`ヘッダーからトークンを取り出し、DynamoDBへ問い合わせて有効期限内かどうか・紐づくメールアドレスが許可リストに含まれるかどうかを確認する。CognitoのJWT検証ロジックをバックエンドAPI側に持たせる必要が無い

トークン自体は「ログイン済み・許可済みユーザーであることの証明」以上の意味を持たない汎用的なものにし、特定機能名に縛られた名前を避ける（examinationでは`/_voice-token`という発行元エンドポイント名は音声機能由来だが、トークン自体はバックエンドAPI全般で使い回している）。

### 発行側（CloudFront Lambda@Edge）

```js
const VOICE_TOKENS_TABLE = "my-app-tokens";
const TOKEN_TTL_SECONDS = 60 * 60;

async function handleTokenApi(request) {
  const payload = await verifyIdTokenFromCookie(request); // 既存のCognitoセッション検証
  if (!payload) return forbiddenResponse();
  const email = String(payload.email || "").toLowerCase();
  if (!(await isAllowedEmail(email))) return forbiddenResponse();

  // 1日あたりの発行上限チェック等はdocs/daily-rate-limit-pattern.md参照

  const token = crypto.randomBytes(32).toString("hex");
  await ddb.send(
    new PutItemCommand({
      TableName: VOICE_TOKENS_TABLE,
      Item: {
        token: { S: token },
        email: { S: email },
        expiresAt: { N: String(Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS) },
      },
    })
  );
  return jsonResponse(200, "OK", { token, expiresInSeconds: TOKEN_TTL_SECONDS });
}
```

### 検証側（バックエンドAPI Lambda）

```js
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const ddb = new DynamoDBClient({ region: "us-east-1" });

async function verifyToken(token) {
  const result = await ddb.send(new GetItemCommand({ TableName: "my-app-tokens", Key: { token: { S: token } } }));
  if (!result.Item) return null;
  const expiresAt = Number(result.Item.expiresAt?.N || 0);
  if (expiresAt < Math.floor(Date.now() / 1000)) return null;
  return result.Item.email.S;
}

async function isEmailAllowed(email) {
  const result = await ddb.send(new GetItemCommand({ TableName: "my-app-allowed-emails", Key: { email: { S: email } } }));
  return Boolean(result.Item);
}

// Authorization: Bearer <token> ヘッダーを検証し、許可済みユーザーのメールアドレスを返す。
// 認証できない場合はnullを返す（呼び出し側で403を返す）
async function verifyBearerEmail(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return null;
  const email = await verifyToken(token);
  if (!email || !(await isEmailAllowed(email))) return null;
  return email;
}
```

実例: examination`infra/site-stack/functions/checkAuth.js`の`handleVoiceTokenApi`（発行側）・`infra/bot-stack/functions/apiAuth.js`の`verifyBearerEmail`（検証側）。

## 前提となるDynamoDBテーブル定義

トークン用テーブルはパーティションキー`token`（文字列）のみを持ち、TTL（属性名`expiresAt`固定）を有効にする。許可リストテーブル（`isAllowedEmail`が参照する側）は既存の認証基盤（`examination-allowed-emails`相当）をそのまま流用してよい。

```yaml
MyAppTokensTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: my-app-tokens
    AttributeDefinitions:
      - AttributeName: token
        AttributeType: S
    KeySchema:
      - AttributeName: token
        KeyType: HASH
    BillingMode: PAY_PER_REQUEST
    TimeToLiveSpecification:
      AttributeName: expiresAt
      Enabled: true
```

発行側（CloudFront Lambda@Edge）の実行ロールにこのテーブルへの`dynamodb:PutItem`権限を、検証側（バックエンドAPI Lambda）の実行ロールに`dynamodb:GetItem`権限を付与する（発行側と検証側は別スタック・別リージョンにまたがることが多いため、テーブル自体をどちらのスタックで定義するか・クロスリージョンアクセスが必要かは各プロダクトの構成に応じて検討する）。

## 設計上の要点

- トークンのTTLは短命（examinationでは1時間）にする。長時間有効なセッション自体はCloudFront側のCookie（`id_token`/`refresh_token`）が担うため、このトークンは「バックエンドAPI呼び出しのための一時的な鍵」の位置づけでよい
- 発行回数自体にも1日あたりの上限を設け、誤操作・アカウント乗っ取り等でのAPI呼び出し急増を抑える（`docs/daily-rate-limit-pattern.md`のパターンをそのまま使える）
- トークンの用途を機能名に縛らず汎用化しておくと、後から追加したバックエンドAPI（examinationでは想定問答閲覧・模擬面接記録閲覧・家族情報API等）でも同じトークン発行フローを使い回せる
- バックエンドAPI側はCognitoのJWT検証ロジック（JWKS取得・署名検証等）を一切持たなくてよい。DynamoDBへの単純な`GetItem`のみで完結する
