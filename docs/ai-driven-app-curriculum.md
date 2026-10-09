# AI駆動アプリ開発カリキュラム（アイデア→アプリ化→モダナイズ）

思いついたアイデアを、Claude Codeとの対話でアプリとして動かし、ある程度形になった段階でCI/CD・テスト・lint等の技術的な品質基準を適用して育てていく、2段階の進め方をまとめる。karuta等の実プロダクトが実際にこの順番で育った。

dev-standardsには2種類の内容が含まれており、本カリキュラムではこれらを区別する。

- **開発プロセス自体の手順（`.claude/skills/`配下のSkill）**: git-workflow・commit・git-conventions・code-review・safe-bash-commands等。それぞれブランチ運用・コミット前提条件・コミットメッセージ規約・自己レビュー観点・安全なコマンド実行を扱う。プロダクトの成熟度に関わらず**フェーズ1から常に頼る**
- **技術的なモダナイズ観点**: CI gate有効化・テストカバレッジ閾値・lint厳格化・依存リスク判定等。アプリの完成度に応じて段階的に適用するため、**フェーズ1では後回しにしてよい**

## 本ドキュメントの位置づけ

`docs/standard-tech-stack.md`は「技術構成の索引・組み立て手順」であり、採用する技術が既に決まっている前提で参照する。本ドキュメントは「決まっていない段階から、どういう順番で進めるか」というカリキュラムであり、`standard-tech-stack.md`より前の段階、かつフェーズ2で同ドキュメントを実際に参照しに行くまでの橋渡しを担う。両ドキュメントの内容は重複させない。

## 環境準備チェックリスト（フェーズ1に入る前に）

| 項目 | 内容 |
|---|---|
| GitHubアカウント・新規リポジトリ | アイデアごとに1リポジトリを作る（既存プロダクトへの機能追加ではなく、新規アイデアを試す場合） |
| Claude Codeの利用環境 | ターミナル（CLI）・Claude Code on the web・デスクトップアプリのいずれかを用意する。スマートフォンのみで運用する場合はCLAUDE.md「開発環境の制約（スマホオンリー）」の方針に従う |
| AWSアカウント・認証情報 | バックエンドAPI・DB等を使う可能性がある場合は、この段階でAWSアカウントとGitHub Secrets（`AWS_ACCESS_KEY_ID`・`AWS_SECRET_ACCESS_KEY`）を準備しておく。フロントエンドのみで完結する場合は不要 |
| dev-standardsの取り込み | `git submodule add`で取り込み、`node dev-standards/scripts/bootstrap.js`を実行する。`CLAUDE.md`を作成し、先頭で`@dev-standards/CLAUDE.md`をインポートする（`docs/standard-tech-stack.md`「新規プロジェクトの立ち上げ手順」手順1）。これによりgit-workflow・commit等のSkillがフェーズ1から使える状態になる |
| アイデアの一言メモ | 技術選定は不要。「誰が」「何をするための」アプリかを1〜2文で言える状態にしておく（最初のプロンプトでそのまま使う） |

## フェーズ1: アイデアをアプリにする

### 進め方

1. リポジトリを作り、環境準備チェックリストの「dev-standardsの取り込み」まで済ませる（Skillをフェーズ1から使える状態にしておく）
2. アイデアをそのままClaude Codeへ伝え、最小限の画面・機能を一気に作ってもらう（後述のプロンプト例を参照）。ブランチ運用・コミットはgit-workflow/commit/git-conventions Skillに従って進む
3. 実際に動かして触り、違和感のある部分を言葉で伝えて直してもらう（CI gate・カバレッジ閾値等の技術的なモダナイズ観点はこの段階では要求しない）
4. 「人に見せられる」最小限の状態になったら、フェーズ2へ進む判断をする

### 最初のプロンプトの例

以下はアイデアを最速で動く形にするための最初の1投目の例。アプリの種類に応じて書き換える。

```
〈アプリのアイデア〉を試してみたい。

- 想定ユーザー: 〈誰が使うか〉
- やりたいこと: 〈何をするためのアプリか、1〜2文〉
- 今はこのアイデアが本当に良いか確かめたいだけなので、CI強化・テストカバレッジ
  閾値・lintの厳格化等の技術的なモダナイズは一切考えなくていい。ローカルで動く
  ものを最速で作ってほしい
- ただし、ブランチ運用・コミットはdev-standardsのSkill（git-workflow・commit・
  git-conventions）にそのまま従ってほしい
- 画面・機能は最小限でいい。「動くものを触って確認する」ことだけが目的

まず簡単な実装方針を示してから、実装してほしい。
```

