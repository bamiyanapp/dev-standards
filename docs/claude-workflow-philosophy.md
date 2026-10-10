# Claudeの永続化方針・Issue/PRの考え方（初学者向け入口）

本ドキュメントは、Claude Codeが本リポジトリ群でなぜこのように動くのかを、初めて触れる人向けに俯瞰する入口である。各ルールの具体的な手順・コマンドはCLAUDE.md・各Skillを正本とし、本ドキュメントには重複記載しない。

## なぜ「残したいものは全てIssue化する」のか

Claudeは会話の外に状態を持たない。1つの作業セッションが終わると、そのセッション内で得た気づき・判断・途中経過は原則として消える。次に別のセッションが同じリポジトリを触るとき、過去の会話内容を直接参照できない。

このため、セッションを越えて残したい情報は、会話の中だけに留めず、必ずGitHub Issueという形で書き出す。Issueはリポジトリに紐づく永続的な記録であり、次のセッション（別のClaude、あるいは人間）がいつでも読み返せる。これが[`CLAUDE.md`](../CLAUDE.md)「Issue駆動の原則」の背景である。

- コード変更を伴う作業は、必ず対応するIssueに基づいて進める
- 対応するIssueが無ければ、着手前にまず起票する
- 口頭指示だけで既存Issueへの言及が無い場合も同様に、着手前に起票する

「とりあえず直してから後でIssue化する」のではなく、「Issue化してから直す」という順序を徹底している。これは、途中でセッションが中断しても、Issueというかたちで意図が残るようにするためである。

## なぜ「変更は必ずPRとして出す」のか

Claudeがベースブランチへ直接コミットを反映することはない。変更は常にPull Requestというかたちでアウトプットする。これには2つの意味がある。

1. **差分としてレビュー可能な単位にする**: PRはコミットの集合に対して、変更理由・影響範囲をまとめて提示する単位である。Issueが「何をなぜやるか」を記録するのに対し、PRは「実際に何を変えたか」を記録する
2. **承認・マージの最終判断を人間に委ねる**: Claudeは`gh pr review --approve`等によるPRの承認、`gh pr merge`等によるマージを一切行わない（[`CLAUDE.md`](../CLAUDE.md)「PR（MR）承認・マージ禁止」）。CIが全て成功することを確認したうえでPRを作成・更新するところまでがClaudeの役割であり、その先の最終判断（または自動マージの仕組みに委ねる判断）は人間が持つ

具体的なブランチ作成・コミット・PR作成の手順は[git-workflow Skill](../.claude/skills/git-workflow/SKILL.md)、コミットメッセージ・ブランチ命名のフォーマットは[git-conventions Skill](../.claude/skills/git-conventions/SKILL.md)、コミット前の確認事項は[commit Skill](../.claude/skills/commit/SKILL.md)を参照する。

## なぜIssueにラベルを付けるのか

Issueには種別ラベル（`bug`/`enhancement`/`documentation`等）と重要度ラベル（`priority: high`/`priority: medium`/`priority: low`）を必ず付与する（[`CLAUDE.md`](../CLAUDE.md)「Issue駆動の原則」）。

Issueは起票するだけでは「積まれているだけの箱」になりやすい。ラベルは、後から見返したときに「これは何の作業か」「どれくらい急ぐべきか」を構造化し、トリアージ（優先順位付け）を可能にするための最小限の情報である。ラベルが欠けたIssueに基づいて作業を開始してはならないというルールは、着手前にこの構造化を必ず済ませることを強制するためのものである。

## 全体のループ（Observe→Plan→Act→Verify→Reflect）

上記の原則は、個別の規則としてではなく、1つの継続的なループの一部として機能する。詳細は[`CLAUDE.md`](../CLAUDE.md)「Agent Principle」「Execution Loop」、具体的な実行手順は[development-loop Skill](../.claude/skills/development-loop/SKILL.md)を参照する。

- 現状を観測し（Observe）、Issueとして記録された課題との差分を確認する（Plan）
- 実装・テストを行い（Act）、[verifier Skill](../.claude/skills/verifier/SKILL.md)で品質を確認する（Verify）
- 完了前に[`CLAUDE.md`](../CLAUDE.md)「Reflection」のチェック項目を確認し、新たな知見があればSkill・CLAUDE.md・新規Issueへ反映する（Reflect）

Reflectで得られた知見が「このIssueの対応では直さないが、別途対応すべきこと」であれば、その場で直さず新規Issueとして起票する。これも「残したいものはIssue化する」という原則の一形態である。
