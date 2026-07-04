# dev-standards

複数リポジトリで共有する開発ルール・設定の共通化リポジトリ。

## 含まれるもの

- `CLAUDE.md`: Claude Codeの汎用開発ルール（ブランチ戦略・静的チェック・コードレビュー観点・コミット規約・完了条件など）
- `.clinerules/`: Cline向けルールファイル（実体はすべてCLAUDE.md・skillsを参照するポインタ）
- `.claude/skills/git-conventions/`: ブランチ命名・コミットメッセージのフォーマット規約スキル
- `.claude/skills/safe-bash-commands/`: Bashコマンドのハング・対話プロンプト回避スキル
- `commitlint.config.cjs`: commitlint共通設定
- `.clineignore`: Cline向け共通ignore設定
- `.github/workflows/reusable-ci.yml`: commitlint / frontend・backendのlint・test・build / CIジョブ成功時の自動マージ（squash＋作業ブランチ削除） / release→baseブランチの同期を行う reusable workflow（`workflow_call`）
- `.github/workflows/reusable-cd.yml`: base_branch→release_branchの同期 / semantic-releaseの実行 / release_branch→base_branchの同期PR作成・自動マージを行う reusable workflow（`workflow_call`）。frontend/backendのビルド・デプロイ手順（GitHub Pages・Serverless Frameworkなど）はプロダクトごとに異なるため対象外であり、参照側リポジトリの `.github/workflows/cd.yml` に残す。

## 利用方法（参照側リポジトリ）

参照側リポジトリでは本リポジトリを git submodule として取り込む。

```
git submodule add -b main https://github.com/bamiyanapp/dev-standards.git dev-standards
```

- `CLAUDE.md`: 参照側の `CLAUDE.md` 先頭で `@dev-standards/CLAUDE.md` と記述してインポートし、プロジェクト固有のルール（対象パッケージ名、CI/自動マージ構成など）のみを参照側ファイルに追記する。
- `.clinerules/*.md` ・ `.claude/skills/git-conventions/` ・ `.claude/skills/safe-bash-commands/` ・ `commitlint.config.cjs` ・ `.clineignore`: これらはツール（Cline・commitlint等）が直接読み込む実ファイルであり、Claude Codeの `@import` 構文では解決されないため、参照側リポジトリの対応パスから本リポジトリ配下の実体へのシンボリックリンクとして参照する。
- `.github/workflows/reusable-ci.yml`: 参照側の `.github/workflows/ci.yml` から `uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@main` ＋ `with:` で値を指定して呼び出す。指定できる入力は以下の通り。

  | 入力 | 説明 | デフォルト |
  |---|---|---|
  | `frontend_dir` | frontendパッケージのディレクトリ名 | `frontend` |
  | `backend_dir` | backendパッケージのディレクトリ名 | `backend` |
  | `base_branch` | リリース同期元となるベースブランチ名 | `main` |
  | `release_branch` | リリースブランチ名 | `release` |
  | `sync_branch_prefix` | release→base_branch同期PRのブランチ名prefix | `sync/release-to-main` |
  | `merge_ours_paths` | release→base_branch同期時にmerge=oursで扱うファイルパス（改行区切りで複数指定可） | `""` |

  `secrets.BOT_TOKEN`（任意）を渡すと、commitlintジョブのsubmodule取得やsync-releaseジョブのpushで利用される。
- `.github/workflows/reusable-cd.yml`: 参照側の `.github/workflows/cd.yml` から `uses: bamiyanapp/dev-standards/.github/workflows/reusable-cd.yml@main` ＋ `with:` で値を指定して呼び出す。指定できる入力は以下の通り。

  | 入力 | 説明 | デフォルト |
  |---|---|---|
  | `node_version` | semantic-releaseの実行に使うNode.jsのバージョン | `lts/*` |
  | `base_branch` | リリース同期元となるベースブランチ名 | `main` |
  | `release_branch` | リリースブランチ名 | `release` |
  | `sync_branch_prefix` | release_branch→base_branch同期PRのブランチ名prefix | `sync/release-to-main` |
  | `merge_ours_paths` | base_branch→release_branch同期時にmerge=oursで扱うファイルパス（改行区切りで複数指定可） | `""` |

  `secrets.BOT_TOKEN`（任意）を渡すと、release_branchへのpushやsync PRの作成・自動マージで利用される。出力 `new_release_published`（semantic-releaseが新バージョンを発行したかどうか）を呼び出し側のデプロイジョブの実行条件に利用できる。

