---
name: dev-standards-adoption
description: dev-standardsの直近の更新（CHANGELOG）を読み、参照側プロダクトの設定・workflow・共有物に対応が必要なものを洗い出してIssue化するSkill。「dev-standardsの更新を踏まえて改善点を挙げて」と依頼されたときに使う。
user_invocable: true
---

# dev-standards更新の取り込み確認

## 目的

dev-standardsの修正には、参照側プロダクトで設定の修正が要るものがある。例: `renovate.json`の`managerFilePatterns`の誤り（dev-standards#1522）。これらは自動では気づけない。

本Skillは、dev-standardsの更新内容と、プロダクトの現状を照らし合わせる。対応が要るものを、プロダクトのIssueとして残す。

## 対象

- 対象は、dev-standardsを参照しているプロダクトのリポジトリである
- dev-standards自身では使わない

## 手順

### 1. 範囲を決める

- 参照中のバージョンを調べる。`.github/workflows/*.yml`の`uses: bamiyanapp/dev-standards/...@vX.Y.Z`と`self_ref:`を見る
- submoduleの位置は`git -C dev-standards describe --tags`で確認する。ずれていればその旨を報告する
- 最新のバージョンを調べる。`get_latest_release`（bamiyanapp/dev-standards）を使う
- 依頼にバージョンの範囲の指定があれば、それに従う

### 2. CHANGELOGを読む

- dev-standardsの`CHANGELOG.md`の、参照中のバージョンより新しい節を読む
- submoduleの`CHANGELOG.md`は、参照中のコミットまでの内容である。新しい節は、`get_file_contents`でdev-standardsのmainから読む
- 各項目のリンク先（Issue・PR）の本文を、必要に応じて読む

### 3. 項目を分類する

| 分類 | 例 | 対応 |
|---|---|---|
| 破壊的変更 | 必須入力の追加、既定値の変更 | 必ずIssue化する |
| 設定修正が要る修正 | `managerFilePatterns`の書式の誤り | プロダクトが同じ誤りを持つか確認する |
| 任意の新機能 | `enable_cdn_fonts_check`等 | 導入の価値があればIssue化する |
| 対応不要 | 参照側に影響しない修正 | 報告にだけ含める |

### 4. プロダクトの現状と照らす

分類が「破壊的変更」「設定修正が要る修正」「任意の新機能」の項目ごとに、次を調べる。

- 該当する設定ファイル・workflowの入力・共有物のsymlinkが、プロダクトにあるか
- 項目が指す問題（誤った書式、古い入力等）が、実際に残っているか
- 新機能なら、プロダクトで有効にする価値があるか（例: Google Fontsを使っているか）

調べずに「該当しそう」と書かない。ファイルを見て、根拠（ファイル名・行）を添える。

### 5. Issueにする

- 対応が要るものは、プロダクトのリポジトリにIssueを起票する
- 種別ラベルと、重要度ラベル（`priority:`）を付ける（CLAUDE.mdの「Issue駆動の原則」）
- 本文に、気づいた経緯（dev-standardsのどの更新か）と、対応の項目を書く
- 同じ内容のIssueが既にないか、起票前に検索する

### 6. 報告する

次の形式で報告する。

- 確認した範囲（参照中のバージョン、最新のバージョン）
- 起票したIssue（番号・要点）
- 対応不要と判断したもの（理由つき。一覧は短くてよい）
- 確認できなかったもの（理由つき）

## やらないこと

- Renovateの更新PRのブランチを、書き換えない
- コード変更を伴う対応を、このSkillの中で始めない。Issueにして、通常の流れ（git-workflow）で進める
- プロダクト固有の問題を、dev-standardsのIssueにしない。dev-standards共通の不備に気づいたときだけ、dev-standardsへIssueを起票する（CLAUDE.mdのReflection）
