# サーバーレスAPI構成パターン（API Gateway + Lambda + DynamoDB + SAM）

**デプロイツール（AWS SAM）自体は標準索引（`docs/standard-tech-stack.md`）からは外れた構成。** 標準ではバックエンドAPIのデプロイツールをOSLSに統一しており（「3. バックエンドAPI」参照）、本ドキュメントはAWS SAMによる実装例として残している。一方、**「認証パターン（Cognitoを使わない）」節のGoogle IDトークン直接検証ロジック自体はデプロイツールと独立**しており、OSLSベースのバックエンドと組み合わせて使う場合も標準構成として引き続き有効（`docs/standard-tech-stack.md`「2. ログイン」参照）。

Cognitoを使わず、Google OAuthのIDトークンをバックエンドで直接検証する、より小規模なプロダクト向けの構成。Camp-Stock（[bamiyanapp/Camp-Stock](https://github.com/bamiyanapp/Camp-Stock)）で検証済み。

## アーキテクチャ

1つのAWS SAMテンプレート（`infra/template.yaml`）で、API・データストア・フロントエンド配信をまとめて管理する。

```
Browser (React/Vite SPA)
   │ Bearer <Google IDトークン>
   ▼
API Gateway (HTTP API, ANY /{proxy+})
   │
   ▼
Lambda（単一関数、内部ルーティング）
   │
   ▼
DynamoDB（テーブルはドメインごとに複数）

Browser ── CloudFront ── S3（フロントエンドビルド成果物）
```

- API・フロントエンド配信を同一SAMスタックにまとめることで、`sam deploy`一発でバックエンド・フロントエンドホスティングの整合性（CORSのAllowOrigin等）を保てる
- DynamoDBテーブルは`PAY_PER_REQUEST`課金にし、小規模プロダクトでの容量プランニングを不要にする

## バックエンドのコード構成

```
backend/src/
  handler.js       # Lambdaエントリポイント。DynamoDBクライアント・repository・serviceの
                    # 組み立てをここに閉じ込め、他はAWS SDKに依存させない
  router.js         # パスパターンマッチ＋認証の一元化＋エラー→HTTPステータス変換
  lib/googleAuth.js # Google IDトークン検証（DI可能、テストでは実通信しないfakeに差し替え）
  routes/index.js   # method+pathとhandlerの対応表
  services/*.js      # ビジネスロジック（AWS SDKに依存しない、単体テストしやすい）
  repositories/*.js  # DynamoDBアクセスの薄いラッパー（実装をテストでは差し替え可能にする）
```

- `handler.js`は`event`（API Gateway HTTP API, payload format 2.0）を受け取り`router.js`へ委譲する純粋な変換層。`router.handleRequest({ method, path, headers, body, query })`が実処理を行う
- `router.js`は、マッチしたルートの`handler`を呼ぶ前に必ず`authenticate(headers)`を実行し、失敗時は401を返す（認証をルーティングより手前で一元化）。`services/*`が投げるエラー（`ValidationError`/`NotFoundError`/`UnauthorizedError`/`ForbiddenError`、いずれも`statusCode`プロパティを持つ）を、ここでHTTPレスポンスへ変換する
- `services/*`・`repositories/*`はコンストラクタ関数（`createXxxService(repository)`）でDIする設計にし、単体テストでは`repositories`をin-memory実装に差し替える（下記「テストパターン」参照）

### CORSとOPTIONSプリフライト

CORSはAPI Gateway（HTTP API）の`CorsConfiguration`側で処理し、Lambda側のレスポンスに`Access-Control-Allow-Origin`等は含めない。ただし`ANY /{proxy+}`ルートは`OPTIONS`メソッドにも一致してしまい、HTTP APIのCORS自動プリフライト応答（Lambda統合を経由しない仕組み）が働かず、プリフライトリクエストがLambdaまで転送される。`router.js`にOPTIONS用のルートは用意しないため、`handler.js`側で`method === "OPTIONS"`を最初に判定し204を返す。

## 認証パターン（Cognitoを使わない）

- フロントエンド: `@react-oauth/google`でGoogleのIDトークンを取得し、`fetch`のたびに`Authorization: Bearer <idToken>`ヘッダーへ付与する（`frontend/src/api/client.js`）
- バックエンド: `google-auth-library`の`OAuth2Client.verifyIdToken({ idToken, audience: clientId })`でIDトークンを検証する（`backend/src/lib/googleAuth.js`）。`audience`にGoogle Cloud ConsoleのクライアントIDを指定することで、他のGoogleサービス向けに発行されたIDトークンを弾く
- サーバー側でセッション・トークンストアを一切持たない。IDトークン自体がリクエストのたびに検証される（Cognito・独自セッション管理が不要な分、構成がシンプルになる）
- `createGoogleAuthenticator({ clientId, oAuth2Client })`は`oAuth2Client`をDI可能にしており、テストでは実際にGoogle APIへ通信しないfakeへ差し替える

## DynamoDBアクセスパターン

- `repositories/*.js`はDynamoDB Document Client（`@aws-sdk/lib-dynamodb`）の薄いラッパー（`get`/`put`/`list`/`delete`程度のシンプルなインターフェース）
- `services/*.js`はrepositoryのインターフェースにのみ依存し、AWS SDKを直接importしない。これにより単体テストでは`test/helpers/inMemoryRepositories.js`（`Map`ベースの同じインターフェース実装）に差し替えて、実DynamoDBへ一切アクセスせずにビジネスロジックを検証できる
- SAMテンプレート側は`DynamoDBCrudPolicy`（AWS SAM組み込みポリシーテンプレート）でLambda実行ロールへ必要最小限のCRUD権限のみを付与する

## SAMテンプレートの要点

- `Globals.Function.Environment.Variables`にテーブル名・`GOOGLE_CLIENT_ID`をまとめて定義し、各Lambda関数（本パターンでは単一）へ自動的に環境変数として渡す
- フロントエンド配信（S3 + CloudFront）も同一テンプレートに含める
  - S3バケットは`PublicAccessBlockConfiguration`で完全非公開にし、CloudFrontの**Origin Access Control**（OAC、Origin Access Identity の後継）経由でのみ読み取りを許可する
  - SPAのクライアントサイドルーティング（`react-router-dom`の`BrowserRouter`）向けに、CloudFrontの`CustomErrorResponses`でS3の403/404を200の`index.html`へフォールバックさせる
- `sam deploy --resolve-s3`で、SAMのデプロイ管理用S3バケットを自動作成・再利用させる（手動でのバケット管理が不要）

## CI/CDのデプロイ固有事項

`docs/cicd-pipeline-specification.md`の`reusable-cd.yml`（semantic-releaseによるバージョニング）に続けて、参照側リポジトリ自身の`cd.yml`でプロダクト固有のデプロイジョブを実行する。

- `sam build` → `sam deploy` → スタック出力（API・S3バケット名・CloudFront distribution ID等）取得 → フロントエンドビルド（`VITE_API_BASE_URL`にAPI出力を注入） → S3同期 → CloudFront invalidation、という順序
- **キャッシュ制御の分離が必須**: `index.html`・Service Worker関連ファイル（`sw.js`等）は`--cache-control "no-cache"`、コンテンツハッシュ付きの`assets/*`は`--cache-control "public, max-age=31536000, immutable"`。分けないと、ブラウザにキャッシュされた古い`index.html`が削除済みの古いハッシュ付きアセットを参照し続ける
- **submodule取得の見落としに注意**: `dev-standards/shared/`配下の実体へsymlinkしているコンポーネントを使っている場合、`ci.yml`側だけでなく、参照側リポジトリ自身の`cd.yml`の`Checkout`ステップにも個別に`submodules: true`が必要（`reusable-ci.yml`内のjobとは独立したチェックアウトのため、片方を直しても他方には及ばない。実際にこの見落としで`npm run build`が失敗する障害が発生した）
- **Secretsの値をAIが直接確認できない運用への対応**: `GOOGLE_OAUTH_CLIENT_ID`のようなSecretは、Claude Codeからは書き込み専用で値を読めない。デプロイジョブ内で形式チェック（正規表現）＋値のハッシュ（先頭数文字のみ）をJob Summaryへ出力し、「意図した値に更新されているか」をハッシュの一致・不一致で人間がスマートフォンから確認できるようにする（値そのものは露出させない）

## テストパターン

- **単体テスト**: `test/helpers/inMemoryRepositories.js`のin-memory repositoryへ差し替え、実DynamoDB・実Google認証を使わずにservices層を検証する
- **E2Eテスト**: `backend/e2e/testServer.js`が、本番`handler.js`と同じ`createRouter`/`buildRoutes`/serviceファクトリ関数を再利用しつつ、in-memory repositoryと「Google APIへ実通信せず、JWTペイロードをbase64url decodeするだけ（署名検証なし）」のfake authenticatorに差し替えた、最小限の`http.createServer`ラッパー。Playwrightの`webServer`設定からこのテストサーバーを起動し、フロントエンドの`context.addCookies()`でE2E用のfake IDトークンをあらかじめセットすることで、実際のGoogle OAuthログインフローを経由せずにE2Eテストを実行できる
- 詳細な呼び出し規約（スクリーンショット報告等）は`docs/cicd-pipeline-specification.md`「CIワークフロー」を参照

## 参考実装

具体的なコードは[bamiyanapp/Camp-Stock](https://github.com/bamiyanapp/Camp-Stock)の`backend/`・`infra/template.yaml`を参照。
