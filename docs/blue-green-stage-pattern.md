# ブルーグリーン（stable/canary）デプロイパターン

独自ドメインを持たないサーバーレスプロダクト（S3+CloudFront静的配信＋API Gateway/Lambda＋DynamoDB）向けの、一定割合のトラフィックをcanaryへ流しつつ段階的に昇格させるブルーグリーンデプロイパターンをまとめる。karuta（issue #1319、親issue）での実装を一般化したものである。

## 全体構成

- `stable`・`canary`の2ステージを、同一のコードベースから独立したCloudFormationスタックとしてデプロイする
- 両ステージが共有するDynamoDBテーブル等のステートフルリソースは、ステージ別デプロイの対象から分離した専用スタックに置く
- フロントエンドの配信はCloudFront Functionsによる重み付けルーティングで両ステージへ振り分ける
- 新しいcanaryは1週間（運用に応じて調整可能な猶予期間）経過後、問題が無ければ自動的に`stable`へ昇格する
- 同時に進行中のcanaryトライアルは1件に制限し、新しい更新はキュー待ちにする

## S3 + CloudFrontの最小インフラ

独自ドメインを取得せず、CloudFrontの既定ドメイン（`*.cloudfront.net`）で静的サイトを配信する最小構成。[`serverless-static-site-pattern.md`](serverless-static-site-pattern.md)のLambda@Edge認証付きパターンとは異なり、認証を持たない公開サイト向け。

- S3バケットは単一。stable/canaryのビルド成果物をそれぞれ`stable/`・`canary/`プレフィックス配下に配置する
- CloudFrontのデフォルトキャッシュビヘイビアはオリジンパスを空にする。リクエストパスがそのままS3のキーに対応し、ルーティング用のCloudFront Functions（後述）がプレフィックスを付与する
- S3へのアクセスはOrigin Access Control（OAC）経由に限定する。レガシーなOrigin Access Identityは新規では使わない
- このスタックはステージ別デプロイ（backend/frontendのビルド成果物の入れ替え）とは独立した、固定の1つのスタックとして常時存在する
- CloudFrontディストリビューションの初回作成・更新は伝播に15〜20分程度かかるため、頻繁に走る通常のCD（backend/frontendのデプロイ）とは別の、専用の手動ワークフローで管理する

## CloudFront Functionsによる重み付けルーティング

viewer-request/viewer-response関数と、ルーティング状態を保持するCloudFront KeyValueStore（KVS）を使う。

- KVSに重み（既定キー`canary_weight`、未設定時は低い割合を既定にする）と強制切り替えフラグ（既定キー`force_stable`）を持たせる
- viewer-request関数: `canary` Cookieが無い場合、KVSの重みに従ってstable/canaryを抽選し、URIへプレフィックスを付与する。`force_stable`がtrueの場合はCookieに関わらず常にstableにする
- viewer-response関数: 新規抽選が発生した場合のみ（`force_stable`による強制時は発生しない）canary Cookie（例: Max-Age=1週間）を付与する
- 明示的に`/stable/`または`/canary/`で始まるリクエストは重み付け抽選を行わずそのまま通す（手動切り替えリンクパターン、[`shared-ui-components.md`](shared-ui-components.md)参照、との前方互換のため）
- KVSの初期値は、CloudFormationの`AWS::CloudFront::KeyValueStore`では設定できない（`ImportSource`はS3からの一括インポートのみに対応し、個別キーの初期値指定はできない）。スタックデプロイ後に`aws cloudfront-keyvaluestore` CLIで未設定のキーのみ初期値を設定する（既存の値は上書きしない）
- 関数コードはCloudFormationテンプレート内に直接インラインで記述する。Serverless Framework系ツールの`${file(...)}`変数は拡張子が`.js`/`.cjs`のファイルをNode.jsモジュールとして`require()`してしまう。`module.exports`を持たない素のCloudFront Functionsハンドラでは、この結果空オブジェクトが設定される不具合を引き起こすため

### テンプレート（コピー＆調整用）

