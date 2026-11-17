# サーバーレスAPIの堅牢化チェックリスト

Lambda + API Gateway + DynamoDB構成のプロダクトで、lint・カバレッジ等の機械的な基準を満たしても残りやすい課題をまとめる。[`ai-driven-app-curriculum.md`](ai-driven-app-curriculum.md)「フェーズ5: 品質課題の棚卸しとリファクタリング」で、棚卸しの観点として使う。

各項目は、参照側リポジトリの棚卸しで実際に見つかったものである。いずれも通常の動作確認では表面化しない。データ量の増加・外部サービスの不調・誤操作が起きて初めて問題になる。

## 1. データ保護（DynamoDB）

利用者が入力したデータを持つテーブルに、以下が設定されているか確認する。

- ポイントインタイムリカバリ（`PointInTimeRecoverySpecification`）
- 削除保護（`DeletionProtectionEnabled`）
- `DeletionPolicy: Retain`と`UpdateReplacePolicy: Retain`の両方

`DeletionPolicy`だけでは不足する。キー定義の変更等でテーブルが置換されるとき、旧テーブルの扱いを決めるのは`UpdateReplacePolicy`である。

TTLで自動失効する一時データ（セッション、ワンタイムコード、回数カウンタ等）のテーブルは対象外でよい。

注意点は2つある。

- `Retain`を付けたテーブルは、スタックを削除しても残る。テーブル名を固定している場合、スタックの再作成は同名テーブルの存在により失敗する。既存テーブルをスタックへ取り込む手順を、プロダクトの文書に書いておく
- 復元の手順は実際に1回試す。ポイントインタイムリカバリは別名の新しいテーブルへ復元する仕組みであり、元のテーブルへ書き戻す処理が別途要る

新規テーブルの漏れは、CIで検知できる。`enable_dynamodb_protection_check`を使う。入力と除外の方法は[`reusable-workflows-reference.md`](reusable-workflows-reference.md)を参照する。

## 2. 全件取得（Query・Scanのページネーション）

DynamoDBは1回の応答を1MBで打ち切る。`LastEvaluatedKey`を見ずに`Items`だけを使うと、データが増えた時点で結果が黙って欠ける。

`Scan`に`FilterExpression`を付けている箇所は特に注意する。打ち切りはフィルタ適用前の読み取り量で決まる。該当する行が少なくても、テーブル全体が1MBを超えると取りこぼす。

確認方法は、`QueryCommand`・`ScanCommand`の呼び出し箇所を検索し、`LastEvaluatedKey`を処理しているかを見ることである。

全件取得には`shared/lambda/dynamoPagination.js`の`queryAll`・`scanAll`を使う。
- 件数の上限（`maxItems`、既定10000）を超えたら、黙って打ち切らず例外を投げる
- 取得しながら処理する用途（全削除等）は、1ページずつ返す`queryPages`・`scanPages`を使う
- `Limit`付きの`Query`は「先頭N件が欲しい」意図のことがある。置き換えは呼び出し箇所ごとに意図を確認する
- 多数の項目の書き込み・取得は`shared/lambda/dynamoBatch.js`の`batchWriteAll`・`batchGetAll`を使う。25件・100件への分割と、未処理分を再試行する

影響が大きいのは、全件を対象にする処理である。退会時のデータ全削除、一括更新、件数の集計等が該当する。一部だけ処理して成功を返すと、失敗に気づけない。安全な一括処理の書き方は[`dynamodb-safe-backfill-pattern.md`](dynamodb-safe-backfill-pattern.md)を参照する。

## 3. 公開エンドポイントの防御

### スロットリング

認証の無いエンドポイントに、呼び出し回数の上限があるか確認する。クライアントエラー報告（[`client-error-reporting-pattern.md`](client-error-reporting-pattern.md)）のような公開エンドポイントは、入力長の上限だけでは足りない。大量に呼ばれると、Lambdaの実行とログ保存の費用が増える。

設定方法はAPIの種別（REST API・HTTP API）とデプロイツールにより異なる。設定後、生成されたCloudFormationテンプレートに反映されていることを確認する。

利用者単位で回数を制限したい場合は[`daily-rate-limit-pattern.md`](daily-rate-limit-pattern.md)を使う。

### CORS

許可オリジンを自サイトのドメインに限定しているか確認する。全オリジン許可（`cors: true`等）のままにしない。

