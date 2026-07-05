# dev-standards

複数リポジトリで共有する開発ルール・設定の共通化リポジトリ。

## 含まれるもの

- `CLAUDE.md`: Claude Codeの汎用開発ルール（ブランチ戦略・静的チェック・コードレビュー観点・コミット規約・完了条件など）
- `.clinerules/`: Cline向けルールファイル（実体はすべてCLAUDE.md・skillsを参照するポインタ）
- `.claude/skills/git-conventions/`: ブランチ命名・コミットメッセージのフォーマット規約スキル
- `.claude/skills/safe-bash-commands/`: Bashコマンドのハング・対話プロンプト回避スキル
- `commitlint.config.cjs`: commitlint共通設定
- `.clineignore`: Cline向け共通ignore設定
- `.gitignore`: Node.jsプロジェクトに共通するignoreパターン（依存物・ビルド出力・IDE/OSファイル・環境変数ファイルなど）
- `.claude/settings.json`: Claude Codeの共通permissions設定（機密ファイルへのReadEdit禁止、危険コマンド禁止、基本的な許可コマンドなど）
- `docs/cicd-pipeline-specification.md`: `reusable-ci.yml` / `reusable-cd.yml` が提供する共通CI/CDパイプラインの仕様（Architecture・各ワークフローの実行内容・リリース運用・同期PR運用のためのブランチ保護設定）。プロダクト固有のデプロイ手順・環境変数は対象外であり、参照側リポジトリの `docs/cicd-pipeline-specification.md` に記載する。
- `.github/workflows/reusable-ci.yml`: commitlint / frontend・backendのlint・test・build / frontendのE2Eテスト（Playwright、任意） / マージ前の作業ブランチ上でのsemantic-release実行・base_branchへの自動マージ（squash＋作業ブランチ削除）・タグ付け替えを行う reusable workflow（`workflow_call`）
- `.github/workflows/reusable-cd.yml`: base_branchへのpush時、HEADのタグからリリースかどうかを検知する reusable workflow（`workflow_call`）。frontend/backendのビルド・デプロイ手順（GitHub Pages・Serverless Frameworkなど）はプロダクトごとに異なるため対象外であり、参照側リポジトリの `.github/workflows/cd.yml` に残す。

## 利用方法（参照側リポジトリ）

参照側リポジトリでは本リポジトリを git submodule として取り込む。

```
git submodule add -b main https://github.com/bamiyanapp/dev-standards.git dev-standards
```

- `CLAUDE.md`: 参照側の `CLAUDE.md` 先頭で `@dev-standards/CLAUDE.md` と記述してインポートし、プロジェクト固有のルール（対象パッケージ名、CI/自動マージ構成など）のみを参照側ファイルに追記する。
- `.clinerules/*.md` ・ `.claude/skills/git-conventions/` ・ `.claude/skills/safe-bash-commands/` ・ `commitlint.config.cjs` ・ `.clineignore` ・ `.claude/settings.json`: これらはツール（Cline・commitlint・Claude Code等）が直接読み込む実ファイルであり、Claude Codeの `@import` 構文では解決されないため、参照側リポジトリの対応パスから本リポジトリ配下の実体へのシンボリックリンクとして参照する。
  - `.claude/settings.json` はプロジェクト固有の許可ルールを追加できないため、そのようなルールは参照側リポジトリの `.claude/settings.local.json`（Claude Codeが `settings.json` と合わせてマージする、プロジェクト固有の追加設定ファイル）に記載する。
- `.gitignore`: `.gitignore` はGitHub側の制約によりシンボリックリンクにできない（symlink化した `.gitignore`/`.gitattributes` はsubmodule経由の攻撃に使われた前例があり、pushしようとすると `gitignoreSymlink` 警告が出る）ため、参照側リポジトリは本ファイルの内容を実体ファイルとしてコピーし、更新時に手動で同期する。プロジェクト固有のignoreエントリ（特定パッケージのビルド成果物・バックアップファイルなど）はリポジトリ直下ではなく該当パッケージ配下（例: `backend/.gitignore`）に個別に配置する。
- `docs/cicd-pipeline-specification.md`: Claude Codeの `@import` 構文で解決可能なMarkdownのため、シンボリックリンクではなく参照側リポジトリの同名ドキュメントから相対リンクで参照する。参照側には共通ドキュメントに書かれていないプロダクト固有の内容（デプロイジョブ・固有の環境変数など）のみを記載する。
- `.github/workflows/reusable-ci.yml`: 参照側の `.github/workflows/ci.yml` から `uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@main` ＋ `with:` で値を指定して呼び出す。指定できる入力は以下の通り。

  | 入力 | 説明 | デフォルト |
  |---|---|---|
  | `frontend_dir` | frontendパッケージのディレクトリ名 | `frontend` |
  | `backend_dir` | backendパッケージのディレクトリ名 | `backend` |
  | `node_version` | frontend/backend/semantic-releaseの実行に使うNode.jsのバージョン | `20` |
  | `workspaces` | frontend/backendがnpm workspaces構成（ルート直下に単一のpackage-lock.jsonのみを持つ）かどうか。trueの場合、依存インストールをリポジトリルートで行う | `false` |
  | `enable_e2e_test` | frontendのE2Eテスト（Playwright）ジョブを実行するかどうか。実行する場合、frontend_dir配下に`test:e2e`スクリプトが必要 | `false` |
  | `enable_release` | マージ前の作業ブランチ上でsemantic-releaseを実行するかどうか。release運用をしないリポジトリはfalseを指定する | `true` |
  | `base_branch` | マージ先となるベースブランチ名 | `main` |
  | `enable_changelog_json` | `CHANGELOG.md`をJSON化するスクリプト（`scripts/convert-changelog-to-json.js`）をSemantic Releaseの直前にジョブ内で生成するかどうか。参照側リポジトリがこのファイルをsubmodule経由のシンボリックリンクとして持つ必要がなくなる（このジョブのcheckoutはsubmoduleを取得しないため、symlinkにすると壊れる） | `false` |
  | `changelog_source_path` | 変換元の`CHANGELOG.md`パス（リポジトリルート基準）。`enable_changelog_json: true`の場合のみ使用 | `CHANGELOG.md` |
  | `changelog_json_output_path` | 変換後のJSON出力先パス（リポジトリルート基準）。`enable_changelog_json: true`の場合のみ使用 | `frontend/src/changelog.json` |

  `secrets.BOT_TOKEN`（任意）を渡すと、commitlintジョブのsubmodule取得や、`merge` jobでの実際のPRマージ（squash merge API呼び出し）で利用される。**`base_branch`へのpushがCDワークフローのトリガーとなるため、`enable_release: true`で運用する場合は`BOT_TOKEN`の設定を推奨する**（`GITHUB_TOKEN`によるpushはCDをトリガーしない）。
- `.github/workflows/reusable-cd.yml`: 参照側の `.github/workflows/cd.yml` から `uses: bamiyanapp/dev-standards/.github/workflows/reusable-cd.yml@main` で呼び出す（入力パラメータなし）。`base_branch`へのpush時、HEADコミットに`vX.Y.Z`形式のタグが付いているかどうかで新規リリースを検知し、出力 `new_release_published` / `version` を呼び出し側のデプロイジョブの実行条件に利用できる。バージョン計算・タグ付け自体は`reusable-ci.yml`の`merge` jobがマージ前に完了させている。

