# AI駆動アプリ開発カリキュラム（アイデア→アプリ化→構成リファクタリング→モダナイズ）

何を作るか決まっていないアイデアを固め、Claude Codeとの対話でアプリとして動かし、ある程度形になった段階で構成を見直し、その後CI/CD・テスト・lint等の技術的な品質基準を適用して育てていく、4段階の進め方をまとめる。karuta等の実プロダクトが実際にこの順番で育った。構成の見直し（設計判断）とモダナイズ（品質基準の適用）は性質が異なるため、別フェーズとして扱う。

dev-standardsには2種類の内容が含まれており、本カリキュラムではこれらを区別する。

- **開発プロセス自体の手順（`.claude/skills/`配下のSkill）**: [`git-workflow`](../.claude/skills/git-workflow/SKILL.md)・[`commit`](../.claude/skills/commit/SKILL.md)・[`git-conventions`](../.claude/skills/git-conventions/SKILL.md)・[`code-review`](../.claude/skills/code-review/SKILL.md)・[`safe-bash-commands`](../.claude/skills/safe-bash-commands/SKILL.md)等。それぞれブランチ運用・コミット前提条件・コミットメッセージ規約・自己レビュー観点・安全なコマンド実行を扱う。プロダクトの成熟度に関わらず**フェーズ2から常に頼る**
- **最小限のCI・自動マージ基盤**: 本カリキュラムの想定ユーザーはコードを読まずに進めるため、人間によるPRレビューの余地が無い。CI通過が実質的な唯一のレビュー機構であるため、**フェーズ2から自動マージ（`enable_auto_merge`）を有効化する**。lint厳格化・カバレッジ閾値等の品質基準そのものの厳格化は含まない
- **技術的なモダナイズ観点**: テストカバレッジ閾値・lint厳格化・依存リスク判定等。アプリの完成度に応じて段階的に適用するため、**フェーズ4まで後回しにしてよい**

dev-standards全体が提供する内容の一覧は[`README.md`](../README.md)「ドキュメント目次」を参照する。

## 本ドキュメントの位置づけ

[`standard-tech-stack.md`](standard-tech-stack.md)は「技術構成の索引・組み立て手順」であり、採用する技術が既に決まっている前提で参照する。本ドキュメントは「決まっていない段階から、どういう順番で進めるか」というカリキュラムであり、同ドキュメントより前の段階、かつフェーズ3で同ドキュメントを実際に参照しに行くまでの橋渡しを担う。両ドキュメントの内容は重複させない。

## フェーズ0: 環境準備チェックリスト

本カリキュラムは、スマートフォンのみでClaude Code on the webを使って進める前提で書く（CLAUDE.md「開発環境の制約（スマホオンリー）」）。ターミナル（CLI）・デスクトップアプリで進める場合も内容自体は同じだが、以降の手順説明はスマートフォン＋Claude Code on the webを前提に記述する。

