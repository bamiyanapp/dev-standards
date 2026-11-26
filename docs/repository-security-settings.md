# GitHubリポジトリのセキュリティ設定の基準

リポジトリは公開が前提である。
次の設定はGitHubの設定画面にあり、コードの検査では見えない。
本書は、各設定の目的と推奨値を定める（[#1618](https://github.com/bamiyanapp/dev-standards/issues/1618)）。
設定は、リポジトリの管理者が、スマホのブラウザから行う。

## 基準の一覧

| 設定 | 推奨値 | 目的 |
| --- | --- | --- |
| `SECURITY.md` | 置く | 脆弱性の報告先を示す |
| Private vulnerability reporting | 有効 | 脆弱性を非公開で受ける |
| Secret scanning | 有効 | コミット済みの秘密情報を検知する |
| Push protection | 有効 | 秘密情報のpushを止める |
| Dependabot alerts | 有効 | 脆弱な依存を知らせる |
| Dependabot version updates | 無効 | 更新PRはRenovateが担う |
| ブランチ保護（ルールセット） | 次節のとおり | 検査を通らない変更を、mainへ入れない |
| Actionsの既定の権限 | 読み取りのみ | 過剰な権限を避ける |
| Actionsの許可範囲 | 組織内と、選んだ外部 | 未知のアクションを避ける |

## SECURITY.md

雛形は、[`templates/SECURITY.md`](../templates/SECURITY.md)にある。
リポジトリのルートへコピーする。
連絡先は、メールアドレスを書かず、GitHubの非公開報告へ誘導する。
個人情報の扱いは、[`public-repo-no-pii-pattern.md`](public-repo-no-pii-pattern.md)に従う。

## ブランチ保護

標準は、基準に書くが、強制しない。
CLAUDE.mdは、Claudeによる承認とマージを禁じる。人間がマージする運用と、次のように整合させる。

- mainへの直接pushを禁じ、PR経由にする
- 必須のチェックは、`チェックの集約`（`checks-gate`）の1つにする
- force pushと、ブランチの削除を禁じる
- 承認の必須人数は、リポジトリの運用に合わせる。自動マージを使う場合は、0にする

## スマホでの設定場所

GitHubのモバイルアプリでは、設定の多くが開けない。
スマホのブラウザで、リポジトリの「Settings」を開く。

| 設定 | 場所 |
| --- | --- |
| 非公開報告・Secret scanning・Push protection・Dependabot | Settings → Advanced Security（Code security） |
| ブランチ保護 | Settings → Rules → Rulesets |
| Actionsの権限・許可範囲 | Settings → Actions → General |

画面の名前は、GitHubの更新で変わることがある。

## 設定の確認

APIで読める設定と、読めない設定がある。権限に依存する。
読めない設定は、チェックリストとして扱う。
読める設定を、`consumer-ci-health`へ載せるかは、別に判断する。

## 既存の参照側

既存の参照側への展開は、各プロダクトの管理とする（[#1527](https://github.com/bamiyanapp/dev-standards/issues/1527)）。
新規リポジトリは、作成時に、上の基準を一度確かめる。
