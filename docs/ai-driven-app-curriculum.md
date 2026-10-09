# AI駆動アプリ開発カリキュラム（アイデア→アプリ化→モダナイズ）

思いついたアイデアを、Claude Codeとの対話でアプリとして動かし、ある程度形になった段階でdev-standards準拠のCI/CD・テスト・lintを後から適用して育てていく、2段階の進め方をまとめる。karuta等の実プロダクトが実際にこの順番で育った。

## 本ドキュメントの位置づけ

`docs/standard-tech-stack.md`は「技術構成の索引・組み立て手順」であり、採用する技術が既に決まっている前提で参照する。本ドキュメントは「決まっていない段階から、どういう順番で進めるか」というカリキュラムであり、`standard-tech-stack.md`より前の段階、かつフェーズ2で同ドキュメントを実際に参照しに行くまでの橋渡しを担う。両ドキュメントの内容は重複させない。

## 環境準備チェックリスト（フェーズ1に入る前に）

| 項目 | 内容 |
|---|---|
| GitHubアカウント・新規リポジトリ | アイデアごとに1リポジトリを作る（既存プロダクトへの機能追加ではなく、新規アイデアを試す場合） |
| Claude Codeの利用環境 | ターミナル（CLI）・Claude Code on the web・デスクトップアプリのいずれかを用意する。スマートフォンのみで運用する場合はCLAUDE.md「開発環境の制約（スマホオンリー）」の方針に従う |
| AWSアカウント・認証情報 | バックエンドAPI・DB等を使う可能性がある場合は、この段階でAWSアカウントとGitHub Secrets（`AWS_ACCESS_KEY_ID`・`AWS_SECRET_ACCESS_KEY`）を準備しておく。フロントエンドのみで完結する場合は不要 |
| dev-standardsへのアクセス | git submoduleとして取り込むため、`bamiyanapp/dev-standards`を参照できる状態にしておく |
| アイデアの一言メモ | 技術選定は不要。「誰が」「何をするための」アプリかを1〜2文で言える状態にしておく（最初のプロンプトでそのまま使う） |

## フェーズ1: アイデアをアプリにする

### 進め方

1. 空のリポジトリを作る（dev-standardsの取り込み・`CLAUDE.md`作成は後回しでよい。フェーズ1の目的は最速で動くものを見ることである）
2. アイデアをそのままClaude Codeへ伝え、最小限の画面・機能を一気に作ってもらう（後述のプロンプト例を参照）
3. 実際に動かして触り、違和感のある部分を言葉で伝えて直してもらう（この段階ではテスト・lint・CI等は要求しない）
4. 「人に見せられる」最小限の状態になったら、フェーズ2へ進む判断をする

### 最初のプロンプトの例

以下はアイデアを最速で動く形にするための最初の1投目の例。アプリの種類に応じて書き換える。

```
〈アプリのアイデア〉を試してみたい。

- 想定ユーザー: 〈誰が使うか〉
- やりたいこと: 〈何をするためのアプリか、1〜2文〉
- 今はこのアイデアが本当に良いか確かめたいだけなので、技術選定・デプロイ・テストは
  一切考えなくていい。ローカルで動くものを最速で作ってほしい
- 画面・機能は最小限でいい。「動くものを触って確認する」ことだけが目的

まず簡単な実装方針を示してから、実装してほしい。
```

このプロンプトの要点は、「最速で動くもの」を明示的に優先させ、技術選定・品質基準を今は考えなくていいと伝えること。これにより、Claude Codeが本来持っている「品質基準を満たすまで作業を継続する」という既定の振る舞い（dev-standards CLAUDE.md参照）よりも速度を優先させられる。dev-standardsを取り込んだ後は、このCLAUDE.mdの既定の振る舞いに自然に戻るため、フェーズ1はあくまで一時的な例外である。

## フェーズ2: dev-standards準拠のモダナイズ

アプリの方向性が固まり、継続して育てていく判断をしたら、ここでdev-standardsを取り込み、品質基準を適用する。

### 進め方

1. `docs/standard-tech-stack.md`「新規プロジェクトの立ち上げ手順」の手順1（dev-standards取り込み・`CLAUDE.md`作成）から順に適用する。フェーズ1で作った画面・機能は、構成を後から当てはめる形で保持する
2. 以下の観点リストを順に確認し、完了条件を満たすまで進める
3. 各観点は独立しており、プロダクトの性質に応じて不要な観点はスキップしてよい（例: バックエンドが無いならDB関連の観点は対象外）

### モダナイズ観点リストと達成条件

| 観点 | 達成条件 | 参照ドキュメント |
|---|---|---|
| dev-standards取り込み | git submoduleとして取り込み済み、`node dev-standards/scripts/bootstrap.js`実行済み | `docs/standard-tech-stack.md` |
| CLAUDE.md整備 | リポジトリルートに`CLAUDE.md`があり、先頭で`@dev-standards/CLAUDE.md`をインポートしている | `docs/reusable-workflows-reference.md` |
| CI有効化 | `.github/workflows/ci.yml`が`reusable-ci.yml`を呼び出し、lint・testがPRで実行される | `docs/cicd-pipeline-specification.md` |
| CD有効化 | `.github/workflows/cd.yml`が`reusable-cd.yml`を呼び出し、semantic-releaseでバージョン管理されている（採用する場合） | `docs/cicd-pipeline-specification.md` |
| フロントエンド単体テスト | vitest + Testing Libraryで主要画面・フックにテストがあり、CIでカバレッジ閾値が設定されている | `docs/client-only-vite-spa-pattern.md` |
| バックエンドAPIを持つ場合のテスト | バックエンドにも単体テストがあり、CIのカバレッジ閾値が設定されている（バックエンドが無い場合は対象外） | `docs/nextjs-static-lambda-pattern.md` |
| E2Eテスト | Playwrightで主要な利用フローが検証されている（採用する場合） | `docs/e2e-coverage-pattern.md` |
| lintルール整備 | 複雑度・sonarjs等のlintルールが有効化され、エラー0件 | `docs/code-quality-conventions.md` |
| コード重複検知 | `enable_duplication_check`が有効化され、しきい値が設定されている | `docs/cicd-pipeline-specification.md` |
| 個人情報の扱い | 実在の個人データを扱う場合、コード・コミットに個人情報を持ち込まない設計になっている | `docs/public-repo-no-pii-pattern.md` |
| 依存更新の運用 | Renovate等の依存更新PRに対し、適用リスク・維持リスク判定（Risk Summary）が投稿される | `docs/dependency-risk-judgment.md` |
| UI規約 | バージョン・更新日時の表示等、横断的なUI規約に従っている（採用する場合） | `docs/frontend-ui-conventions.md` |

すべての観点を一度に満たす必要はない。CIの有効化・基本的な単体テストから始め、プロダクトが育つにつれて残りの観点を段階的に適用していく進め方でよい。

## 関連ドキュメント

- `docs/standard-tech-stack.md`: 技術構成の索引・新規プロジェクトの立ち上げ手順
- `docs/cicd-pipeline-specification.md`: CI/CDパイプラインの詳細仕様
- `docs/code-quality-conventions.md`: lintルールの推奨値
