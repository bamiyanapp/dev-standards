# ドキュメントの表現形式（文章・表・mermaid図）の選び方

Markdownドキュメントの内容を、文章・箇条書き・表・mermaid図のどれで表現するかの判断基準をまとめる。既存ドキュメントへの後追い適用はissue #463で個別対応済み。新規ドキュメント作成時・他の参照側リポジトリでも、この基準を最初から使う。

## 表が向くケース

- 複数項目について、同じ種類の属性（名前・値・条件・理由等）を並列に列挙している
- 条件分岐の対応表になっている（入力パターンごとに結果が変わる一覧）
- 複数のリポジトリ・複数のファイルで、同種の情報を比較している

## mermaid図が向くケース

| パターン | 使う図の種類 |
|---|---|
| 分岐を含む手順・フロー | flowchart |
| 複数コンポーネント間のやり取り（呼び出し関係・依存関係） | sequenceDiagram |
| 状態遷移 | stateDiagram |
| ASCIIアートで手書きされた構成図の置き換え | flowchart |

## 対象外とする基準

以下は無理に表・mermaid図へ変換しない。変換のための変換を避ける。

- 分岐の無い単純な逐次手順
- 既に十分読みやすい箇条書き

## ドキュメント1本のボリューム上限（肥大化したら分割する）

`textlint-rules/max-lines.js`（既定200実効行、issue #537）が、コードフェンス・テーブル行・空行を除いた実効行数の超過を検知し、超過時は「ファイルの分割を検討してください」と報告する。

ただし、この除外設計には既知の限界がある。**巨大な表セルに説明文を詰め込むと、実効行数には現れないため検知をすり抜ける**（issue #704で実際に発生。1セル2626文字の行があったが、実効行数としては数行分としてしか数えられなかった）。そのため、lintが0件であることをもって「分割不要」と判断しないこと。

以下のいずれかに該当する場合、lintの結果に関わらず分割を検討する。

- 独立したサブシステム・設定グループとして切り出せる内容がある（例: issue #706で、依存更新Risk判定を`docs/reusable-workflows-reference.md`から`docs/dependency-risk-judgment.md`へ分割した）
- 表のセル・箇条書き1項目が、画面を大きくスクロールしないと読み切れない量になっている
- ドキュメントの主題が複数に分かれ、目次（見出し）だけで全体像を把握しづらくなっている

分割する際は、新規ドキュメント追加の既存手順（README.md「ドキュメント目次」への追記、mermaid図を含む場合は`mermaid_doc_paths`の更新。後述の節を参照）に従うこと。

## `enable_mermaid_render`との関係（新規にmermaid図を追加する際は必ず確認する）

`mermaid_doc_paths`は`.github/workflows/ci.yml`にある。詳細は`docs/cicd-pipeline-specification.md`「1. CIワークフロー」を参照。これに登録されていないファイルは、GitHubの通常のMarkdownビュー（ファイルをそのまま開いた場合）ではネイティブレンダリングされる。しかし**PR差分ビュー・GitHub API経由でのファイル取得等では図として表示されず、mermaid記法のテキストのまま表示される**（[bamiyanapp/karuta#824](https://github.com/bamiyanapp/karuta/issues/824)）。

CLAUDE.md「開発環境の制約（スマホオンリー）」により、PRレビューはGitHubモバイルアプリのPR差分ビュー経由で行われる。登録漏れはそのまま「レビュー時に図が見えない」という実害に直結し、実際にissue #580で12ファイル・14箇所分の登録漏れが判明した。このため、**新規にmermaid図を追加したら、そのファイルを`mermaid_doc_paths`へ追加することを既定の作業とする**（「単発の追加だから省略してよい」という判断はしない）。

具体的な手順は以下の2点。

1. 対象ファイルを`mermaid_doc_paths`（`.github/workflows/ci.yml`）へ追加する
2. `docs/cicd-pipeline-specification.md`の埋め込み例と同じ形式にする。mermaidブロック直後（`<details>`で折りたたむ場合はその中）に以下のパターンの画像を埋め込む。

   ```
   ![...(rendered)](https://raw.githubusercontent.com/bamiyanapp/dev-standards/docs-diagrams/latest/<ファイル名>[-<連番>].png)
   ```

   ファイル名は拡張子を除いた対象Markdownのbasenameとし、1ファイルに複数のmermaidブロックがある場合は`-1`・`-2`のように連番を付ける。命名規則の詳細は`.github/actions/render-mermaid-diagrams/action.yml`のdescriptionを参照する

マージ後の初回レンダリングが完了するまで画像は表示されない（`docs-diagrams`ブランチの`latest/`は`push`イベントのたびに上書き公開されるため、埋め込み自体は最初の1回のみでよい）。