以下はkarutaの実装（issue #759）から、プロダクト固有のコメント・issue番号を除いて一般化したものである。KVSキー名（`canary_weight`・`force_stable`）は上記の既定キーと一致させている。別名にする場合は該当箇所を書き換える。CloudFormationテンプレートの`FunctionCode: |`直下へそのまま貼り付けて使う。

- **viewer-request関数**: [`examples/blue-green-viewer-request.js`](examples/blue-green-viewer-request.js)
- **viewer-response関数**: [`examples/blue-green-viewer-response.js`](examples/blue-green-viewer-response.js)

## backendの並行stageデプロイ

DynamoDBテーブル等のステートフルリソースを専用スタックへ分離済みであれば、backend自体はstageに依存しない構成にできる。

- IAMポリシー・環境変数のテーブル名等を固定文字列にし、stage名を含めない
- `<デプロイツール> deploy --stage <任意の名前>`で、コード変更無しにそのまま独立したCloudFormationスタック（例: `<service>-stable`・`<service>-canary`）としてデプロイできる
- 既存の本番運用（明示的なstage指定の無い既定stage等）には一切影響しない。デプロイ単位が完全に独立したCloudFormationスタックのため

## canaryデプロイの日次バッチ化（issue #773でkaruta#1449を一般化）

当初はmainマージ毎に即座にcanaryへデプロイし、既に進行中のcanaryトライアルがあればキュー待ちにする方式（カナリア直列化）だった。この方式には、頻繁なマージがあるほどcanaryトライアルが細切れに入れ替わり、1回あたりの検証に使える時間が実質的に短くなる問題があった。これを解消するため、canaryへのデプロイをmainマージ毎から日次バッチへ変更する。

- mainへのマージをトリガーとするCDワークフローは、KVSの`canary_queue_pending`をtrueにするだけで、canaryへの実デプロイは行わない
- 自動昇格ワークフロー（下記）の定期実行時、canaryが空いている（スタックが存在しない、または`force_stable=true`でロールバック済み）状態でキュー待ちがあれば、その時点の最新main HEADを新しいcanaryとしてデプロイし、キューを解放する
- これにより、1日の間に複数回マージされても、canaryへの反映は1日1回にまとまる。専用のジョブキューサービスを新設せず、既存のKVSを状態保持先として再利用する点は変わらない

## 自動昇格・管理者ロールバック・詰まりの自動解消

- 自動昇格ワークフロー: 定期実行（例: 毎日）で、canaryデプロイからの経過日数（猶予期間）と`force_stable`を確認する。猶予期間を過ぎていれば`canary_weight`を100%にしてから`stable`側へ昇格し、canaryスタックを削除してKVSを既定値へリセットする。猶予期間の既定値は運用しながら調整する。最初は1週間程度で始め、確認サイクルを速めたい場合は1日程度まで短縮できる
- **canaryが実際に検証したコミットのみを昇格する**: 自動昇格ワークフローは、ジョブ先頭で1回だけcheckoutした「その時点のmain最新HEAD」を安易にstableへ昇格してはならない。日次バッチ化（キュー処理）とタイミングが重なると、canaryで一度も検証されていないキュー待ちコミットが、canaryを経由せず直接stableへ昇格されてしまう事故につながる（karuta#1616、dev-standards#919）。canaryへ実際にデプロイしたコミットをgitタグで記録し、昇格時はこのタグのコミットを`git worktree add --detach`で別途checkoutして、そちらをstableへデプロイする
  - **`git worktree add`はサブモジュールを自動初期化しない**。メインのcheckoutステップ（`actions/checkout@v7`の`submodules: true`）とは異なり、worktree内ではサブモジュール配下のファイル（共有コードへのシンボリックリンク先等）が空のままになり、ビルドが解決エラーで失敗する。worktree作成直後に明示的な`git submodule update --init --recursive`を実行すること（dev-standards#927で実際に発生した障害）
  - デプロイステップには`timeout-minutes`を設定する。ビルド失敗後もデプロイツールのプロセスが終了せず無応答のままハングし、GitHub Actionsの既定ジョブタイムアウト（360分）まで本番の異常状態（`canary_weight=100%`固定等）が残留する事故が実際に発生した（dev-standards#927）
