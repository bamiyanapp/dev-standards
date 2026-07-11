# dev-standards

複数リポジトリで共有する開発ルール・設定の共通化リポジトリ。

## 含まれるもの

- `CLAUDE.md`: Claude Codeの汎用開発ルール（ブランチ戦略・静的チェック・コードレビュー観点・コミット規約・完了条件など）
- `.clinerules/`: Cline向けルールファイル（実体はすべてCLAUDE.md・skillsを参照するポインタ）
- `.claude/skills/`: CLAUDE.mdから呼び出す共通Skill一式。新規Skillを追加した場合は本README・参照側リポジトリのシンボリックリンク双方を更新すること。
  - `development-loop` / `git-workflow` / `verifier` / `commit` / `code-review` / `git-conventions` / `safe-bash-commands`: 通常の開発ループで使用するSkill
  - `loop-triage` / `minimal-fix` / `loop-verifier` / `loop-budget`: 自律ループ（`/loop`等）実行時に使用するSkill
- `commitlint.config.cjs`: commitlint共通設定
- `release-config.cjs`: semantic-releaseの共通設定を組み立てる`buildReleaseConfig()`関数。参照側の`.releaserc.cjs`から`require`して使う（`enable_shared_release_config`入力を参照）
- `sync-manifest.json` / `scripts/bootstrap.js`: 参照側リポジトリのセットアップ（symlink作成・`.gitignore`コピー）を自動化するスクリプトと、その対象一覧を定義するマニフェスト
- `.clineignore`: Cline向け共通ignore設定
- `.gitignore`: Node.jsプロジェクトに共通するignoreパターン（依存物・ビルド出力・IDE/OSファイル・環境変数ファイルなど）
- `.claude/settings.json`: Claude Codeの共通permissions設定（機密ファイルへのReadEdit禁止、危険コマンド禁止、基本的な許可コマンドなど）
- `docs/cicd-pipeline-specification.md`: `reusable-ci.yml` / `reusable-cd.yml` が提供する共通CI/CDパイプラインの仕様（Architecture・各ワークフローの実行内容・リリース運用・同期PR運用のためのブランチ保護設定）。プロダクト固有のデプロイ手順・環境変数は対象外であり、参照側リポジトリの `docs/cicd-pipeline-specification.md` に記載する。
- `.github/workflows/reusable-ci.yml`: commitlint / frontend・backendのlint・test・build / frontendのE2Eテスト（Playwright、任意） / base_branchへの自動マージ（squash＋作業ブランチ削除）を行う reusable workflow（`workflow_call`）。バージョン計算・タグ付けは行わない（`reusable-cd.yml`側で行う）
- `.github/workflows/reusable-cd.yml`: base_branchへのpush時、base_branch上で直接semantic-releaseを実行しバージョン自動採番・CHANGELOG更新・タグ付け・GitHub Release作成を行う reusable workflow（`workflow_call`）。frontend/backendのビルド・デプロイ手順（GitHub Pages・Serverless Frameworkなど）はプロダクトごとに異なるため対象外であり、参照側リポジトリの `.github/workflows/cd.yml` に残す。
- `.releaserc.cjs` / `.github/workflows/cd.yml`: dev-standards自身も`reusable-cd.yml`を（相対パス参照で）dogfoodingし、`vX.Y.Z`形式のタグを発行する。参照側リポジトリはこのタグを`uses: ...@vX.Y.Z`で指定し、`@main`のような未固定のブランチ参照は避けること（詳細は`docs/cicd-pipeline-specification.md`の「reusable workflow参照のバージョン固定」を参照）。

## 利用方法（参照側リポジトリ）

参照側リポジトリでは本リポジトリを git submodule として取り込む。

```
git submodule add -b main https://github.com/bamiyanapp/dev-standards.git dev-standards
```

