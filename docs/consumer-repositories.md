# 参照側リポジトリ一覧

dev-standardsを参照している既知のリポジトリの一覧。`docs/`配下に参照側プロダクトでの個別適用を要する規約（UIコンポーネント規約等）を新設・変更する際、この一覧を「適用状況を確認すべきリポジトリの正」として使う。

特定セッションが以下すべてのリポジトリへのアクセス権を持つとは限らない。アクセスできないリポジトリについては、規約ドキュメントの適用状況セクションへ「未確認」と記載し、そのリポジトリにアクセス可能な別セッション・人間が後追いで確認・対応する運用とする（セッションのアクセス範囲に依存して一覧からリポジトリが漏れることを防ぐため、一覧自体はこのファイルで一元管理し、規約ドキュメント側では都度全件を書き写す）。

## 一覧

| リポジトリ | 参照方法 | 備考 |
|---|---|---|
| [bamiyanapp/dev-standards](https://github.com/bamiyanapp/dev-standards) | 自己参照（dogfooding） | 本リポジトリ自身。`.github/workflows/cd.yml`が相対パスで`reusable-cd.yml`を参照 |
| [bamiyanapp/karuta](https://github.com/bamiyanapp/karuta) | submodule + reusable workflow | もっとも古くからの参照側リポジトリ。`docs/`各所で個別issueへの参照が多数存在する |
| [bamiyanapp/Camp-Stock](https://github.com/bamiyanapp/Camp-Stock) | submodule + reusable workflow | キャンプ道具管理アプリ |
| [bamiyanapp/examination](https://github.com/bamiyanapp/examination) | submodule + reusable workflow | 家族向けナレッジベース（小学校受験対策）。`app/`配下の複数React（Vite）アプリ構成 |
| [bamiyanapp/uchi-stock](https://github.com/bamiyanapp/uchi-stock) | submodule + `reusable-ci.yml`のみ（`cd.yml`は独自運用） | 家庭用品在庫管理アプリ。Firebase Authentication + API Gateway/Lambda(OSLS) + DynamoDB構成（`docs/lambda-api-firebase-auth-pattern.md`参照） |

## 一覧の更新

新しい参照側リポジトリでdev-standardsの利用（`git submodule add`・`reusable-ci.yml`/`reusable-cd.yml`の呼び出し）を開始した場合、この一覧に追記する。既知のリポジトリが参照をやめた場合は削除する（削除の判断がつかない場合は残したまま「参照終了？要確認」等の注記を添える）。
