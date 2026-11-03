---
name: pr-sweep
description: 対象リポジトリのopen PRを横断的に巡回し、コンフリクト（mergeable_state=dirty）を解消し、放置PRをリストアップして報告する。Dependency Dashboardの「PR Closed (Blocked)」節（Renovateが恒久的に提案を止めた更新）も一覧化して報告する。さらに、抑制中のパッケージに後から脆弱性スキャンでCVEが検知されていないかを突き合わせて報告するSkill。/loopでの定期実行を想定する。
user_invocable: true
---

# PR Sweep

## 目的

対象リポジトリに存在する既存のopen PR（自分がこのセッションで作成したものに限らない。Renovate等のbotが作成したPRを含む）を横断的に巡回し、以下を行う。

1. コンフリクト（`mergeable_state: dirty`）を検出し、可能であれば解消する
2. 古いまま放置されている（`mergeable_state: behind`）PRを検出し、必要に応じてmainを取り込む
3. 上記以外の放置PR（CIが通っているが人間の承認待ちのまま等）はリストアップして報告する。マージ判断自体は行わない
4. Dependency Dashboard（Renovateが自動生成するissue）の「PR Closed (Blocked)」節を一覧化して報告する（issue #1290）
5. 抑制中パッケージへの脆弱性検知の突き合わせを行う（issue #1292）

本Skillは既存PRの状態を拾う「巡回」専用であり、新規PRの作成やコード変更そのものは行わない（コンフリクト解消に伴うmainの取り込み・競合解消を除く）。

## 手順

1. 対象リポジトリで`list_pull_requests`（`state: open`）を呼び、open PR一覧を取得する
2. 各PRの`mergeable_state`を確認する
   - `dirty`（コンフリクト）: 「コンフリクト解消」へ進む
   - `behind`（古いまま放置、コンフリクトなし）: baseブランチを取り込んでpushする（コンフリクトが無ければ機械的な操作のため、人への確認は不要）
   - `clean`等（問題なし）: 次のPRへ進む
3. 「Dependency Dashboardの『PR Closed (Blocked)』節の確認」を行う
4. 「抑制中パッケージへの脆弱性検知の突き合わせ」を行う
5. 巡回結果をまとめて報告する（「報告フォーマット」参照）

## Dependency Dashboardの「PR Closed (Blocked)」節の確認