| 項目 | 内容 |
|---|---|
| GitHubアカウント・新規リポジトリ | アイデアごとに1リポジトリを作る（既存プロダクトへの機能追加ではなく、新規アイデアを試す場合）。作成方法は[GitHub公式のクイックスタート](https://docs.github.com/en/repositories/creating-and-managing-repositories/quickstart-for-repositories)を参照 |
| Claude Code on the webの利用環境 | スマートフォンのブラウザからclaude.ai/codeを開き、上記GitHubリポジトリを対象にセッションを開始できる状態にしておく。利用方法は[Claude Code on the web公式クイックスタート](https://code.claude.com/docs/en/web-quickstart)を参照 |
| AWSアカウント・認証情報 | フェーズ2は最も簡単な配信先（GitHub Pages等）で足りるため、この段階では不要。バックエンドAPIが最初から必要と分かっている場合、またはフェーズ3で技術選定を見直した場合に、AWSアカウントとGitHub Secrets（`AWS_ACCESS_KEY_ID`・`AWS_SECRET_ACCESS_KEY`）を準備する。アクセスキーの作成方法は[AWS公式のIAMアクセスキー管理ガイド](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)を参照 |
| 費用の目安 | Claude Codeは最初はProプランで十分である。月次払いは$20/月、年次払いは$200/年（月あたり約$17相当）が目安（2026年時点、変動するため[claude.com/pricing](https://claude.com/pricing)で最新を確認する）。AWS側は、個人の試作程度のアクセス量であればS3 + CloudFront・Lambda等は無料利用枠内、または月あたり数百円程度に収まることが多い。アクセスが増えた場合やPollyの音声合成等、課金が大きくなりうる機能を使う場合は、AWSの料金ページで事前に確認する |

dev-standardsの取り込み（`git submodule add`・`bootstrap.js`実行・`CLAUDE.md`作成）はユーザーが準備する項目ではなく、**Claudeへ最初のプロンプトで依頼する作業**である。詳細は後述の「最初のプロンプトの例」を参照。この作業はClaude Code on the webのセッション（Claudeの仮想環境）内で完結し、スマートフォン側で何かを操作する必要は無い。また、dev-standardsは公開リポジトリであり`git submodule add`は読み取り専用のcloneにすぎないため、dev-standards自体への書き込み権限・フォークは一切不要である（書き込み権限が必要なのは、ユーザー自身が新規に作成したリポジトリ側のみ）。

## フェーズ1: アイデアを決める

「誰が」「何をするための」アプリかを1〜2文で言える状態にする（最初のプロンプトでそのまま使う）。既に決まっている場合は本フェーズをスキップし、フェーズ2へ進んでよい。技術選定はこの段階では不要である。

決まっていない場合、以下のプロンプト例を使い、アイデア出し自体をClaudeとの対話で進める。

### プロンプトの例

```
アプリを作ってみたいが、何を作るかまだ決まっていない。

- 私の興味・困りごとは次の通り: 〈趣味、仕事での悩み、日常の不満等を
  思いつくまま書く〉
- 技術的な実現性は気にしなくていい。候補を3つ程度、それぞれ1〜2文で
  提案してほしい
- 候補ごとに、想定ユーザーとやりたいことを明確にしてほしい

提案を見てから1つ選ぶので、まずは候補の提案だけしてほしい。
```

候補を見て1つに絞ったら、フェーズ2の最初のプロンプト（後述）の「想定ユーザー」「やりたいこと」へそのまま使う。

## フェーズ2: アイデアをアプリにする

### 進め方

1. リポジトリを作り、Claude Code on the webのセッションを開始する。最初のプロンプト（後述の例を参照）で、dev-standardsの取り込み（`git submodule add`・`bootstrap.js`実行・`CLAUDE.md`作成）をClaudeへ依頼する。これにより[`git-workflow`](../.claude/skills/git-workflow/SKILL.md)・[`commit`](../.claude/skills/commit/SKILL.md)等のSkillがフェーズ2から使える状態になる
2. **最小限のCIと自動マージを導入する**。`.github/workflows/ci.yml`が`reusable-ci.yml`を呼び出すだけでよく、lint厳格化・カバレッジ閾値等の品質基準そのものの厳格化はまだ行わない。`enable_auto_merge`（既定で有効）によりPRはCI通過後に自動マージされる。加えて、GitHub Settingsのブランチ保護ルールで必須ジョブ（`commitlint`等）をRequired status checksとして指定する（これを設定しないと、CI完了を待たずにマージされてしまうケースを防げない）。コードを人間が読まずに進める運用のため、CI通過がPRに対する実質的な唯一のレビューになる。詳細は[`cicd-pipeline-specification.md`](cicd-pipeline-specification.md)を参照
3. **最小限の内容（画面が1枚表示されるだけでよい）を、先にリモート環境へデプロイする**。この時点ではAWSアカウント等を用意せず、GitHub Pages等、最も簡単に用意できる配信先を選ぶ。具体的な設定手順は汎用的なGitHub操作のため、このドキュメントには書かず、Claude Codeとのセッション内で「どう進めればよいか」を相談しながら対話的に進めてもらう。目的は「実際のURLがスマートフォンのブラウザで開ける」状態を作ることであり、配信先自体の良し悪しは問わない。S3 + CloudFront（[`static-hosting-pattern.md`](static-hosting-pattern.md)）等への移行は、フェーズ3の技術選定見直しで必要に応じて検討する。以降のステップは、ローカルではなくこのURLへの反映を都度確認しながら進める
4. アイデアをそのままClaude Codeへ伝え、最小限の画面・機能を一気に作ってもらう（後述のプロンプト例を参照）。ブランチ運用・コミットは[`git-workflow`](../.claude/skills/git-workflow/SKILL.md)/[`commit`](../.claude/skills/commit/SKILL.md)/[`git-conventions`](../.claude/skills/git-conventions/SKILL.md) Skillに従って進む
5. 実装してもらったら、手順3のURLへ反映した上で実際にスマートフォンのブラウザで開いて触り、違和感のある部分を言葉で伝えて直してもらう。デプロイ前の実装内容を確認したい場合は、スクリーンショットで提示してもらう（スマートフォンの画面からはローカルで動かしたものが見えないため）。カバレッジ閾値・lint厳格化等の技術的なモダナイズ観点はこの段階では要求しない
6. 「人に見せられる」最小限の状態になったら、フェーズ3へ進む判断をする

### 最初のプロンプトの例

以下はアイデアを最速で動く形にするための最初の1投目の例。アプリの種類に応じて書き換える。

```
〈アプリのアイデア〉を試してみたい。

- 想定ユーザー: 〈誰が使うか〉
- やりたいこと: 〈何をするためのアプリか、1〜2文〉
- 今はこのアイデアが本当に良いか確かめたいだけなので、テストカバレッジ閾値・
  lintの厳格化等の技術的なモダナイズは一切考えなくていい。最速で作ってほしい
- 技術選定も今はミニマムでいい（例: ログイン無し、フロントエンドはGitHub Pages等
  の最も簡単な配信先）。最終形はまだ誰にも分からないので、後から変わる前提で
  一番簡単な構成を選んでほしい。ログイン追加やAWSへの移行等が必要になったら、
  アプリの方向性が固まった段階（フェーズ3）で見直す
- その前に、まずbamiyanapp/dev-standardsをgit submoduleとして取り込み、
  node dev-standards/scripts/bootstrap.jsを実行してほしい。CLAUDE.mdを作成し、
  先頭で@dev-standards/CLAUDE.mdをインポートしてほしい
- 私はコードを読まずに進めるので、PRを人間がレビューする前提ではなく、
  最小限のCI（ci.ymlがreusable-ci.ymlを呼び出す）と自動マージを今の時点で
  設定してほしい。GitHub Settingsのブランチ保護ルールで必須ジョブをRequired
  status checksとして指定することも含めてほしい。lintの厳格化・カバレッジ
  閾値の設定自体はまだしなくていい
- 私はスマートフォンからしか確認できない。実装したら毎回リモート環境へ反映して、
  URLを教えてほしい。反映前に見せたい内容がある場合はスクリーンショットで示してほしい
- ブランチ運用・コミットはdev-standardsのSkill（git-workflow・commit・
  git-conventions）にそのまま従ってほしい。コードの変更を伴う作業は、着手前に
  GitHub issueを起票してから進めてほしい
- 画面・機能は最小限でいい。「動くものを触って確認する」ことだけが目的

まず簡単な実装方針を示してから、実装してほしい。
```

このプロンプトの要点は5つある。dev-standardsの取り込み（Claude側の作業）と開発プロセス自体（ブランチ運用・コミット規約・issue起票）は最初から外さないこと。コードを読まずに進める運用のため、最小限のCI・自動マージ・ブランチ保護設定だけはフェーズ2から導入すること。確認手段をスマートフォンで実際に使える形（実機のURL・スクリーンショット）に限定すること。「最速で動くもの」を優先させること。そして技術選定自体もミニマムにとどめ、最終形が決まった段階（フェーズ3）で見直す前提にすることである。後回しにしてよいのは、カバレッジ閾値・lint厳格化等の品質基準そのものの厳格化のみであり、dev-standardsの取り込み・開発プロセス自体（CI・自動マージ基盤を含む）・確認手段は例外扱いにはしない。

## フェーズ3: 構成のリファクタリング

アプリの方向性が固まったら、フェーズ2のミニマムな構成（ログイン無し、最も簡単な配信先等）を見直し、必要な技術要素を本来の構成へ移行する。dev-standardsの取り込み自体はフェーズ2で既に済んでいるため、本フェーズは設計判断とその反映のみを扱う。

### 進め方

1. **技術選定を見直す**。[`standard-tech-stack.md`](standard-tech-stack.md)「選定の考え方」に沿って、ログイン・バックエンドAPI・PWA等の要否を改めて判断する。判断が変わった要素（例: ログインを追加する、フロントエンドをGitHub PagesからS3 + CloudFrontへ移行する）を洗い出す
2. 洗い出した要素ごとにissueを起票してから進める
3. [`standard-tech-stack.md`](standard-tech-stack.md)「新規プロジェクトの立ち上げ手順」の手順2以降を、手順1で洗い出した見直し内容を反映しつつ、フェーズ2で作った画面・機能に後から当てはめる形で適用する
4. 移行後も既存の画面・機能が同じように動くことを確認する。テストカバレッジ等の品質基準の厳格化はフェーズ4で扱うため、本フェーズでは構成の移行自体に集中する

### プロンプトの例

```
アプリの方向性が固まったので、技術構成を見直したい。

- 現状のミニマム構成（ログイン無し、GitHub Pages配信等）を振り返り、
  dev-standards/docs/standard-tech-stack.mdの「選定の考え方」に沿って、
  ログイン・バックエンドAPI・PWA等の要否を判断してほしい
- 判断が変わった要素（例: ログインを追加する、フロントエンドをGitHub
  PagesからS3 + CloudFrontへ移行する）があれば、それぞれissueを起票
  してから進めてほしい
- 既存の画面・機能は壊さないように、標準構成への移行後も同じように
  動くことを確認してほしい
- テストカバレッジ等の品質基準の厳格化はまだ次の段階（モダナイズ）で
  考えるので、今回は構成の移行自体に集中してほしい
```

このプロンプトの要点は、技術選定の見直しとモダナイズを明確に分離し、本フェーズでは構成の移行のみに集中させることである。判断が変わった要素ごとにissueを起票する点は、フェーズ2・4のプロンプトと共通する原則である。

## フェーズ4: モダナイズ

構成のリファクタリングが完了したら、テストカバレッジ閾値・lint厳格化等の技術的なモダナイズ観点を適用していく。

### 進め方

1. 以下の観点リストを順に確認し、完了条件を満たすまで進める
2. 各観点は独立しており、プロダクトの性質に応じて不要な観点はスキップしてよい（例: バックエンドが無いならDB関連の観点は対象外）
3. 観点ごとにissueを起票してから進める。一度に全部満たす必要はなく、段階的に進めてよい

### プロンプトの例

```
アプリの構成が安定したので、dev-standards準拠のモダナイズを進めたい。

- dev-standards/docs/ai-driven-app-curriculum.mdのモダナイズ観点リストを
  順に確認し、基本的な単体テストの整備から始めてほしい
- 観点ごとにissueを起票してから進めてほしい。一度に全部やらなくていい。
  1つの観点が完了条件を満たしたら、次の観点へ進んでほしい
- 各観点の達成条件（完了条件）を満たしたことを、実際にCIを実行して
  確認してほしい
```

### モダナイズ観点リストと達成条件

| 観点 | 達成条件 | 参照ドキュメント |
|---|---|---|
| CD有効化 | `.github/workflows/cd.yml`が`reusable-cd.yml`を呼び出し、semantic-releaseでバージョン管理されている（採用する場合）。releaseを起動させるには、`BOT_TOKEN`シークレットの登録と、`ci.yml`/`cd.yml`での明示的な`secrets:`転送が必要（`GITHUB_TOKEN`によるpushはCDの新規workflow実行をトリガーしないため。詳細は[`cicd-pipeline-specification.md`](cicd-pipeline-specification.md)「共通の環境変数」を参照） | [`cicd-pipeline-specification.md`](cicd-pipeline-specification.md) |
| フロントエンド単体テスト | vitest + Testing Libraryで主要画面・フックにテストがあり、CIでカバレッジ閾値が設定されている | [`client-only-vite-spa-pattern.md`](client-only-vite-spa-pattern.md) |
| バックエンドAPIを持つ場合のテスト | バックエンドにも単体テストがあり、CIのカバレッジ閾値が設定されている（バックエンドが無い場合は対象外） | [`nextjs-static-lambda-pattern.md`](nextjs-static-lambda-pattern.md) |
| E2Eテスト | Playwrightで主要な利用フローが検証されている（採用する場合） | [`e2e-coverage-pattern.md`](e2e-coverage-pattern.md) |
| lintルール整備 | 複雑度・sonarjs等のlintルールが有効化され、エラー0件 | [`code-quality-conventions.md`](code-quality-conventions.md) |
| コード重複検知 | `enable_duplication_check`が有効化され、しきい値が設定されている | [`cicd-pipeline-specification.md`](cicd-pipeline-specification.md) |
| アーキテクチャ境界チェック | `enable_architecture_check`が有効化され、frontend/backend間の越境import・循環依存が検知される（複数パッケージ構成の場合） | [`cicd-pipeline-specification.md`](cicd-pipeline-specification.md) |
| セキュリティスキャン（CodeQL） | `.github/workflows/codeql.yml`が`reusable-codeql.yml`を呼び出し、PRで静的解析が実行される | [`cicd-pipeline-specification.md`](cicd-pipeline-specification.md) |
| ドキュメント運用 | `docs/*.md`等に対しtextlintが有効化され、エラー0件になっている | [`documentation-format-conventions.md`](documentation-format-conventions.md) |
| ドキュメントのmermaid図対応 | ドキュメント中のmermaid図が`enable_mermaid_render`・`mermaid_doc_paths`で画像化され、PR差分ビューでも図として確認できる（mermaid図を使う場合のみ） | [`documentation-format-conventions.md`](documentation-format-conventions.md) |
| E2Eスクリーンショットのスマートフォン表示対応 | Playwright E2Eが撮影したスクリーンショットが、Job Summary・PRコメントへ画像として直接埋め込まれる（採用する場合。スマートフォンではPlaywright HTMLレポート自体は閲覧しづらいため） | [`cicd-pipeline-specification.md`](cicd-pipeline-specification.md) |
| E2Eテスト結果のPR表示 | `enable_e2e_test`によりPlaywright E2Eの成否・カバレッジがPRコメント・Job Summaryへ投稿される（採用する場合） | [`cicd-pipeline-specification.md`](cicd-pipeline-specification.md) |
| 個人情報の扱い | 実在の個人データを扱う場合、コード・コミットに個人情報を持ち込まない設計になっている | [`public-repo-no-pii-pattern.md`](public-repo-no-pii-pattern.md) |
| GitHub Actions内の秘密情報の露出防止 | ログ・Job Summaryに秘密情報を出力しない設計になっている | [`public-repo-secrets-in-actions-pattern.md`](public-repo-secrets-in-actions-pattern.md) |
| 依存更新の自動化（Renovate） | リポジトリルートに`renovate.json`があり、`git-submodules`マネージャーが明示的に有効化されている（Renovateのデフォルトでは無効）。GitHub Appのインストール先はOrganization（個人アカウントだと効かない）。Mendダッシュボードの動作モードが「自動化されたPR」になっており、依存更新PRが自動的に作成される | [`cicd-pipeline-specification.md`](cicd-pipeline-specification.md)「dev-standards submoduleの自動更新（Renovate）について」 |
| 依存更新の運用・SBOM | 上記Renovate等が作成した依存更新PRに対し、`enable_dependency_risk_summary`で適用リスク・維持リスク判定（Risk Summary）およびSBOM（CycloneDX）が投稿される | [`dependency-risk-judgment.md`](dependency-risk-judgment.md) |
| 運用監視 | サイレント障害（Lambdaエラー等）をCloudWatch Alarm等で検知し通知する仕組みがある（バックエンドAPIを持つ場合） | [`ops-monitoring-pattern.md`](ops-monitoring-pattern.md) |
| フロントエンドエラー報告 | ErrorBoundaryが捕捉した例外をサーバーサイドへロギングする仕組みがある（採用する場合） | [`client-error-reporting-pattern.md`](client-error-reporting-pattern.md) |
| UI規約 | バージョン・更新日時の表示等、横断的なUI規約に従っている（採用する場合） | [`frontend-ui-conventions.md`](frontend-ui-conventions.md) |
| ブルーグリーン（canary）デプロイ | 利用者が増え、本番への変更を段階的に検証したい場合、stable/canaryの重み付けルーティング・自動昇格を導入している（必要になった場合のみ採用。小規模なうちは不要） | [`blue-green-stage-pattern.md`](blue-green-stage-pattern.md) |

すべての観点を一度に満たす必要はない。基本的な単体テストから始め、プロダクトが育つにつれて残りの観点を段階的に適用していく進め方でよい。

## 関連ドキュメント

- [`standard-tech-stack.md`](standard-tech-stack.md): 技術構成の索引・新規プロジェクトの立ち上げ手順
- [`cicd-pipeline-specification.md`](cicd-pipeline-specification.md): CI/CDパイプラインの詳細仕様
- [`code-quality-conventions.md`](code-quality-conventions.md): lintルールの推奨値
