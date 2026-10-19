# CI/CD Pipeline Specification 過去経緯

[`cicd-pipeline-specification.md`](../cicd-pipeline-specification.md)本体をスリムにするため、現在の仕様を理解する上で必須ではない過去の失敗・教訓・検証経緯をここへ切り出している（[bamiyanapp/dev-standards#1107](https://github.com/bamiyanapp/dev-standards/issues/1107)）。

## `check-coverage-threshold`複合アクション参照方式の3段階の失敗

この複合アクションをどう参照するかについては、3段階の失敗を経て現在の実装に至っている（詳細は[bamiyanapp/karuta#583](https://github.com/bamiyanapp/karuta/issues/583)）。

| 試行 | 採用方式 | 発生した問題 | 教訓 |
|---|---|---|---|
| 失敗1 | 相対パス参照（`uses: ./.github/actions/...`） | 呼び出し元リポジトリのチェックアウト内容に解決され、参照側リポジトリでは動作しない | ステップレベルの`uses: ./path`は呼び出し元のチェックアウトに対して解決される |
| 失敗2 | 完全修飾パス＋動的ref（steps出力から`<ref>`を渡す） | `uses:`はsteps contextを参照できずstartup failureでCIが完全停止する | `uses:`は静的に解決可能な値でなければならない |
| 失敗3 | `actions/checkout`で`GITHUB_WORKFLOW_REF`からrefを導出 | 呼び出し元のトップレベルworkflow自身のrefを返すため、存在しないrefをcheckoutして失敗する | 動的な値の解決を避け、静的な固定値を使う |
| 現在の実装 | 固定タグ（例: `v1.6.1`）を`ref:`に直接指定 | （採用中） | dev-standardsの新リリースのたびに手動更新が必要になる |
| 失敗4 | 固定タグを長期間更新せず放置 | 新しい入力（`metrics`等）を古いaction.ymlが認識できず警告のみで無視され、判定が全指標平均へフォールバックする | action.ymlの入力追加時はrefの更新も同じ変更セットで行う |

- **失敗1**: 当初は相対パス（`uses: ./.github/actions/check-coverage-threshold`）で参照していた。しかし**ステップレベルの`uses: ./path`は常に呼び出し元リポジトリ（このジョブでCheckoutした対象）のチェックアウト内容に対して解決される**。reusable-ci.yml自身のrefには解決されない。そのため、dev-standards自身のdogfooding CI（呼び出し元と定義元が同一リポジトリ）でしか正しく動作しない不具合だった。`coverage_threshold`が0（既定）のジョブでは該当ステップ自体が実行されないため潜在化していた。常時実行される`frontend-e2e-test`の「Show E2E coverage」ステップで顕在化した
- **失敗2**: 参照方式を完全修飾（owner/repo/path@ref）形式に変更した。具体的には`uses: bamiyanapp/dev-standards/.github/actions/check-coverage-threshold@<ref>`という形式である。`<ref>`は直前のステップの出力（`steps.dev-standards-ref.outputs.ref`）から動的に渡す実装を一度リリースした。しかし、**`uses:`フィールドはsteps contextを参照できず、ジョブ計画時に静的に解決可能な値でなければならない**というGitHub Actionsの制約に反していた。その結果、該当ジョブが1つも作成されないまま即座に失敗した（startup failure）。失敗1よりも深刻な状態（CIが実質的に完全停止）を引き起こした
- **失敗3**: 失敗2を受け、案を切り替えた。`actions/checkout@v7`（`with:`はsteps contextを問題なく参照できる）を使う。「このワークフロー自身と同じref」のdev-standardsを`.dev-standards-actions/`へcheckoutする。`uses:`は常に静的な相対パス文字列のみにする。しかし、そのrefを`GITHUB_WORKFLOW_REF`環境変数から導出する実装も誤りだった。**`GITHUB_WORKFLOW_REF`は、このreusable workflow自身のrefを返さない**。呼び出し元（karuta等）のトップレベルワークフロー自身のref（PRのマージref`refs/pull/<PR番号>/merge`等）を返す。このため、dev-standardsに存在しないrefをcheckoutしようとして失敗した
- **現在の実装**: 動的なrefの取得を諦め、`actions/checkout@v7`の`ref:`にdev-standardsの固定タグ（例: `v1.6.1`）を直接指定する。dev-standardsの新しいリリースのたびに、この参照タグを手動で最新へ更新する必要がある。3度の失敗を踏まえた教訓: **ライブでしか検証できないGitHub Actionsの挙動について、動的な値の解決を試みるのは避け、可能な限り静的な固定値を使うこと**
- **失敗4**: 「check-coverage-threshold自体の内容が変わらない限り、多少古いタグのままでも実害はない」という想定のもと、このrefを長期間`v1.2.2`のまま更新していなかった。その間にaction.ymlへ`metrics`/`check-per-file`入力（[dev-standards#57](https://github.com/bamiyanapp/dev-standards/issues/57)）が追加された。しかし参照側（karuta等）がこれらの入力を指定しても、checkoutされる古いv1.2.2版のaction.ymlにはその入力定義が無い。このためGitHub Actionsは`Unexpected input(s) 'metrics', 'check-per-file'`という警告を出すのみで黙って無視した。その結果、絞り込みが一切効かないまま全指標・total平均のみでの判定にフォールバックしていた。これは[bamiyanapp/karuta#459](https://github.com/bamiyanapp/karuta/issues/459)でcoverage_threshold: 80を有効化した際に発覚した。教訓: **action.ymlの入力を追加・変更した場合は、このrefの更新を同じ変更セットで必ず行うこと**（「内容が変わらなければ実害はない」という前提自体が壊れやすい）

## カバレッジ計測の非決定性対策（`--no-isolate`・`--no-file-parallelism`・`--no-flush-bytecode`）

上記のref更新と同時に、`backend-test`のTestステップへ`--no-isolate`を追加した（同じくbamiyanapp/karuta#459での検証中に発覚）。`@vitest/coverage-v8`は既定（`isolate: true`）でテストファイルごとに新しいモジュールレジストリを使い対象ソースをre-importする。複数のテストファイルが同一のソースファイルをimportする構成（例: 複数のLambdaハンドラファイルが共通のヘルパー関数を1つのファイルから読み込む）がある。この構成において、カバレッジの集計が壊れることを実測で確認した。具体的には、`handler.js`単体のテストでは分岐カバレッジ97%だった。`handler.js`の一部関数を再利用する別のテストファイルが同じ実行に加わるだけで50%まで下がって計測された。実際には満たしている閾値を誤って未達と判定してしまっていた。当初は「複数ワーカーでの並列実行が原因」という誤った仮説を立てた。`--no-file-parallelism`（ファイル単位の並列実行を無効化するだけ）を試したが、これでは直らなかった。真因は`isolate`によるモジュールレジストリの非共有だった。`--no-isolate`で全テストファイルが同じモジュールレジストリを共有するようにしたところ、正しい数値（84%程度）に戻ることを確認した。

その後、`backend-test`のTestステップへ`--no-file-parallelism`も追加した。対応の詳細は[bamiyanapp/Electric-Chair-Arena#253](https://github.com/bamiyanapp/Electric-Chair-Arena/pull/253)・[dev-standards#307](https://github.com/bamiyanapp/dev-standards/issues/307)を参照。上記の失敗4の教訓とは別の問題がある。`coverage_check_per_file`（issue #57）でファイル単位のカバレッジをゲートする構成がある。この構成において、同一ソースファイルの関数カバレッジがテスト実行のたびに異なる値になる現象を確認した。複数のテストファイルが既定でワーカープロセスに分散実行され、同一ソースのV8カバレッジをプロセス間でマージする際に非決定性が生じると推測される。その結果、実際には直接・決定的なユニットテストが存在する関数まで偶発的に未カバー扱いとなり、閾値未達でCIが失敗することがあった。デフォルト設定（複数ワーカープロセスに分散）では同一の全テストスイートを繰り返し実行しても毎回異なる関数集合が未カバーと計測された。`--no-file-parallelism`で全テストファイルを単一プロセス・単一V8インスタンスに固定したところ、3回連続で完全に同一のカバレッジ値が再現し決定的になることを確認した。上記の失敗4で「`--no-file-parallelism`は本質的な解決にならず」と判断したのは、モジュールレジストリの非共有によるカバレッジ集計崩れに対してである。本項目（プロセス間マージの非決定性）とは別の問題である点に注意（同じフラグでも解消する問題が異なる）。実行時間は伸びるが、正確な計測を優先する。

それでもなお`dev-standards#307`が実CI（Electric-Chair-Arena PR #258）で再発した。V8には「bytecode flushing」という挙動がある（メモリ節約のため、しばらく呼ばれていない関数のbytecodeを自動破棄し次回呼び出し時に再コンパイルする）。これを無効化する`--no-flush-bytecode`フラグを追加した。当初`NODE_OPTIONS`環境変数へ設定する形でリリースした（PR #347）。しかし**`--no-flush-bytecode`はNode.jsがNODE_OPTIONS経由での設定自体を許可しないV8フラグ**だった。そのため`node: --no-flush-bytecode is not allowed in NODE_OPTIONS`（exit code 9）でテストが1件も実行されなかった。backend-test全体が即座に壊れることが実CI（Electric-Chair-Arena PR #269）で判明した。リリース前にローカル検証していなかったための見落としである。同じフラグをNODE_OPTIONSではなく`node`本体への直接のCLI引数として渡す形に修正した（`dev-standards#307`）。具体的には`npx -c 'node --no-flush-bytecode "$(command -v vitest)" run ...'`という形を取る。`npx -c`でnpxに`node_modules/.bin`を含むPATH解決をさせる。その上で実パスを取得することで、npm workspacesの有無によるhoisting階層差を吸収している。

## `check-coverage-threshold`の2回試行パターンを追加した理由

あわせて、「Check coverage threshold」ステップにもTestステップと同様のattempt 1/2・2/2パターンを追加した。これは上記の各種対策を講じてもなおV8のカバレッジ計測が実行のたびに変動する非決定性が実CIで解消しきらない場合に備えたものである。テスト自体は毎回全件成功し、カバレッジ計測値だけが偶発的に振れる性質のためである。1回目のカバレッジ判定が閾値未達だった場合はテストを再実行して計測をやり直し、改めて判定する。

## `commitlint`でPRタイトルも検証するようになった経緯

`merge` jobはPRをsquash mergeする際、コミットタイトルを明示的に指定していない。`github.rest.pulls.merge`呼び出しに`commit_title`/`commit_message`を渡していない。このためGitHubはデフォルトでPRタイトルをそのままmainに残る唯一のコミットの件名にする。かつて`Validate PR commits`（PR内の個々のコミットメッセージ）だけを検証していた。そのときは、PRタイトル自体がConventional Commits形式（単一の有効なtype）に反していても素通りしていた。実際に、PRタイトルで複数のtypeを`/`で連結する（例:`fix/feat: ...`）ケースがあった。このケースではsquash merge後のcommit-analyzerがtypeを認識できずリリースが生成されない問題が発生した（[bamiyanapp/karuta#722](https://github.com/bamiyanapp/karuta/issues/722)）。`Validate PR title`ステップの追加により、この種の不整合は個々のコミット内容に関わらずマージ前のゲートで検知できるようになった。

## `commitlint`の`npm ci`失敗を`infra_failure`から除外した経緯

かつては`npm ci`の失敗も一律`infra_failure=true`としていた。しかし`bamiyanapp/karuta#639`由来のロックファイル不整合がCI完了を待たない手動マージにより素通りした。その結果、CD側の`release` jobでのみ`npm ci`が失敗し続けるという事例が発生したため区別した。

## `run-name`にイベント種別を明示するようになった経緯

既定のrun-name（ワークフロー名のみ、または`workflow_run`トリガー時はトリガー元のコミットSHA）はGitHub ActionsのRun一覧上で実行内容が分からない。特にスマートフォンのブラウザでActionsタブを確認する運用（CLAUDE.md「開発環境の制約（スマホオンリー）」参照）を考える。この運用では、どの変更に対応するCD実行かひと目で判別できない問題があった（[bamiyanapp/uchi-stock#337](https://github.com/bamiyanapp/uchi-stock/issues/337)）。

## `BOT_TOKEN`直接pushのbypass問題の実機検証経緯

まず`BOT_TOKEN`で`base_branch`へ直接pushを試みる。参照側リポジトリが`base_branch`にブランチ保護ルール（GitHub Rulesets等、「Changes must be made through a pull request」）を設定している場合を考える。この場合、直接pushは`GH013: Repository rule violations`で拒否される。karuta実機検証で、Rulesetのbypass listへRepository adminロールを追加し、`BOT_TOKEN`をclassic PAT（全スコープ、対象アカウントはRepository admin）へ差し替えても解消しないことを複数パターンで確認した。一方、同アカウントでのGitHub Web UI直接コミットは成功した。そのため、Ruleset側のbypass設定自体は機能している。GitHub Actions経由の生のgit push（HTTPS smart protocol）に対してはbypass actorsが正しく評価されない挙動が実機で確認された。

## semantic-releaseを`base_branch`へのpush後に実行する方式への変更経緯

以前は PR の作業ブランチ上でマージ前に `semantic-release` を実行する方式だった。しかし、`pull_request` イベントで GitHub Actions が自動設定する `GITHUB_REF`/`GITHUB_REF_NAME` は `refs/pull/<PR番号>/merge` に固定されている。ワークフローYAMLの `env:` では上書きできない（GitHub Actionsの予約変数のため）。そのため semantic-release のブランチ判定が常に `refs/pull/<PR番号>/merge` を見てしまい、「対象ブランチと一致しないため公開しない」と判定されて新バージョンが一切発行されない状態になっていた（各ジョブ自体は成功扱いになるため発覚しにくい）。