- 管理者ロールバック: KVSの`force_stable`を手動でtrueに設定するワークフロー。トラフィックを即座にstable側へ固定し、canaryでの問題発覚時に使う
- **緊急デプロイ後の退行防止と自動最新化**: 本番障害等でstableへ緊急手動デプロイした場合、その内容はcanaryを経由していない。この状態で自動昇格が発火すると、canaryの古いコードでstableが上書きされ退行してしまう。これを防ぐため、昇格可否の判定に「stableの最終更新時刻がcanaryより新しいか」のチェックを加える。stableがcanaryを追い越している場合、昇格は安全側にスキップされる。ここで**スキップするだけで終わらせてはならない**。解消する手段が無いと、一度この状態になった時点で昇格が永続的にスキップされ続け、キュー待ちの更新も処理されない詰まりが起きる（実際にこの詰まりで新機能が本番に反映されない事態が発生した）。stableがcanaryより新しいと判定した場合は、キュー待ちの有無に関わらず**canaryを最新main HEADで強制的に最新化する**。canaryの内容は古くて意味の無いトライアルになっているため、上書きしても実害は無く、次回以降のサイクルで正しく検証・昇格が進むようになる
- **canary_weightの手動変更**: 検証目的で重みを一時的に変えたい場合に備え、`workflow_dispatch`で任意の%（0〜100）を指定してKVSの`canary_weight`を変更する専用ワークフローを用意しておくと、AWS CLIを手動実行せずスマートフォンからでも調整できる。入力値が0〜100の整数であることを検証してから書き込む

### 自動昇格ワークフローの判定マトリクス

上記の個々の規則は読み物として理解できても、実行中にどの分岐を通ったかを後から見通しにくい（karuta#1663で実際に誤解が生じた）。`reusable-promote-canary.yml`が毎回の実行で評価する状態の組み合わせを一覧化する。

| canaryスタック | 猶予期間 | force_stable | stableがcanaryより新しい | キュー待ち | 実際の動作 |
|---|---|---|---|---|---|
| 無し | - | - | - | 有り | canary新規デプロイ |
| 無し | - | - | - | 無し | 何もしない |
| 有り | 未経過 | false/true | - | 有り | **canary更新** |
| 有り | 未経過 | false/true | - | 無し | 待機 |
| 有り | 経過 | false | false | 有り | stable昇格、canary更新 |
| 有り | 経過 | false | false | 無し | stable昇格、canary削除 |
| 有り | 経過 | true | - | - | stable更新なし |
| 有り | - | - | **true** | - | stable更新なし、canary更新 |

上書き（表中の太字2行）が発生すると、猶予期間の起点（判定に使うLastUpdatedTime）もリセットされる。

**注意**: 「force_stable＝canaryは空いている」という判定は意図的な設計であり、バグではない。`force_stable`中はcanaryへのトラフィックが無く、上書きしても実害が無いという考え方に基づく。ただし、`force_stable`を`false`へ戻す専用ワークフローが存在しない場合は別の問題が起きる。`force_stable=true`の間は昇格判定自体も`force_stable`チェックで必ず弾かれるため、**`force_stable`を手動で`false`に戻すまで、キューの度にcanaryが上書きされ続け、永久に昇格しない状態が続く**（karuta#1662）。管理者ロールバック（`force_stable=true`）を導入する場合は、同時に「`force_stable`を`false`へ戻す」専用の`workflow_dispatch`ワークフローも必ず用意すること。

## stable緊急修正時のhotfixブランチ切り出し元

上記「緊急デプロイ後の退行防止と自動最新化」は、緊急デプロイ**後**に自動昇格が古いcanaryで上書きしてしまう事故を防ぐものである。これとは別に、緊急デプロイ**そのもの**がどのコミットを対象にするかという問題が残る。

mainのHEADには、canaryへは反映済みだがまだstableへ昇格していない、猶予期間中の未検証な変更が含まれている場合がある。hotfixブランチをmainのHEADから素朴に切り、そのブランチのまま`deploy-backend-stage.yml`（stage=stable）を実行すると、**緊急修正と一緒にこの未検証な変更もstableへ出荷してしまう**。これはcanaryによる段階的検証を経ずに未検証コードを本番の全トラフィックへ晒すことになり、ブルーグリーン構成が本来防ぎたいリスクそのものである。

