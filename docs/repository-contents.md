# このリポジトリに含まれるもの

`dev-standards`リポジトリ直下・`.github/`配下に含まれる各ファイル・ディレクトリの一覧。個別の使い方は各項目からリンクする詳細ドキュメントを参照する。

- `CLAUDE.md`: Claude Codeの汎用開発ルール（ブランチ戦略・静的チェック・コードレビュー観点・コミット規約・完了条件など）
- `.clinerules/`: Cline向けルールファイル（実体はすべてCLAUDE.md・skillsを参照するポインタ）
- `.claude/skills/`: CLAUDE.mdから呼び出す共通Skill一式。新規Skillを追加した場合は本ファイル・参照側リポジトリのシンボリックリンク双方を更新すること。
  - 通常の開発ループで使用するSkillは以下である。`development-loop` / `git-workflow` / `verifier` / `commit`である。加えて`code-review` / `git-conventions` / `safe-bash-commands`もそうである
  - `loop-triage` / `minimal-fix` / `loop-verifier` / `loop-budget`: 自律ループ（`/loop`等）実行時に使用するSkill
- `commitlint.config.cjs`: commitlint共通設定
- `release-config.cjs`: semantic-releaseの共通設定を組み立てる`buildReleaseConfig()`関数。参照側の`.releaserc.cjs`から`require`して使う。詳細は`enable_shared_release_config`入力を参照（`docs/reusable-workflows-reference.md`）
- `sync-manifest.json` / `scripts/bootstrap.js`: 参照側リポジトリのセットアップ（symlink作成・`.gitignore`コピー）を自動化するスクリプトである。対象一覧を定義するマニフェストと合わせて使う（`docs/reusable-workflows-reference.md`「参照側リポジトリでの導入」参照）
- `.clineignore`: Cline向け共通ignore設定
- `.gitignore`: Node.jsプロジェクトに共通するignoreパターン（依存物・ビルド出力・IDE/OSファイル・環境変数ファイルなど）
- `.claude/settings.json`: Claude Codeの共通permissions設定（機密ファイルへのReadEdit禁止、危険コマンド禁止、基本的な許可コマンドなど）
- `docs/cicd-pipeline-specification.md`が本体である。`reusable-ci.yml` / `reusable-cd.yml` が提供する共通CI/CDパイプラインの仕様を記す。Architecture・各ワークフローの実行内容・リリース運用・同期PR運用のためのブランチ保護設定を扱う。プロダクト固有のデプロイ手順・環境変数は対象外であり、参照側リポジトリの `docs/cicd-pipeline-specification.md` に記載する。
- `.github/workflows/reusable-ci.yml`: commitlint / frontend・backendのlint・test・buildを行う。frontendのE2Eテスト（Playwright、任意）も行う。base_branchへの自動マージ（squash＋作業ブランチ削除）も行う reusable workflow（`workflow_call`）。バージョン計算・タグ付けは行わない（`reusable-cd.yml`側で行う）
- `.github/workflows/reusable-cd.yml`: base_branchへのpush時、base_branch上で直接semantic-releaseを実行する。バージョン自動採番・CHANGELOG更新・タグ付けを行う。GitHub Releaseも作成する reusable workflow（`workflow_call`）。frontend/backendのビルド・デプロイ手順（GitHub Pages・Serverless Frameworkなど）はプロダクトごとに異なるため対象外である。参照側リポジトリの `.github/workflows/cd.yml` に残す。
- `.releaserc.cjs` / `.github/workflows/cd.yml`が対象である。dev-standards自身も`reusable-cd.yml`を（相対パス参照で）dogfoodingする。`vX.Y.Z`形式のタグを発行する。参照側リポジトリはこのタグを`uses: ...@vX.Y.Z`で指定する。`@main`のような未固定のブランチ参照は避けること。詳細は`docs/cicd-pipeline-specification.md`の「reusable workflow参照のバージョン固定」を参照。
- `.github/actions/deploy-github-pages/`: Node.jsプロジェクトのビルド〜GitHub Pagesデプロイを共通化した複合actionである。手順はsetup-node→npm ci→build→upload-pages-artifact→deploy-pagesである。参照側の`.github/workflows/cd.yml`から呼び出す。`uses: bamiyanapp/dev-standards/.github/actions/deploy-github-pages@v1.0.0`＋`with:`を指定する。`with:`の内容は`working-directory`・`node-version`・`build-command`・`artifact-path`・`workspaces`。`workspaces`は任意で、npm workspaces構成の場合にtrueにすると依存インストールをリポジトリルートで行う。`@main`のような未固定のブランチ参照は避け、タグで固定すること。呼び出し側ジョブ自体には`environment: { name: github-pages }`の指定が引き続き必要である。`permissions: { pages: write, id-token: write }`の指定も引き続き必要である。複合actionからはjob単位の設定ができないためである。
- `.github/workflows/reusable-codeql.yml`: CodeQLで静的解析する reusable workflow（`workflow_call`）である。結果のSARIFはGitHub Securityタブへアップロードする。`reusable-ci.yml`のジョブ群とは独立しており、`merge` jobのゲートには関与しない。`schedule`トリガーは参照側の`.github/workflows/codeql.yml`側で設定する。
- `.github/actions/render-mermaid-diagrams/`: Markdown中の```` ```mermaid ```` ブロックを対象とする複合actionである。`@mermaid-js/mermaid-cli`でPNG画像へ事前レンダリングする。`reusable-ci.yml`の`render-mermaid-diagrams` job（`enable_mermaid_render`入力）から利用する。