限定する際は、次の点を確認する。

- 許可ヘッダーに`Authorization`と`Content-Type`を含める。漏れると、Bearerトークンを付けるAPIがプリフライトで失敗する
- ローカル開発（`localhost`）から本番APIを呼ぶ運用をしている場合、その可否を決めて文書に書く
- 変更後、ブラウザ経由のE2Eで確認する。CORSの誤りはサーバー側のテストでは検知できない

### 共有シークレットの比較

サーバー間の内部APIを共有シークレットで守る場合、通常の文字列比較（`===`）を使わない。`shared/lambda/sharedSecret.js`の`isSameSecret()`を使う。期待値が未設定のときに必ず不一致を返す点も、この関数が担保する。

## 4. 外部API呼び出し（LLM等）

外部APIを呼ぶ処理に、タイムアウトとリトライがあるか確認する。無い場合、外部の応答が遅いとLambda自体がタイムアウトし、利用者には理由の分からない失敗として見える。

- タイムアウトは固定値ではなく、Lambdaの残り実行時間（`context.getRemainingTimeInMillis()`）から決める。リトライを入れてもLambda自体のタイムアウトに到達しないようにするためである
- リトライの対象は、429・5xx・接続エラーに限る。それ以外の4xxはリトライしない
- 回数は少なくする。利用者が画面の前で待っている処理では、最大1回を目安にする
- 利用回数を数えている場合、リトライでは回数を増やさない
- 最終的に失敗した場合、利用者へ返す文面を決めておく。外部APIのエラー本文をそのまま返さない

これらは`shared/lambda/deadlineRequest.js`の`requestWithDeadline`で実現できる。
- HTTP送信は持たない。呼び出し側が`send(signal)`を渡す
- 残り時間が足りなければ送信せずに失敗させる
- 失敗時のエラーは、最後の`statusCode`と試行回数を持つ。本文は`message`に含めない

レスポンスの文字化け対策は[`https-response-buffer-encoding-pattern.md`](https-response-buffer-encoding-pattern.md)を参照する。API Gatewayのタイムアウトを超える処理は[`async-job-polling-pattern.md`](async-job-polling-pattern.md)を使う。

### リクエストボディの入力検証

`shared/lambda/validation.js`の小さな検証関数で、ボディの型・必須・文字数上限を確認する。
- `requireObject`・`requireString`・`optionalString`・`requireBoolean`・`optionalDate`・`requireExactlyOneOf`を提供する
- 失敗時は`statusCode: 400`・`code: "VALIDATION"`の例外を投げる。エラー文言に入力値は含めない
- 上限値の目安は、名前100文字、メモ1000文字である

## 5. 監視が実際に失敗を検知できるか

`AWS/Lambda`の`Errors`メトリクスは、ハンドラが例外を外へ投げた場合にしか増えない。API用のハンドラは例外を捕捉して500や502を返す実装が一般的で、その場合`Errors`は増えない。`Errors`のアラームだけでは、利用者に見えている失敗を検知できない。

確認方法は、ハンドラの`catch`節を見ることである。捕捉してエラー応答を返しているなら、API Gateway側の5xxメトリクスのアラームを併用する。監視の全体構成は[`ops-monitoring-pattern.md`](ops-monitoring-pattern.md)を参照する。5xxのアラーム例は同ドキュメントへ追加する予定である（issue #1386）。

通知先にSNSのEmail購読を使う場合、確認メールのリンクを開くまで通知は届かない。デプロイの成功は、通知が届くことを意味しない。

## 6. 設定値と個人情報

workflowや設定ファイルで、変数が未設定のときのフォールバックに実在の値（メールアドレス等）を書いていないか確認する。詳細は[`public-repo-no-pii-pattern.md`](public-repo-no-pii-pattern.md)を参照する。

## 続き

データの整合性（認可・同時更新・親子削除・GSI等）、エラー応答、IAM・デプロイの観点は[`serverless-api-integrity-checklist.md`](serverless-api-integrity-checklist.md)にまとめる。

## 実例

- examination（`bamiyanapp/examination`）の棚卸し（2026-11、issue #694〜#709）。1〜6のすべてが該当した
- uchi-stock（`bamiyanapp/uchi-stock`）。5の「捕捉された失敗を検知できない」に該当した（dev-standards issue #1386）