これを避けるため、stable緊急修正時は以下の手順を踏む。

1. **hotfixブランチは、mainのHEADではなく、現在stableで稼働中のコミットから切る**。稼働中のバージョンは「各stageへのバージョン応答エンドポイント」（`/get-version`等）が返す値から特定し、対応するgit tag・リリースコミットをブランチの起点にする
2. 修正後、そのブランチのまま`deploy-backend-stage.yml`/`deploy-frontend-stage.yml`（stage=stable）を実行し、即時にstableへ反映する。workflow_dispatchは実行時に選択したブランチの内容をそのままデプロイするため、mainを経由せずに反映できる
3. 同じ修正を、通常のブランチ作成→PR→mainへのマージという通常のフローで**別途mainへも取り込む**（forward-fix）。これを省略すると、次回の自動昇格サイクルでこの緊急修正が失われる

上記の正式な手順でhotfixブランチをstableの現在稼働中のコミットから切った場合、`deploy-backend-stage.yml`での直接デプロイはmainを経由しない。semantic-releaseのバージョン採番はmainへのpush時のみ発生するため、この直接デプロイでは**stableの表示バージョン番号が変わらない**（旧バージョンのまま）。後続のforward-fixでmain側に新しい番号が振られて初めて、stableの表示も更新される（karuta#1558）。

## 運用状態の可視化とバージョン不整合検知

AWS CLIへ到達できないスマホオンリーの開発環境では、KVS・CloudFormationスタックの状態（重み・猶予期間の残り等）を都度AWSコンソール・CLIで確認できない。この観点を欠くと、カナリアが詰まっている・昇格が延長され続けている等の異常に気付けないまま運用し続けてしまう。以下の2点を推奨プラクティスとする。具体的なworkflowテンプレートは[`blue-green-workflow-templates.md`](blue-green-workflow-templates.md)「運用状態の可視化ワークフロー（canary-status.yml）」を参照する。

- **運用状態の定期可視化**: スケジュール実行のworkflowが、KVS・CloudFormationスタックの状態をJob Summaryへ出力する。同時に、Git管理下のMarkdownファイル（例: `docs/generated/canary-status.md`）へ自動コミットする。これにより、GitHubのファイルビュー・コミット履歴だけで最新状態を確認できる。AWS CLIへの到達性を持たないスマホオンリーの開発環境でも、運用状態の継続監視が成立する
  - 定期可視化workflowは、自動昇格ワークフロー（`promote-canary.yml`）の完了（成功・失敗問わず）にも`workflow_run`トリガーで反応させる。スケジュールのみだと、自動昇格の実行結果（成否・ハング等の異常）が次の定期実行（最大1日後）まで反映されず、異常発生中の状態確認に手動実行が必要になる（karuta#1633）
- **各stageへのバージョン応答エンドポイントの用意**: canary/stable各stageのバックエンドに、現在配信中のビルドバージョンを返すエンドポイント（例: `/get-version`）を用意する。前者の定期可視化workflowからこのエンドポイントを呼び出し、結果を同じレポートへ含める
- **フロントエンドのビルド時バージョンの外部公開**: 上記のバックエンド向けエンドポイントだけでは、frontend/backendの一方だけが古いビルドのまま取り残される不整合を検知できない（手動per-stageデプロイワークフローの誤用等が原因となる）。実際にbackendのみを見ており検知できていなかった事例が、karuta#1565で発覚した。`shared/ui/createVersionJsonPlugin.js`（[`frontend-ui-conventions.md`](frontend-ui-conventions.md)「バージョン情報の外部公開」参照）でビルド後に書き出す`version.json`を、定期可視化workflowが各stageのフロントエンド配信URLから取得する。バックエンドのバージョンと分けて同じレポートへ含めることで、frontend/backend双方の不整合を早期に検知できる
- **バージョン番号は人間向けの参考情報であり、drift検知の判定根拠ではない**: canaryがstableより先行しているかの判定は、デプロイ時刻（git log・CloudFormationの`LastUpdatedTime`）に基づく。バージョン番号を一切参照しないため、上記「stable緊急修正時のhotfixブランチ切り出し元」のような番号の振られ方の違いがあっても、自動化のロジックは正しく動作する。一方、人間がレポート上のバージョン番号を見て「新しい番号＝それより古い番号の内容を全て含む」と判断するのは誤り（karuta#1558の調査で発覚）