Renovateの更新PRをマージせずクローズすると、Renovateはそのメジャーライン全体への将来の提案を恒久的に停止する。この抑制は、クローズ時に理由が十分記録されないまま発生しやすい。そのため、再検討の機会が構造的に失われやすい。詳細は[`docs/renovate-adoption-lessons.md`](https://github.com/bamiyanapp/dev-standards/blob/main/docs/renovate-adoption-lessons.md)「5.」を参照する。

1. 対象リポジトリでタイトルが`Dependency Dashboard`、作成者が`renovate[bot]`のissueを探す。存在しない場合（Renovate未導入または本体が無効化されている）はこの節をスキップする
2. issue本文の「## PR Closed (Blocked)」節を探す。無い場合（現在抑制中の更新が無い）はスキップする
3. 節内の各項目（パッケージ名・リンクされた元PR番号）を抽出する
4. 各項目について、元PRのクローズ時コメントを確認する（`pull_request_read`の`get_comments`）
   - クローズ理由・再検討条件が明記されている: そのまま報告対象に含める
   - クローズ理由が記録されていない、または不十分（例: 「不要と判断する」のみ）: 「記録不足」として報告対象に含める
5. 本Skill自体はこの一覧の再開（`unignore`・PR再作成等）を行わない。マージ判断と同様、再検討の判断は人間に委ねる

## 抑制中パッケージへの脆弱性検知の突き合わせ

Renovateのクローズ時抑制は、クローズ理由を問わずメジャーライン全体へ無条件にかかる。脆弱性修正アラート（`vulnerabilityAlerts`等）がこの抑制をバイパスするかは未確証であり、不安定という報告もある。詳細は[`docs/renovate-adoption-lessons.md`](https://github.com/bamiyanapp/dev-standards/blob/main/docs/renovate-adoption-lessons.md)「5.」を参照する。この不確実性に対処するため、Renovateの提案状態を見ない独立したスキャン（`dependency-full-scan.js`、issue #1095/#1288）がある。その結果と、抑制中パッケージ一覧を突き合わせる。

1. 前節で取得した抑制中パッケージ名一覧を使う（抑制中の更新が無い場合はこの節全体をスキップする）
2. 対象リポジトリで`dependency-full-scan.js`の直近実行結果issue（固定issue、タイトル・ラベル等で判別）を探す。無い場合（フルスキャン未導入）はこの節をスキップする
3. そのissue本文に列挙された脆弱性検知パッケージ名一覧を抽出する
4. 両方の一覧に同名パッケージが含まれる場合、「Renovateから自動提案が止まっている状態で脆弱性が検知されている」ことを報告対象に含める
5. 本Skill自体はここでも更新判断（`unignore`操作・PR手動再作成等）を行わない。再検討の判断は人間に委ねる

## コンフリクト解消

1. PRのhead branchをローカルにfetchし、baseブランチ（通常`main`）をmergeする
2. コンフリクトが生じたファイルを確認する
   - **生成ファイル・自動更新ファイル**（mermaidキャッシュバスティングのクエリ文字列、`docs/generated/`配下の自動生成ドキュメント等）: 両側の実質的な変更が無い機械的な差分なら問題ない。その場合、より新しい側（通常はbase/main側）の値を採用してよい
   - **実質的なコード・設定の変更**: 両側に意味のある変更がある場合、自動解消せずユーザーに確認する。git-workflow Skillの既存方針、CLAUDE.md「PR（MR）承認・マージ禁止」に揃える。どちらを採用すべきかの判断は人間に委ねる
3. 解消後、対象リポジトリのVerifier（静的チェック：lint/test/build）をローカルで再実行し、エラーが無いことを確認する
4. コミットしてpushする（マージコミットは`git-workflow` Skillの方針どおり、他者のブランチへの強制的な履行履歴変更は行わない。rebase・amend・force-pushは禁止）

## 放置PRの報告（マージ判断は行わない）

CIが通っているが人間の承認待ちのまま等の放置PRは、以下を含めてリストアップし報告する。マージ・承認は一切行わない（CLAUDE.md「PR（MR）承認・マージ禁止」）。

- PR番号・タイトル・作成者
- 作成からの経過日数
- 現在のCI状態
- 放置されていると判断した理由

## 報告フォーマット

以下のセクションを含むMarkdownレポートを作成する。

### 1. 解消したコンフリクト
- PR番号・タイトル、採用した側・判断理由

### 2. 人間の確認が必要なコンフリクト
- PR番号・タイトル、コンフリクトしている箇所、両側の変更内容の要約

### 3. 放置PR一覧
- 「放置PRの報告」の内容

### 4. Dependency Dashboardで恒久的に提案停止中の更新
- パッケージ名・元PR番号・クローズ日・クローズ時のコメント（記録不足の場合はその旨を明記）

### 5. 提案停止中かつ脆弱性検知済みのパッケージ
- パッケージ名・検知元のスキャン結果issueへのリンク・該当CVE概要

### 6. 問題なし
- 巡回対象のうち、特に対応不要だったPRの件数のみ（個別列挙は不要）

## ルール

- 新規PRの作成・既存PRへの機能追加は行わない（本Skillの対象外）
- PR（MR）の承認・マージは一切行わない（CLAUDE.md「PR（MR）承認・マージ禁止」）
- 他者が作成したブランチの履歴を書き換えない（rebase・amend・force-push禁止、git-workflow Skill参照）
- Dependency Dashboardの「PR Closed (Blocked)」節に対し、再開（`unignore`チェックボックスの操作・PR再作成等）は一切行わない。一覧化・報告のみ行い、再検討の判断は人間に委ねる
- 抑制中パッケージへの脆弱性検知についても、`unignore`操作・PR手動再作成等のアクションは一切行わない。一覧化・報告のみ行い、更新判断は人間に委ねる
- `/loop`での定期実行（例: 1日1回）を想定する。1回の実行で全リポジトリを対象にする必要はなく、ループの呼び出し元が対象リポジトリを指定する