- `CLAUDE.md`: 参照側の `CLAUDE.md` 先頭で `@dev-standards/CLAUDE.md` と記述してインポートし、プロジェクト固有のルール（対象パッケージ名、CI/自動マージ構成など）のみを参照側ファイルに追記する。
- `.clinerules/*.md` ・ `.claude/skills/` 配下の**全Skill** ・ `commitlint.config.cjs` ・ `.clineignore` ・ `.claude/settings.json` ・ `.gitignore`: 下記の `scripts/bootstrap.js` を参照側リポジトリのルートで実行してセットアップする（手動でのシンボリックリンク作成・コピーは不要）。

  ```
  node dev-standards/scripts/bootstrap.js
  ```

  - `sync-manifest.json`（本リポジトリのルート）に、シンボリックリンク対象・コピー対象のファイル一覧を定義している。新規Skill追加等でこのマニフェストに変更があった場合も、参照側リポジトリで同スクリプトを再実行するだけで追従できる。
  - `--check` を付けると、実際にファイルを変更せずに欠落・リンク切れ・内容の乖離のみを検知し、問題があれば非0終了する（CIでのドリフト検知に利用可能。後述の `enable_standards_check` 入力を参照）。
  - 既存の実ファイル・ディレクトリ（シンボリックリンクではないもの）がリンク先に存在する場合は、誤って上書きしないよう検知のみ行い変更しない。
  - `.claude/settings.json` はプロジェクト固有の許可ルールを追加できないため、そのようなルールは参照側リポジトリの `.claude/settings.local.json`（Claude Codeが `settings.json` と合わせてマージする、プロジェクト固有の追加設定ファイル）に記載する。
  - `.gitignore` はGitHub側の制約によりシンボリックリンクにできない（symlink化した `.gitignore`/`.gitattributes` はsubmodule経由の攻撃に使われた前例があり、pushしようとすると `gitignoreSymlink` 警告が出る）ため、`bootstrap.js` は実体ファイルとしてコピーする。本リポジトリ側の `.gitignore` を更新した場合、参照側では自動上書きされないため（内容が意図的にカスタマイズされている可能性があるため）、`--check` で乖離を検知したうえで手動で再同期すること。プロジェクト固有のignoreエントリ（特定パッケージのビルド成果物・バックアップファイルなど）はリポジトリ直下ではなく該当パッケージ配下（例: `backend/.gitignore`）に個別に配置する。
- `docs/cicd-pipeline-specification.md`: Claude Codeの `@import` 構文で解決可能なMarkdownのため、シンボリックリンクではなく参照側リポジトリの同名ドキュメントから相対リンクで参照する。参照側には共通ドキュメントに書かれていないプロダクト固有の内容（デプロイジョブ・固有の環境変数など）のみを記載する。
- `.github/workflows/reusable-ci.yml`: 参照側の `.github/workflows/ci.yml` から `uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@main` ＋ `with:` で値を指定して呼び出す。指定できる入力は以下の通り。

  | 入力 | 説明 | デフォルト |
  |---|---|---|
  | `frontend_dir` | frontendパッケージのディレクトリ名。`packages`指定時は無視される | `frontend` |
  | `backend_dir` | backendパッケージのディレクトリ名。`packages`指定時は無視される | `backend` |
  | `packages` | frontend/backendの固定2パッケージ構成に代えて、matrix構成でlint（`npm run lint --if-present`）・test（`npm test --if-present`）・build（明示的にオプトインした場合のみ）するパッケージ一覧をJSON配列で指定する（例: `[{"dir":"frontend","build":true},{"dir":"backend"}]`。各要素は`dir`のみ必須、`build`・`node_version`・`coverage_threshold`は省略可）。指定した場合、`frontend-test`/`backend-test`固定ジョブは無効になり、代わりに`package-test`ジョブがmatrix実行される | `""`（空文字列＝既存の固定ジョブを使う） |
  | `coverage_threshold` | カバレッジ閾値（%）。0以下（既定）の場合、`vitest run --coverage`に`--coverage.reporter=json-summary`を追加して`coverage/coverage-summary.json`を生成するところまでは行うが、`.github/actions/check-coverage-threshold`（reusable-ci.ymlと同一リポジトリ内の複合アクションのため相対パス`./`で参照し、呼び出し元リポジトリに関わらずreusable-ci.yml自身と同じrefから解決される）による閾値判定・Job Summaryへの表示ステップ自体をスキップする。0より大きい値を指定するとこのステップが実行され、閾値判定とJob Summaryへの表示を行う。`packages`のmatrix構成では各要素の`coverage_threshold`で上書きできる（対象パッケージのテストコマンド自体がjson-summaryレポートを出力する設定になっている必要がある） | `0` |
  | `node_version` | frontend/backendのビルド・テストに使うNode.jsのバージョン | `20` |
  | `workspaces` | frontend/backendがnpm workspaces構成（ルート直下に単一のpackage-lock.jsonのみを持つ）かどうか。trueの場合、依存インストールをリポジトリルートで行う | `false` |
  | `enable_e2e_test` | frontendのE2Eテスト（Playwright）ジョブを実行するかどうか。実行する場合、frontend_dir配下に`test:e2e`スクリプトが必要 | `false` |
  | `enable_auto_merge` | CI（frontend-test/backend-test または package-test、frontend-e2e-test）成功後に`merge` jobでPRを自動マージするかどうか。falseの場合`merge` job自体がスキップされ、マージは人手で行う | `true` |
  | `enable_standards_check` | `sync-manifest.json`に基づき、symlink欠落・リンク切れ・`.gitignore`の内容乖離を`scripts/bootstrap.js --check`で検知する`standards-check` jobを実行するかどうか。`merge` jobは他のテストjobと同様にこのjobの成功（またはスキップ）を待つ | `false` |

  `enable_release` / `semantic_release_node_version` / `base_branch` / `enable_changelog_json` / `changelog_source_path` / `changelog_json_output_path` / `enable_shared_release_config` は非推奨（後方互換のため入力自体は残しているが、このワークフロー内では使用しない）。同名の入力を`reusable-cd.yml`側に指定すること（下記）。

  `secrets.BOT_TOKEN`（任意）を渡すと、commitlintジョブのsubmodule取得や、`merge` jobでの実際のPRマージ（squash merge API呼び出し）で利用される。