## DynamoDBスキーマ互換性ガイドライン（expand/contract方式）

stable/canaryの2つのバックエンドコードが、自動昇格サイクル分（猶予期間の設定値）同一のDynamoDBテーブルを共有する。この間、新旧コードが同時に同じテーブルを読み書きしても壊れないよう、スキーマ変更には以下の開発規律を適用する。

- **属性の追加**: 常に安全。追加する属性は省略可能な形にし、まだ書いていない旧コードが読んだ際に欠落していても正常に動作することを確認する
- **属性の削除・リネーム**: 1リリースで行わない。以下の最低2サイクルに分ける
  1. 新しい属性名を追加し、新コードは新旧両方の属性を読めるようにする（書き込みは新属性のみでよい）
  2. 自動昇格（または管理者判断）により、新コードが完全昇格し旧コードが稼働するインスタンスが存在しなくなったことを確認する
  3. 旧属性を読むコードが存在しないことを確認したうえで、旧属性を削除する
- **GSIの追加**: 安全。既存のクエリパターンに影響しない
- **GSIの削除**: 新旧どちらのコードもそのGSIを参照しなくなってから行う。属性の削除・リネームと同様、2サイクルに分ける

### スコープ外とする変更（既知の限界）

expand/contract方式でも後方互換を保てない変更は対象外とする。

- パーティションキー・ソートキーの変更
- 属性の型を破壊的に変える移行（例: 文字列→数値で既存データの変換が必要な場合）

このような変更が必要になった場合、カナリア方式（stable/canary共存）をそのまま使うことはできない。明示的なメンテナンスウィンドウ（canaryを一時停止しstableのみでデータ移行する等）のようなアドホックな対応が必要になる。

## 導入手順

既存リポジトリへ本パターンを導入する場合、以下の順で組み込む。各ステップの詳細・コピー＆調整用のworkflowテンプレートは[`blue-green-workflow-templates.md`](blue-green-workflow-templates.md)を参照する。

1. 上記「S3 + CloudFrontの最小インフラ」「CloudFront Functionsによる重み付けルーティング」を専用の固定スタックとして構築する（共有インフラ初期デプロイワークフロー`deploy-infra.yml`を導入する）
2. 「backendの並行stageデプロイ」に沿って、backendをstageに依存しない構成へ調整する（必要な場合のみ）
3. mainマージ時に`canary_queue_pending`をセットするだけのCD変更を加える（「canaryデプロイの日次バッチ化」参照）
4. 自動昇格ワークフロー（`promote-canary.yml`）を導入する
5. 管理者ロールバック（`rollback-to-stable.yml`）・canary_weight手動変更（`set-canary-weight.yml`）を導入する
6. 運用状態の可視化ワークフロー（`canary-status.yml`）とルーティング実機検証ワークフロー（`verify-bg-routing.yml`）を導入する
7. 緊急時向けの手動per-stageデプロイワークフロー（`deploy-backend-stage.yml`・`deploy-frontend-stage.yml`）を導入する

## 参考実装

具体的なコードは[bamiyanapp/karuta](https://github.com/bamiyanapp/karuta)を参照。GitHub Actions workflow自体のコピー＆調整用テンプレートは[`blue-green-workflow-templates.md`](blue-green-workflow-templates.md)にまとめてある。

- `infra/serverless.yml`: S3+CloudFront・CloudFront Functions
- `.github/workflows/cd.yml`: canaryデプロイの日次バッチ化（キュー記録のみ）
- `docs/dynamodb-schema-compatibility-canary.md`: DynamoDBスキーマ互換性