このプロンプトの要点は、「最速で動くもの」を優先させつつ、開発プロセス自体（ブランチ運用・コミット規約）はdev-standardsのSkillにそのまま従わせることである。後回しにしてよいのは、CI gate・カバレッジ閾値・lint厳格化等の技術的なモダナイズ観点のみであり、開発プロセス自体を例外扱いにはしない。

## フェーズ2: 技術的なモダナイズ

アプリの方向性が固まり、継続して育てていく判断をしたら、CI gate・テストカバレッジ閾値・lint厳格化等の技術的なモダナイズ観点を適用していく（dev-standardsの取り込み自体はフェーズ1で既に済んでいる）。

### 進め方

1. `docs/standard-tech-stack.md`「新規プロジェクトの立ち上げ手順」の手順2以降（フロントエンド雛形・ログイン・バックエンドAPI等、技術選定が必要な部分）を、フェーズ1で作った画面・機能に後から当てはめる形で適用する
2. 以下の観点リストを順に確認し、完了条件を満たすまで進める
3. 各観点は独立しており、プロダクトの性質に応じて不要な観点はスキップしてよい（例: バックエンドが無いならDB関連の観点は対象外）

### モダナイズ観点リストと達成条件

| 観点 | 達成条件 | 参照ドキュメント |
|---|---|---|
| CI有効化 | `.github/workflows/ci.yml`が`reusable-ci.yml`を呼び出し、lint・testがPRで実行される | `docs/cicd-pipeline-specification.md` |
| CD有効化 | `.github/workflows/cd.yml`が`reusable-cd.yml`を呼び出し、semantic-releaseでバージョン管理されている（採用する場合） | `docs/cicd-pipeline-specification.md` |
| フロントエンド単体テスト | vitest + Testing Libraryで主要画面・フックにテストがあり、CIでカバレッジ閾値が設定されている | `docs/client-only-vite-spa-pattern.md` |
| バックエンドAPIを持つ場合のテスト | バックエンドにも単体テストがあり、CIのカバレッジ閾値が設定されている（バックエンドが無い場合は対象外） | `docs/nextjs-static-lambda-pattern.md` |
| E2Eテスト | Playwrightで主要な利用フローが検証されている（採用する場合） | `docs/e2e-coverage-pattern.md` |
| lintルール整備 | 複雑度・sonarjs等のlintルールが有効化され、エラー0件 | `docs/code-quality-conventions.md` |
| コード重複検知 | `enable_duplication_check`が有効化され、しきい値が設定されている | `docs/cicd-pipeline-specification.md` |
| アーキテクチャ境界チェック | `enable_architecture_check`が有効化され、frontend/backend間の越境import・循環依存が検知される（複数パッケージ構成の場合） | `docs/cicd-pipeline-specification.md` |
| セキュリティスキャン（CodeQL） | `.github/workflows/codeql.yml`が`reusable-codeql.yml`を呼び出し、PRで静的解析が実行される | `docs/cicd-pipeline-specification.md` |
| 個人情報の扱い | 実在の個人データを扱う場合、コード・コミットに個人情報を持ち込まない設計になっている | `docs/public-repo-no-pii-pattern.md` |
| GitHub Actions内の秘密情報の露出防止 | ログ・Job Summaryに秘密情報を出力しない設計になっている | `docs/public-repo-secrets-in-actions-pattern.md` |
| 依存更新の運用・SBOM | Renovate等の依存更新PRに対し、`enable_dependency_risk_summary`で適用リスク・維持リスク判定（Risk Summary）およびSBOM（CycloneDX）が投稿される | `docs/dependency-risk-judgment.md` |
| 運用監視 | サイレント障害（Lambdaエラー等）をCloudWatch Alarm等で検知し通知する仕組みがある（バックエンドAPIを持つ場合） | `docs/ops-monitoring-pattern.md` |
| フロントエンドエラー報告 | ErrorBoundaryが捕捉した例外をサーバーサイドへロギングする仕組みがある（採用する場合） | `docs/client-error-reporting-pattern.md` |
| UI規約 | バージョン・更新日時の表示等、横断的なUI規約に従っている（採用する場合） | `docs/frontend-ui-conventions.md` |
| ブルーグリーン（canary）デプロイ | 利用者が増え、本番への変更を段階的に検証したい場合、stable/canaryの重み付けルーティング・自動昇格を導入している（必要になった場合のみ採用。小規模なうちは不要） | `docs/blue-green-stage-pattern.md` |

すべての観点を一度に満たす必要はない。CIの有効化・基本的な単体テストから始め、プロダクトが育つにつれて残りの観点を段階的に適用していく進め方でよい。

## 関連ドキュメント

- `docs/standard-tech-stack.md`: 技術構成の索引・新規プロジェクトの立ち上げ手順
- `docs/cicd-pipeline-specification.md`: CI/CDパイプラインの詳細仕様
- `docs/code-quality-conventions.md`: lintルールの推奨値
