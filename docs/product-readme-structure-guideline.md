# プロダクトREADMEの記載観点フレームワーク

本書は、各参照側リポジトリ（karuta等、アプリケーション本体）のトップレベル`README.md`が備えるべき記載観点を定める。dev-standards自身の`README.md`（開発基盤のメタドキュメント）は対象外である。

## 背景

issue #1338。プロジェクトによってREADMEに必要な情報が抜けていることがあった。[bamiyanapp/karuta](https://github.com/bamiyanapp/karuta)のREADMEが最も記載が充実しているため、これをベースに観点を一般化する。

## 観点一覧

### 必須項目

新規プロジェクトでも省略せず記載する項目である。

| 観点 | 内容 | karutaでの実例 |
|---|---|---|
| タイトル・目的 | アプリ名と、何のためのアプリかを1〜2文で示す | 「かるたの読み上げをアプリで行うことで、全員がかるたに参加すること」 |
| Features | 主要機能を箇条書きで列挙する。実装順ではなく利用者視点の機能単位で区切る | フレーズ読み上げ・カテゴリ管理・コメント機能等 |
| Tech Stack | 使用技術の一覧ページへのリンクのみを置く（本文に詳細を書かない） | `docs/tech-stack.md`を参照するリンク1行 |
| CI/CD Pipeline Specification | 自プロジェクト固有のCI/CD仕様書（カスタムjob・運用上の注意点）があれば、そのドキュメントへのリンクを置く。無ければ[`cicd-pipeline-specification.md`](cicd-pipeline-specification.md)への直接リンクで代替する | [`docs/cicd-pipeline-specification.md`](https://github.com/bamiyanapp/karuta/blob/main/docs/cicd-pipeline-specification.md)を参照するリンク |
| 開発共通設定（dev-standards）のバージョン | 採用中のdev-standardsバージョンを示す自動生成セクション。`scripts/docs/generate-dev-standards-version.js`相当のスクリプトで再生成する（手動編集しないことを明記する） | `<!-- dev-standards-version:start/end -->`マーカーで自動生成 |

### 該当時のみ記載する項目

機能・構成が実在する場合にのみ記載する。無い場合は節ごと省略してよい。

| 観点 | 内容 | karutaでの実例 |
|---|---|---|
| 運用状態の自動反映 | ブルーグリーン運用（[`blue-green-stage-pattern.md`](blue-green-stage-pattern.md)）等、定常的に変化する運用状態がある場合、自動生成ドキュメントへのリンクを置く | 「現在のcanary運用状態」節（`docs/generated/canary-status.md`） |
| Architecture | `backend/serverless.yml`等の定義から自動生成されるアーキテクチャ図・API仕様書（issue #919）への誘導。画面遷移図（mermaid）・Backend API・WebSocket API・DB定義等、実在するものだけを列挙する | System Architecture・Screen Transitions・Backend API・WebSocket API・Database (DynamoDB) の5項目 |
| 移行・互換性に関する開発規律 | ブルーグリーン移行等、進行中または完了済みの大規模移行があり、開発時に守るべき規律（スキーマ互換性等）がある場合、専用ドキュメントへのリンクを置く | 「単一ステージ運用からstable/canaryへの移行記録」・「DynamoDBスキーマ互換性ガイドライン」への誘導 |
| 運用 | 定常的な運用手順（バックアップ・復旧、データ追加・更新手順等）がある場合、専用の運用ドキュメントへのリンクを置く | `docs/operations.md`を参照するリンク |

## 執筆上の方針

- README本文に詳細な手順・仕様を書き込まない。各観点は専用ドキュメントへの入口（1〜数行のリンク）に留め、詳細は`docs/`配下の個別ドキュメントへ分離する（[`documentation-format-conventions.md`](documentation-format-conventions.md)のボリューム上限方針と整合させるため）
- 自動生成セクション（dev-standardsバージョン・運用状態・Architecture等）は、生成元スクリプト名を明記し「手動で編集しないこと」を本文に書く
- 新規プロジェクトでは、まず必須項目のみで最小のREADMEを作り、該当する機能・構成が実装された時点で該当項目を追加していく

## 既存プロジェクトへの適用状況

[`consumer-repositories.md`](consumer-repositories.md)に列挙された参照側リポジトリのうち、本書公開時点でアクセス可能だったのはkaruta（本書のベース自体のため適用済み）のみである。他のリポジトリ（Camp-Stock・examination・uchi-stock系・Electric-Chair-Arena等）は未確認である。各リポジトリへアクセス可能なセッション・人間が、本書の観点一覧と照らして不足項目を補うことを想定する。
