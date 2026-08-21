# S3 + CloudFrontによる静的サイト配信パターン

全プロダクト共通の静的サイトホスティング構成。OSLS（`osls`パッケージ、[oss-serverless/osls](https://github.com/oss-serverless/osls)。詳細は`docs/nextjs-static-lambda-pattern.md`「OSLS vs Serverless Framework本家」参照）でS3バケット・CloudFrontディストリビューションをコードとして定義する。

`docs/serverless-static-site-pattern.md`（examination由来、Lambda@Edgeによるサイト全体ログイン保護込みの構成）から、認証ゲート部分を除いた純粋なホスティング部分を切り出したもの。サイト全体をログイン必須にしたい場合（閲覧自体を保護したい場合）は、そちらのCognito + Lambda@Edge構成を検討すること。ログインが必要な場合の標準はAPI呼び出し単位の認証（`docs/standard-tech-stack.md`「2. ログイン」参照）であり、フロントエンド自体は誰でも閲覧できる前提とする。

## 全体構成

- S3バケット（静的サイトの格納先）。`PublicAccessBlockConfiguration`で完全非公開にする
- CloudFrontディストリビューション。**Origin Access Control**（OAC）経由でのみS3への読み取りを許可する
- SPAのクライアントサイドルーティングを使う場合、CloudFrontの`CustomErrorResponses`でS3の403/404を200の`index.html`へフォールバックさせる
- 配信自体はアクセスが無い間の実行コストがゼロに近い（S3・CloudFrontは従量課金）

## キャッシュヘッダー戦略

静的サイト配信の標準的な戦略として、ファイル種別ごとに異なる`Cache-Control`を明示的に付与する（S3はデフォルトでCache-Controlを付与しないため、明示しないとCloudFrontのDefaultTTLに委ねられ、更新後も古い内容が配信され続ける不具合の原因になる）。

- ハッシュ付きJS/CSS等のビルド成果物: `public, max-age=31536000, immutable`（内容が変われば名前自体が変わるため長期不変キャッシュにしてよい）
- それ以外（`index.html`・`favicon`等、内容が変わってもファイル名が変わらないもの）: `no-cache`（使用前に必ずオリジンへ再検証させる）

デプロイのたびに`aws cloudfront create-invalidation --paths "/*"`でCloudFrontのエッジキャッシュを無効化する。ただしこれはユーザーのブラウザ本体のキャッシュまでは無効化しないため、PWA化する場合はService Workerの更新パターン（`docs/service-worker-update-pattern.md`）と合わせて設計する。

## デプロイ

OSLSの`serverless.yml`でS3バケット・CloudFrontディストリビューションをCloudFormationリソースとして定義し、`osls deploy`でインフラを構築した上で、ビルド成果物をS3へ同期しCloudFrontのキャッシュを無効化する。

```sh
osls deploy
aws s3 sync dist/ s3://<bucket-name>/ --delete --cache-control "no-cache" --exclude "assets/*"
aws s3 sync dist/assets/ s3://<bucket-name>/assets/ --cache-control "public, max-age=31536000, immutable"
aws cloudfront create-invalidation --distribution-id <distribution-id> --paths "/*"
```

`cd.yml`側の`deploy` jobとして、これらのステップを順に実行する。バックエンドAPIを別途構築する場合（`docs/standard-tech-stack.md`「3. バックエンドAPI」参照）も同じOSLSベースの構成を流用できるが、ホスティング用スタックとバックエンドAPI用スタックは独立したServerless serviceとして分離し、`workspaces`構成のCI/CD入力（`docs/cicd-pipeline-specification.md`参照）でそれぞれデプロイする。

## 必要なGitHub Secrets / Variablesの例

| 名前 | 用途 |
|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | GitHub ActionsからAWSリソースを操作するIAMユーザーの認証情報 |

S3バケット名は全AWSアカウント間・リージョン内でグローバルに一意である必要があるため、既定値の重複時に上書きできるVariableとして用意しておく。

## 初回デプロイ時によくある失敗

- **S3バケット名の重複**: `already exists`エラーが出た場合、別名を指定して再実行する
- **IAMユーザーの権限不足**: デプロイ用IAMユーザーにはS3・CloudFront・CloudFormationへの十分な権限が必要（バックエンドAPIも同じIAMユーザーでデプロイする場合はLambda・DynamoDB・IAM関連の権限も追加で必要）

## この構成に無いもの

- **サイト全体のログイン保護**（Lambda@Edgeによる全リクエスト認証ゲート）は対象外。`docs/serverless-static-site-pattern.md`を参照
- ログイン・バックエンドAPIが必要な場合の構成自体は`docs/standard-tech-stack.md`「2. ログイン」「3. バックエンドAPI」を参照（本ドキュメントはホスティングのみを扱う）