- `.github/workflows/reusable-cd.yml`: 参照側の `.github/workflows/cd.yml` から `uses: bamiyanapp/dev-standards/.github/workflows/reusable-cd.yml@main` ＋ `with:` で値を指定して呼び出す。`base_branch`へのpush時、`release` jobがbase_branch上で直接semantic-releaseを実行してバージョン自動採番・タグ付け・GitHub Release作成を行い、出力 `new_release_published` / `version` を呼び出し側のデプロイジョブの実行条件に利用できる。指定できる入力は以下の通り。

  | 入力 | 説明 | デフォルト |
  |---|---|---|
  | `enable_release` | base_branchへのpush後にsemantic-releaseを実行するかどうか。release運用をしないリポジトリはfalseを指定する | `true` |
  | `semantic_release_node_version` | semantic-releaseの実行に使うNode.jsのバージョン。semantic-release本体やプラグインがfrontend/backendより新しいNode.jsを要求することがあるため別に指定する | `lts/*` |
  | `enable_shared_release_config` | semantic-releaseの共通設定（`release-config.cjs`の`buildReleaseConfig()`）を`release` job内で参照側リポジトリへコピーするかどうか。有効にする場合、参照側の`.releaserc.cjs`を`require("./release-config.cjs").buildReleaseConfig({...})`を呼び出す構成にする必要がある（`repositoryUrl`・`gitAssets`等のプロダクト固有値のみを渡す） | `false` |
  | `enable_changelog_json` | `CHANGELOG.md`をJSON化するスクリプト（`scripts/convert-changelog-to-json.js`）をSemantic Releaseの直前にジョブ内で生成するかどうか。参照側リポジトリがこのファイルをsubmodule経由のシンボリックリンクとして持つ必要がなくなる（このジョブのcheckoutはsubmoduleを取得しないため、symlinkにすると壊れる） | `false` |
  | `changelog_source_path` | 変換元の`CHANGELOG.md`パス（リポジトリルート基準）。`enable_changelog_json: true`の場合のみ使用 | `CHANGELOG.md` |
  | `changelog_json_output_path` | 変換後のJSON出力先パス（リポジトリルート基準）。`enable_changelog_json: true`の場合のみ使用 | `frontend/src/changelog.json` |

  `secrets.BOT_TOKEN`（任意）を渡すと、`release` jobでのバージョン更新コミット・タグのpush、GitHub Release作成に利用される。**`base_branch`へのpushがCDワークフローのトリガーとなるため、`enable_release: true`で運用する場合は`BOT_TOKEN`の設定を推奨する**（`GITHUB_TOKEN`によるpushはCDをトリガーしない）。

