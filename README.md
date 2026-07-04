# dev-standards

複数リポジトリで共有する開発ルール・設定の共通化リポジトリ。

## 含まれるもの

- `CLAUDE.md`: Claude Codeの汎用開発ルール（ブランチ戦略・静的チェック・コードレビュー観点・コミット規約・完了条件など）
- `.clinerules/`: Cline向けルールファイル（実体はすべてCLAUDE.md・skillsを参照するポインタ）
- `.claude/skills/git-conventions/`: ブランチ命名・コミットメッセージのフォーマット規約スキル
- `.claude/skills/safe-bash-commands/`: Bashコマンドのハング・対話プロンプト回避スキル
- `commitlint.config.cjs`: commitlint共通設定
- `.clineignore`: Cline向け共通ignore設定

## 利用方法（参照側リポジトリ）

参照側リポジトリでは本リポジトリを git submodule として取り込む。

```
git submodule add -b claude/dev-standards-setup-spnjdf https://github.com/bamiyanapp/dev-standards.git dev-standards
```

- `CLAUDE.md`: 参照側の `CLAUDE.md` 先頭で `@dev-standards/CLAUDE.md` と記述してインポートし、プロジェクト固有のルール（対象パッケージ名、CI/自動マージ構成など）のみを参照側ファイルに追記する。
- `.clinerules/*.md` ・ `.claude/skills/git-conventions/` ・ `.claude/skills/safe-bash-commands/` ・ `commitlint.config.cjs` ・ `.clineignore`: これらはツール（Cline・commitlint等）が直接読み込む実ファイルであり、Claude Codeの `@import` 構文では解決されないため、参照側リポジトリの対応パスから本リポジトリ配下の実体へのシンボリックリンクとして参照する。

