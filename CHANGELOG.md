# [2.7.0](https://github.com/bamiyanapp/dev-standards/compare/v2.6.3...v2.7.0) (2026-08-29)


### Features

* **shared/ui:** トップページのバージョン・更新日時表示を共有ヘルパー化する ([#340](https://github.com/bamiyanapp/dev-standards/issues/340)) ([6d92190](https://github.com/bamiyanapp/dev-standards/commit/6d921903e4d0695be0e5d8917935d30093bc27ab)), closes [#338](https://github.com/bamiyanapp/dev-standards/issues/338)

## [2.6.3](https://github.com/bamiyanapp/dev-standards/compare/v2.6.2...v2.6.3) (2026-08-29)


### Bug Fixes

* **shared:** pwa配下のReactコンポーネントに"use client"を追加 ([#335](https://github.com/bamiyanapp/dev-standards/issues/335)) ([419344e](https://github.com/bamiyanapp/dev-standards/commit/419344eb2fedd7b873f610d8ba9d7d13ada07b1b)), closes [#334](https://github.com/bamiyanapp/dev-standards/issues/334)

## [2.6.2](https://github.com/bamiyanapp/dev-standards/compare/v2.6.1...v2.6.2) (2026-08-29)


### Bug Fixes

* **ci:** check-coverage-threshold自己参照のpinned tagをv2.6.1へ更新 ([#332](https://github.com/bamiyanapp/dev-standards/issues/332)) ([64fa089](https://github.com/bamiyanapp/dev-standards/commit/64fa0892b7230746550f41af1d357faea4e3ea24))

## [2.6.1](https://github.com/bamiyanapp/dev-standards/compare/v2.6.0...v2.6.1) (2026-08-29)


### Bug Fixes

* **cd:** パブリックリポジトリ化に伴いCDのscheduleバッチをやめ即時deployへ戻す ([#331](https://github.com/bamiyanapp/dev-standards/issues/331)) ([0216853](https://github.com/bamiyanapp/dev-standards/commit/021685365a0de977914524448c20f932562ac177))
* **ci:** per-fileカバレッジ判定の指標をtotal判定と独立して指定できるようにする ([#329](https://github.com/bamiyanapp/dev-standards/issues/329)) ([4cd4e57](https://github.com/bamiyanapp/dev-standards/commit/4cd4e579d18e46b02c8925943e21056ef0ca281a)), closes [#307](https://github.com/bamiyanapp/dev-standards/issues/307)

# [2.6.0](https://github.com/bamiyanapp/dev-standards/compare/v2.5.1...v2.6.0) (2026-08-28)


### Features

* **shared/sfx:** Electric-Chair-Arenaの成功音をsuccess.mp3のバリエーションとして追加する ([#317](https://github.com/bamiyanapp/dev-standards/issues/317)) ([4c2c86c](https://github.com/bamiyanapp/dev-standards/commit/4c2c86cb183932f3aba267b580dbcff29b6c9bee)), closes [#316](https://github.com/bamiyanapp/dev-standards/issues/316)
* **shared/sfx:** 成功・失敗の効果音を共通化する ([#313](https://github.com/bamiyanapp/dev-standards/issues/313)) ([457e19c](https://github.com/bamiyanapp/dev-standards/commit/457e19ca5abe541a32df745f96a30600bf3a2811)), closes [#311](https://github.com/bamiyanapp/dev-standards/issues/311)
* **shared/sfx:** 決定音とショック音をshared/sfx/として共通化する ([#315](https://github.com/bamiyanapp/dev-standards/issues/315)) ([956bfd7](https://github.com/bamiyanapp/dev-standards/commit/956bfd700dac3c3fb83154603baf5cf79111dcce)), closes [#314](https://github.com/bamiyanapp/dev-standards/issues/314)
* **shared:** 太鼓の効果音をshared/sfx/として共有アセット化する ([#312](https://github.com/bamiyanapp/dev-standards/issues/312)) ([5c6e073](https://github.com/bamiyanapp/dev-standards/commit/5c6e073d5a026c9bcab13c197e0e269d5a124b33))

## [2.5.1](https://github.com/bamiyanapp/dev-standards/compare/v2.5.0...v2.5.1) (2026-08-28)


### Bug Fixes

* **ci:** backend-testの関数カバレッジがワーカープロセス間で非決定的になる問題を修正する ([#308](https://github.com/bamiyanapp/dev-standards/issues/308)) ([8fd34be](https://github.com/bamiyanapp/dev-standards/commit/8fd34be27ccb57b76d2af7cbe298b0b956ae3100)), closes [bamiyanapp/Electric-Chair-Arena#253](https://github.com/bamiyanapp/Electric-Chair-Arena/issues/253)

# [2.5.0](https://github.com/bamiyanapp/dev-standards/compare/v2.4.1...v2.5.0) (2026-08-28)


### Features

* **shared/pwa:** UpdateNotifier.jsxのクラス名を標準構成のBootstrapへ書き換える ([#306](https://github.com/bamiyanapp/dev-standards/issues/306)) ([a1150da](https://github.com/bamiyanapp/dev-standards/commit/a1150da4c21c07c7e3596c8445dfefa3121b5dc9)), closes [#289](https://github.com/bamiyanapp/dev-standards/issues/289)

## [2.4.1](https://github.com/bamiyanapp/dev-standards/compare/v2.4.0...v2.4.1) (2026-08-23)


### Bug Fixes

* **shared/pwa:** 認証セッション依存の同一オリジンAPIをキャッシュ対象から除外する ([#285](https://github.com/bamiyanapp/dev-standards/issues/285)) ([fc451f6](https://github.com/bamiyanapp/dev-standards/commit/fc451f6f7f8c56730f1092bf6d4922410c1ac61a)), closes [#284](https://github.com/bamiyanapp/dev-standards/issues/284)

# [2.4.0](https://github.com/bamiyanapp/dev-standards/compare/v2.3.0...v2.4.0) (2026-08-21)


### Features

* **templates:** 独立ビルドReactアプリの雛形をTailwind+daisyUIからBootstrapへ変更 ([#273](https://github.com/bamiyanapp/dev-standards/issues/273)) ([d719672](https://github.com/bamiyanapp/dev-standards/commit/d7196724d8db8315ad51aaf08d04507b2484ee79))

# [2.3.0](https://github.com/bamiyanapp/dev-standards/compare/v2.2.0...v2.3.0) (2026-08-16)


### Features

* **ci:** frontend/backend変更検出によるpaths制御を追加する ([#219](https://github.com/bamiyanapp/dev-standards/issues/219)) ([6f7cc30](https://github.com/bamiyanapp/dev-standards/commit/6f7cc3018f59144659032dc292600f4973956402)), closes [#218](https://github.com/bamiyanapp/dev-standards/issues/218)

# [2.2.0](https://github.com/bamiyanapp/dev-standards/compare/v2.1.0...v2.2.0) (2026-08-16)


### Bug Fixes

* **ci:** mmdcのハングでrender-mermaid-diagramsが無期限停止する事故を防ぐ ([#224](https://github.com/bamiyanapp/dev-standards/issues/224)) ([b359b9b](https://github.com/bamiyanapp/dev-standards/commit/b359b9b7ec78fd1bf76b663416ed46b43b8a3ab4)), closes [#223](https://github.com/bamiyanapp/dev-standards/issues/223)


### Features

* **shared/ui:** common-theme.cssをbootstrap-theme.cssから切り出す ([#237](https://github.com/bamiyanapp/dev-standards/issues/237)) ([0b6d67f](https://github.com/bamiyanapp/dev-standards/commit/0b6d67fda059fb8cd24d702bd3a06fe068e0daa7)), closes [#236](https://github.com/bamiyanapp/dev-standards/issues/236)
* **shared/ui:** karutaのBootstrapテーマを共有CSSとして切り出す ([#233](https://github.com/bamiyanapp/dev-standards/issues/233)) ([529c76e](https://github.com/bamiyanapp/dev-standards/commit/529c76ed234031e5f318260d89b8f1caf42ec576))

# [2.1.0](https://github.com/bamiyanapp/dev-standards/compare/v2.0.0...v2.1.0) (2026-08-16)


### Features

* **cd:** CDのデプロイ頻度をpushごとから1日4回のscheduleへ変更する ([#221](https://github.com/bamiyanapp/dev-standards/issues/221)) ([eb93d81](https://github.com/bamiyanapp/dev-standards/commit/eb93d81a6af5e9d38c3cf1b9a7a1ac952cb0b0f6)), closes [#220](https://github.com/bamiyanapp/dev-standards/issues/220)

# [2.0.0](https://github.com/bamiyanapp/dev-standards/compare/v1.24.0...v2.0.0) (2026-08-15)


* chore(ci)!: reusable-ci.ymlの非推奨inputを削除する ([#214](https://github.com/bamiyanapp/dev-standards/issues/214)) ([0fa0ba3](https://github.com/bamiyanapp/dev-standards/commit/0fa0ba3650c25e305162e06ee20455809eb9a1be)), closes [#76](https://github.com/bamiyanapp/dev-standards/issues/76) [#76](https://github.com/bamiyanapp/dev-standards/issues/76)


### BREAKING CHANGES

* reusable-ci.ymlからenable_release /
semantic_release_node_version / base_branch / enable_changelog_json /
changelog_source_path / changelog_json_output_path /
enable_shared_release_configの7入力を削除した。これらを渡している
参照側ci.ymlは、reusable-cd.yml側の同名inputへ移行すること。

# [1.24.0](https://github.com/bamiyanapp/dev-standards/compare/v1.23.0...v1.24.0) (2026-08-15)


### Features

* **e2e:** E2EスクリーンショットのcaptureScreenshot()ヘルパーをshared/e2e/へ共通化 ([#210](https://github.com/bamiyanapp/dev-standards/issues/210)) ([3b60fa1](https://github.com/bamiyanapp/dev-standards/commit/3b60fa19cc16a512762a958a2d67c9ef26a45995)), closes [#209](https://github.com/bamiyanapp/dev-standards/issues/209)

# [1.23.0](https://github.com/bamiyanapp/dev-standards/compare/v1.22.1...v1.23.0) (2026-08-15)


### Features

* **skills:** planning-and-task-breakdown Skillを導入する ([#208](https://github.com/bamiyanapp/dev-standards/issues/208)) ([ebb71a0](https://github.com/bamiyanapp/dev-standards/commit/ebb71a04a51da42a49bed4881f0a82523e3d5f10)), closes [#206](https://github.com/bamiyanapp/dev-standards/issues/206)

## [1.22.1](https://github.com/bamiyanapp/dev-standards/compare/v1.22.0...v1.22.1) (2026-08-15)


### Bug Fixes

* **ci:** frontend-test/backend-test/frontend-e2e-testジョブでもsubmoduleを取得する ([#205](https://github.com/bamiyanapp/dev-standards/issues/205)) ([2175a9a](https://github.com/bamiyanapp/dev-standards/commit/2175a9a2de45b5a55986edb482f46bf90c283171)), closes [#204](https://github.com/bamiyanapp/dev-standards/issues/204)

# [1.22.0](https://github.com/bamiyanapp/dev-standards/compare/v1.21.0...v1.22.0) (2026-08-10)


### Features

* **ci:** push時に冗長な検証jobをスキップするskip_verification_on_push入力を追加 ([#194](https://github.com/bamiyanapp/dev-standards/issues/194)) ([15b4e37](https://github.com/bamiyanapp/dev-standards/commit/15b4e37ec44e465dab4fe109e4ec207d2ce5acf6))

# [1.21.0](https://github.com/bamiyanapp/dev-standards/compare/v1.20.0...v1.21.0) (2026-08-09)


### Features

* **ci:** 同一refでの連続push時に古いCI実行をキャンセルする ([#188](https://github.com/bamiyanapp/dev-standards/issues/188)) ([a3057a7](https://github.com/bamiyanapp/dev-standards/commit/a3057a7e44cfefe400e57cee840ea60a16896f44))

# [1.20.0](https://github.com/bamiyanapp/dev-standards/compare/v1.19.0...v1.20.0) (2026-08-08)


### Features

* **templates:** 独立ビルドReactアプリのスキャフォールドをテンプレート化する ([#184](https://github.com/bamiyanapp/dev-standards/issues/184)) ([b458419](https://github.com/bamiyanapp/dev-standards/commit/b458419229bdb2e7b04b05bfc4fa1d736616319b)), closes [#169](https://github.com/bamiyanapp/dev-standards/issues/169)

# [1.19.0](https://github.com/bamiyanapp/dev-standards/compare/v1.18.2...v1.19.0) (2026-08-08)


### Features

* **shared:** textarea自動リサイズ用ユーティリティを共有化する ([#181](https://github.com/bamiyanapp/dev-standards/issues/181)) ([d61a678](https://github.com/bamiyanapp/dev-standards/commit/d61a678a84f3d0af93598a64c8c71de1db21dc63)), closes [#164](https://github.com/bamiyanapp/dev-standards/issues/164)

## [1.18.2](https://github.com/bamiyanapp/dev-standards/compare/v1.18.1...v1.18.2) (2026-08-08)


### Bug Fixes

* **ci:** package-testジョブでenable_standards_check有効時にsubmoduleをcheckoutする ([#176](https://github.com/bamiyanapp/dev-standards/issues/176)) ([87566d3](https://github.com/bamiyanapp/dev-standards/commit/87566d33237c52c153aa81e1f68f8dbb5481b68f)), closes [dev-standards#175](https://github.com/dev-standards/issues/175)

## [1.18.1](https://github.com/bamiyanapp/dev-standards/compare/v1.18.0...v1.18.1) (2026-08-08)


### Bug Fixes

* **shared:** dailyRateLimit.jsから@aws-sdk/client-dynamodbへの直接依存を無くす ([#173](https://github.com/bamiyanapp/dev-standards/issues/173)) ([770f095](https://github.com/bamiyanapp/dev-standards/commit/770f095e95ad1de2109cb5d05023d67e6d8c9544))

# [1.18.0](https://github.com/bamiyanapp/dev-standards/compare/v1.17.0...v1.18.0) (2026-08-08)


### Features

* **shared:** 日次利用回数の上限カウンタを共有Lambdaユーティリティ化する ([#172](https://github.com/bamiyanapp/dev-standards/issues/172)) ([f769df9](https://github.com/bamiyanapp/dev-standards/commit/f769df9328706145cec6e616bc6ac0a45b71e2b3)), closes [identifier#YYYY-MM-DD](https://github.com/identifier/issues/YYYY-MM-DD)

# [1.17.0](https://github.com/bamiyanapp/dev-standards/compare/v1.16.0...v1.17.0) (2026-08-08)


### Features

* **shared:** 横断的UIコンポーネント5点を共有化する ([#170](https://github.com/bamiyanapp/dev-standards/issues/170)) ([5fcc0d7](https://github.com/bamiyanapp/dev-standards/commit/5fcc0d78118375a7eb1b3c24e9476e2f0e584a46))

# [1.16.0](https://github.com/bamiyanapp/dev-standards/compare/v1.15.1...v1.16.0) (2026-08-08)


### Features

* **shared:** PWAキャッシュ更新パターンをshared/pwa/として共有化する ([#158](https://github.com/bamiyanapp/dev-standards/issues/158)) ([d9e1393](https://github.com/bamiyanapp/dev-standards/commit/d9e13931f39595609d506c1394da0d31feeeb581)), closes [examination#118](https://github.com/examination/issues/118) [#122](https://github.com/bamiyanapp/dev-standards/issues/122) [#133](https://github.com/bamiyanapp/dev-standards/issues/133)

## [1.15.1](https://github.com/bamiyanapp/dev-standards/compare/v1.15.0...v1.15.1) (2026-08-02)


### Bug Fixes

* **ci:** packages: "[]"構成でCI全体のconclusionがfailureになる不具合を修正 ([#152](https://github.com/bamiyanapp/dev-standards/issues/152)) ([827efe3](https://github.com/bamiyanapp/dev-standards/commit/827efe35722fac97a2cfea939dafe0d0eca66961))

# [1.15.0](https://github.com/bamiyanapp/dev-standards/compare/v1.14.2...v1.15.0) (2026-08-01)


### Features

* **cd:** Serverless Frameworkデプロイの複合actionを共通化する ([#148](https://github.com/bamiyanapp/dev-standards/issues/148)) ([41fe9c2](https://github.com/bamiyanapp/dev-standards/commit/41fe9c268edd258f97b957cce87952c9475c83f2)), closes [bamiyanapp/karuta#608](https://github.com/bamiyanapp/karuta/issues/608)

## [1.14.2](https://github.com/bamiyanapp/dev-standards/compare/v1.14.1...v1.14.2) (2026-08-01)


### Bug Fixes

* **ci:** matrix要素0件のpackage-testを正しくブロック対象外にする ([#145](https://github.com/bamiyanapp/dev-standards/issues/145)) ([1a99236](https://github.com/bamiyanapp/dev-standards/commit/1a99236eb0989c89edfcf870895b7e437d2d8f53))

## [1.14.1](https://github.com/bamiyanapp/dev-standards/compare/v1.14.0...v1.14.1) (2026-08-01)


### Bug Fixes

* **ci:** packages: "[]"構成でmergeジョブが常にスキップされる不具合を修正 ([#144](https://github.com/bamiyanapp/dev-standards/issues/144)) ([afe8bef](https://github.com/bamiyanapp/dev-standards/commit/afe8befa79c0bad491b5f02964b9498d6daca868))

# [1.14.0](https://github.com/bamiyanapp/dev-standards/compare/v1.13.0...v1.14.0) (2026-07-29)


### Features

* **bootstrap:** copiesの完全一致チェックにマーカー区間方式を導入 ([#141](https://github.com/bamiyanapp/dev-standards/issues/141)) ([9602dc1](https://github.com/bamiyanapp/dev-standards/commit/9602dc1a72f9d1f58c4167ff440d8a541e5d1483))

# [1.13.0](https://github.com/bamiyanapp/dev-standards/compare/v1.12.5...v1.13.0) (2026-07-28)


### Features

* **ci:** E2Eテストのカバレッジ閾値をゲート可能にする ([#134](https://github.com/bamiyanapp/dev-standards/issues/134)) ([66b6c69](https://github.com/bamiyanapp/dev-standards/commit/66b6c69a74a2843d645d2ef350c203ab8da785a0))

## [1.12.5](https://github.com/bamiyanapp/dev-standards/compare/v1.12.4...v1.12.5) (2026-07-26)


### Bug Fixes

* **ci:** jscpdの重複検知対象からテストファイルを除外する ([#132](https://github.com/bamiyanapp/dev-standards/issues/132)) ([cd15a58](https://github.com/bamiyanapp/dev-standards/commit/cd15a5807f90b7c411cbfb5472e921330c7feeca))

## [1.12.4](https://github.com/bamiyanapp/dev-standards/compare/v1.12.3...v1.12.4) (2026-07-26)


### Bug Fixes

* **ci:** render-mermaid-diagramsの自己参照タグをv1.12.3へ更新する（issue bamiyanapp/karuta[#849](https://github.com/bamiyanapp/dev-standards/issues/849)） ([#128](https://github.com/bamiyanapp/dev-standards/issues/128)) ([132400f](https://github.com/bamiyanapp/dev-standards/commit/132400fd6acd03cea1e2eceacf7de0f9b52e26c1))

## [1.12.3](https://github.com/bamiyanapp/dev-standards/compare/v1.12.2...v1.12.3) (2026-07-26)


### Bug Fixes

* **mermaid:** render-mermaid-diagramsで日本語フォントをインストールする（issue bamiyanapp/karuta[#849](https://github.com/bamiyanapp/dev-standards/issues/849)） ([#126](https://github.com/bamiyanapp/dev-standards/issues/126)) ([1ddc87d](https://github.com/bamiyanapp/dev-standards/commit/1ddc87da270cb3504f325034cf23a6e3365ceeb1))

## [1.12.2](https://github.com/bamiyanapp/dev-standards/compare/v1.12.1...v1.12.2) (2026-07-26)


### Bug Fixes

* **ci:** render-mermaid-diagramsの自己参照タグをv1.12.1へ更新する（issue bamiyanapp/karuta[#837](https://github.com/bamiyanapp/dev-standards/issues/837)） ([#123](https://github.com/bamiyanapp/dev-standards/issues/123)) ([0113ff6](https://github.com/bamiyanapp/dev-standards/commit/0113ff6a76b79a421cc4c2a1ec81e3ecef9afae8)), closes [bamiyanapp/karuta#583](https://github.com/bamiyanapp/karuta/issues/583)

## [1.12.1](https://github.com/bamiyanapp/dev-standards/compare/v1.12.0...v1.12.1) (2026-07-26)


### Bug Fixes

* **mermaid:** render-mermaid-diagramsの出力をSVGからPNGへ切り替える（issue bamiyanapp/karuta[#837](https://github.com/bamiyanapp/dev-standards/issues/837)） ([#122](https://github.com/bamiyanapp/dev-standards/issues/122)) ([91b2037](https://github.com/bamiyanapp/dev-standards/commit/91b2037657c2a8a28e819e5c681db81ec014097c))

# [1.12.0](https://github.com/bamiyanapp/dev-standards/compare/v1.11.0...v1.12.0) (2026-07-25)


### Features

* **ci:** mermaid図の最新レンダリング結果をドキュメント本体から常時確認できるようにする（issue bamiyanapp/karuta[#824](https://github.com/bamiyanapp/dev-standards/issues/824)） ([#119](https://github.com/bamiyanapp/dev-standards/issues/119)) ([1e2576f](https://github.com/bamiyanapp/dev-standards/commit/1e2576f62042a59d78077d651a9b3aef139554d8))

# [1.11.0](https://github.com/bamiyanapp/dev-standards/compare/v1.10.0...v1.11.0) (2026-07-25)


### Features

* **ci:** mermaid図の事前レンダリングをdev-standards自身で有効化する ([#117](https://github.com/bamiyanapp/dev-standards/issues/117)) ([989833c](https://github.com/bamiyanapp/dev-standards/commit/989833c66afee1b6618f1e4dc62d59aa1f76e71a)), closes [bamiyanapp/karuta#824](https://github.com/bamiyanapp/karuta/issues/824)

# [1.10.0](https://github.com/bamiyanapp/dev-standards/compare/v1.9.0...v1.10.0) (2026-07-25)


### Features

* **ci:** Markdown中のmermaid図をSVG事前レンダリングするjobを追加する（issue bamiyanapp/karuta[#824](https://github.com/bamiyanapp/dev-standards/issues/824)） ([#116](https://github.com/bamiyanapp/dev-standards/issues/116)) ([e716767](https://github.com/bamiyanapp/dev-standards/commit/e7167676cbbd0548fc84d3bf3ba3f25d5ae51496))

# [1.9.0](https://github.com/bamiyanapp/dev-standards/compare/v1.8.0...v1.9.0) (2026-07-25)


### Features

* **ci:** jscpdによるコード重複検知jobを追加する（issue bamiyanapp/karuta[#806](https://github.com/bamiyanapp/dev-standards/issues/806)） ([#113](https://github.com/bamiyanapp/dev-standards/issues/113)) ([446a646](https://github.com/bamiyanapp/dev-standards/commit/446a646ccb3a8e93bf4f26b66bbe2c4c227fa548))

# [1.8.0](https://github.com/bamiyanapp/dev-standards/compare/v1.7.1...v1.8.0) (2026-07-25)


### Features

* **ci:** CodeQLによる静的解析を提供するreusable workflowを追加する（issue bamiyanapp/karuta[#808](https://github.com/bamiyanapp/dev-standards/issues/808)） ([#112](https://github.com/bamiyanapp/dev-standards/issues/112)) ([c696ec9](https://github.com/bamiyanapp/dev-standards/commit/c696ec91fe5d251fd8ad4a447bb9237ed2fc6c7c))

## [1.7.1](https://github.com/bamiyanapp/dev-standards/compare/v1.7.0...v1.7.1) (2026-07-24)


### Bug Fixes

* **ci:** E2Eスクリーンショットのベースラインsparse-checkoutパターンをリポジトリルート基準に固定する ([#109](https://github.com/bamiyanapp/dev-standards/issues/109)) ([2854908](https://github.com/bamiyanapp/dev-standards/commit/28549086ee38c86574a3e9c5f0bcd5f4850d82b1))

# [1.7.0](https://github.com/bamiyanapp/dev-standards/compare/v1.6.3...v1.7.0) (2026-07-24)


### Features

* **e2e:** 前回バージョンとの画像diffで差分の無いスクリーンショットの添付を省略する ([#107](https://github.com/bamiyanapp/dev-standards/issues/107)) ([a52d0ed](https://github.com/bamiyanapp/dev-standards/commit/a52d0edf832efa98bac927cbd453206d9216c5d5))

## [1.6.3](https://github.com/bamiyanapp/dev-standards/compare/v1.6.2...v1.6.3) (2026-07-23)


### Bug Fixes

* **ci:** 並列実行ではなくisolateがカバレッジ集計不整合の真因だったため--no-isolateへ差し替える ([#105](https://github.com/bamiyanapp/dev-standards/issues/105)) ([a1e0105](https://github.com/bamiyanapp/dev-standards/commit/a1e010558b1c7073b268b482996bad91b4edeaa8))

## [1.6.2](https://github.com/bamiyanapp/dev-standards/compare/v1.6.1...v1.6.2) (2026-07-23)


### Bug Fixes

* **ci:** check-coverage-thresholdの参照タグ更新漏れと並列実行時のカバレッジ集計不整合を修正する ([#104](https://github.com/bamiyanapp/dev-standards/issues/104)) ([7bf1334](https://github.com/bamiyanapp/dev-standards/commit/7bf133487268a87e1ea604a13fcf03cd95c58ea5))

## [1.6.1](https://github.com/bamiyanapp/dev-standards/compare/v1.6.0...v1.6.1) (2026-07-23)


### Bug Fixes

* **ci:** squash mergeで反映されるPRタイトル自体もcommitlintで検証する（issue [#722](https://github.com/bamiyanapp/dev-standards/issues/722)） ([#102](https://github.com/bamiyanapp/dev-standards/issues/102)) ([650e856](https://github.com/bamiyanapp/dev-standards/commit/650e856a548c659716f5fde38724201f6c057ad1))

# [1.6.0](https://github.com/bamiyanapp/dev-standards/compare/v1.5.0...v1.6.0) (2026-07-23)


### Features

* **check-coverage-threshold:** 指標絞り込み・ファイル単位の閾値判定に対応する ([#100](https://github.com/bamiyanapp/dev-standards/issues/100)) ([081266f](https://github.com/bamiyanapp/dev-standards/commit/081266f7b8e30b6ae6da34203a610a5f0853c962))

# [1.5.0](https://github.com/bamiyanapp/dev-standards/compare/v1.4.0...v1.5.0) (2026-07-18)


### Features

* **ci:** deploy-github-pages複合actionをnpm workspaces構成に対応させる ([#89](https://github.com/bamiyanapp/dev-standards/issues/89)) ([157db5d](https://github.com/bamiyanapp/dev-standards/commit/157db5d7272067447f44a2a8d66b0427e875d1d7))

# [1.4.0](https://github.com/bamiyanapp/dev-standards/compare/v1.3.1...v1.4.0) (2026-07-18)


### Features

* **ci:** E2Eスクリーンショットの折りたたみ判定をテストケース単位に細かくする ([#88](https://github.com/bamiyanapp/dev-standards/issues/88)) ([cc93acb](https://github.com/bamiyanapp/dev-standards/commit/cc93acbe7e88be388c018fb8588cca1d833b350c))

## [1.3.1](https://github.com/bamiyanapp/dev-standards/compare/v1.3.0...v1.3.1) (2026-07-18)


### Bug Fixes

* **ci:** npm ci自体の失敗をNode.jsセットアップ失敗と区別する ([#86](https://github.com/bamiyanapp/dev-standards/issues/86)) ([73dcc96](https://github.com/bamiyanapp/dev-standards/commit/73dcc9671dda73ba02ed3a1a6f19fd70c8b2aa8c))

# [1.3.0](https://github.com/bamiyanapp/dev-standards/compare/v1.2.4...v1.3.0) (2026-07-17)


### Features

* **ci:** PRの変更と無関係なE2Eスクリーンショットを折りたたむ ([#81](https://github.com/bamiyanapp/dev-standards/issues/81)) ([0e23db8](https://github.com/bamiyanapp/dev-standards/commit/0e23db868d3aa18ed70ea5f173cc4405b4e914f5)), closes [bamiyanapp/karuta#628](https://github.com/bamiyanapp/karuta/issues/628)

## [1.2.4](https://github.com/bamiyanapp/dev-standards/compare/v1.2.3...v1.2.4) (2026-07-17)


### Bug Fixes

* **ci:** E2Eスクリーンショットの見出しに日本語キャプションを使えるようにする ([#73](https://github.com/bamiyanapp/dev-standards/issues/73)) ([cda83ae](https://github.com/bamiyanapp/dev-standards/commit/cda83aee05f411cd1860b85706d6932e55b6b52e)), closes [bamiyanapp/karuta#601](https://github.com/bamiyanapp/karuta/issues/601)

## [1.2.3](https://github.com/bamiyanapp/dev-standards/compare/v1.2.2...v1.2.3) (2026-07-17)


### Bug Fixes

* **ci:** check-coverage-thresholdの参照先を固定タグ指定に変更する（2回目の障害是正） ([#71](https://github.com/bamiyanapp/dev-standards/issues/71)) ([475da03](https://github.com/bamiyanapp/dev-standards/commit/475da03d0b25ed72e203f5b4e92128bafd1fc1da)), closes [bamiyanapp/karuta#583](https://github.com/bamiyanapp/karuta/issues/583)

## [1.2.2](https://github.com/bamiyanapp/dev-standards/compare/v1.2.1...v1.2.2) (2026-07-17)


### Bug Fixes

* **ci:** check-coverage-thresholdの参照方式を修正する（前回のCI完全停止の是正） ([#70](https://github.com/bamiyanapp/dev-standards/issues/70)) ([11aee0b](https://github.com/bamiyanapp/dev-standards/commit/11aee0b298f9369eea840067221f47584afcd287)), closes [bamiyanapp/karuta#583](https://github.com/bamiyanapp/karuta/issues/583)

## [1.2.1](https://github.com/bamiyanapp/dev-standards/compare/v1.2.0...v1.2.1) (2026-07-17)


### Bug Fixes

* **ci:** check-coverage-thresholdの相対パス参照を完全修飾参照に修正する ([6f803c1](https://github.com/bamiyanapp/dev-standards/commit/6f803c15c1cc4be3db596b96493f2391497843ce)), closes [bamiyanapp/karuta#573](https://github.com/bamiyanapp/karuta/issues/573)
* **ci:** CI実行一覧でPR時点とpush-to-main時点の実行を判別できるようにする ([24910ee](https://github.com/bamiyanapp/dev-standards/commit/24910eeda03604cd24d7bc50f95a540e543606c5)), closes [#558](https://github.com/bamiyanapp/dev-standards/issues/558)

# [1.2.0](https://github.com/bamiyanapp/dev-standards/compare/v1.1.0...v1.2.0) (2026-07-17)


### Features

* **ci:** E2Eスクリーンショットを専用ブランチへ公開しJob Summary/PRコメントへ埋め込む ([#64](https://github.com/bamiyanapp/dev-standards/issues/64)) ([521a3db](https://github.com/bamiyanapp/dev-standards/commit/521a3db361e93533398544e8986fea065aa83459))

# [1.1.0](https://github.com/bamiyanapp/dev-standards/compare/v1.0.2...v1.1.0) (2026-07-17)


### Features

* **ci:** E2EテストのJSカバレッジ算出結果をログ・Job Summaryへ出力する ([#63](https://github.com/bamiyanapp/dev-standards/issues/63)) ([9aa8f59](https://github.com/bamiyanapp/dev-standards/commit/9aa8f591ba19e40d71f9d0e53e21ce692c62f5d3))

## [1.0.2](https://github.com/bamiyanapp/dev-standards/compare/v1.0.1...v1.0.2) (2026-07-17)


### Bug Fixes

* **ci:** setup-nodeの一時的な失敗を自動リトライし、インフラ起因ならテストを継続する ([#60](https://github.com/bamiyanapp/dev-standards/issues/60)) ([f51ea19](https://github.com/bamiyanapp/dev-standards/commit/f51ea19c6f2c9ea0cfaddbfb67311cc1fac04283))

## [1.0.1](https://github.com/bamiyanapp/dev-standards/compare/v1.0.0...v1.0.1) (2026-07-13)


### Bug Fixes

* **cd:** reusable-cd.ymlが自身の複合actionを[@main](https://github.com/main)参照している不整合を解消する ([#53](https://github.com/bamiyanapp/dev-standards/issues/53)) ([5de0cb4](https://github.com/bamiyanapp/dev-standards/commit/5de0cb49751ddf73850a0428508b5f10bbe55b04))

# 1.0.0 (2026-07-12)


### Bug Fixes

* **cd:** changelog変換のsubmodule依存解消 ([#13](https://github.com/bamiyanapp/dev-standards/issues/13)) ([abac603](https://github.com/bamiyanapp/dev-standards/commit/abac6038aad26dba8de780a27685936b91ff4427))
* **ci:** commitlintジョブのcheckoutからBOT_TOKEN依存を除去 ([#9](https://github.com/bamiyanapp/dev-standards/issues/9)) ([89b3b2e](https://github.com/bamiyanapp/dev-standards/commit/89b3b2e67a711c37b5294a8285bf2283e5ef2512))
* **ci:** mainへのpush後にCDが起動しない不具合を修正 ([#49](https://github.com/bamiyanapp/dev-standards/issues/49)) ([186f28e](https://github.com/bamiyanapp/dev-standards/commit/186f28e6abbcde68dc9132e5b0e1efc2edd17c6f))
* **ci:** merge jobにworkflows権限を付与しPR16のマージ失敗を解消 ([dd350cc](https://github.com/bamiyanapp/dev-standards/commit/dd350cc698cbd7d4cfd80abb78c0a6a529bdc7ed))
* **ci:** mergeジョブがcommitlint失敗時も自動マージされる不具合を修正 ([#42](https://github.com/bamiyanapp/dev-standards/issues/42)) ([e8d0163](https://github.com/bamiyanapp/dev-standards/commit/e8d0163097e54906def5c794404d519a92781b9b))
* **ci:** npm workspaces構成向けにreusable-ci.ymlのキャッシュ/インストールを修正 ([#6](https://github.com/bamiyanapp/dev-standards/issues/6)) ([7751d32](https://github.com/bamiyanapp/dev-standards/commit/7751d32141636fa229812e40eeab9853e96fd795))
* **ci:** PRのcommitlint検証がマージコミットを見てしまう問題を修正 ([#12](https://github.com/bamiyanapp/dev-standards/issues/12)) ([1cf03e9](https://github.com/bamiyanapp/dev-standards/commit/1cf03e9aa191bb0d3f65a0155535e2fd24b746ee))
* **ci:** pull_requestイベントでのGITHUB_REF起因のリリース未発行を修正 ([8a5ac2e](https://github.com/bamiyanapp/dev-standards/commit/8a5ac2e340bdfec3de250a5a23a99c52e46d2e06))
* **ci:** semantic-release実行のNode.jsバージョンをnode_versionから分離 ([2ad6957](https://github.com/bamiyanapp/dev-standards/commit/2ad6957783c7ed9518777414706ea0242fd12881))
* **ci:** workflows権限をmergeジョブのみに限定 ([3fb250b](https://github.com/bamiyanapp/dev-standards/commit/3fb250bbee105f918d9b6146e887347b12d522fc))
* CLAUDE.md整合性修正 + actionlint導入 + changelog変換の実体化 ([#37](https://github.com/bamiyanapp/dev-standards/issues/37)) ([761a25f](https://github.com/bamiyanapp/dev-standards/commit/761a25fbdc5e74f0594b6ef244b621cb4847cbd3))
* commit_msg2.txt の削除 ([d12ef9f](https://github.com/bamiyanapp/dev-standards/commit/d12ef9f42748a5f7c49a305d2b085d49bdfa03d6))
* **release:** GitHub Release作成を同名タグ存在時に更新へフォールバックする ([#46](https://github.com/bamiyanapp/dev-standards/issues/46)) ([a045360](https://github.com/bamiyanapp/dev-standards/commit/a045360b394cb6b001c7a226c62826bb55c13f92))
* **release:** semantic-releaseをmainへのpush時に実行する ([#43](https://github.com/bamiyanapp/dev-standards/issues/43)) ([1c19b2c](https://github.com/bamiyanapp/dev-standards/commit/1c19b2cc1dae50e0b12d089a99922d6c147c4ff6))
* **release:** リリースタグ名をpackage.jsonのversionから導出する ([#45](https://github.com/bamiyanapp/dev-standards/issues/45)) ([68b9a3d](https://github.com/bamiyanapp/dev-standards/commit/68b9a3d3fcd77e4038c09688167243b6522ab9d9))
* **release:** 保護されたbase_branchでもreleaseジョブが動くようにする ([#44](https://github.com/bamiyanapp/dev-standards/issues/44)) ([a18acb6](https://github.com/bamiyanapp/dev-standards/commit/a18acb66c3163410408a26ceeb6f1ef9a1de15fc))
* **validate:** CLAUDE.mdのSkills節と.claude/skills/の乖離を検知する ([c02129d](https://github.com/bamiyanapp/dev-standards/commit/c02129d05def7337ecd66bf7a20a0d7aa3eb0982))


### Features

* bootstrapスクリプトとsemantic-release共通設定を追加 ([#40](https://github.com/bamiyanapp/dev-standards/issues/40)) ([5d8109d](https://github.com/bamiyanapp/dev-standards/commit/5d8109dc7f80c22691af22a7fb648289b5684d7f))
* **cd:** CDのrelease同期処理をreusable workflow化 ([#5](https://github.com/bamiyanapp/dev-standards/issues/5)) ([cb493fd](https://github.com/bamiyanapp/dev-standards/commit/cb493fd9e8dd41fd7a10a1e31b9392fa491def5a))
* **cd:** GitHub Pagesデプロイの複合actionを追加する ([#48](https://github.com/bamiyanapp/dev-standards/issues/48)) ([433e1bd](https://github.com/bamiyanapp/dev-standards/commit/433e1bd2ff3fb5ebadaf8eb770e155270daa99aa)), closes [#33](https://github.com/bamiyanapp/dev-standards/issues/33)
* **cd:** マージ前の作業ブランチでバージョン更新する方式に変更 ([7c40c3b](https://github.com/bamiyanapp/dev-standards/commit/7c40c3b53a582f9677a055c85c566f694decfd29))
* ci.ymlのジョブをreusable workflowとして切り出す ([#3](https://github.com/bamiyanapp/dev-standards/issues/3)) ([554e38c](https://github.com/bamiyanapp/dev-standards/commit/554e38ce1bf92f5c40f45d5a57d280d335cea85f))
* **ci:** reusable-ci.ymlにE2Eテスト対応を追加 ([#8](https://github.com/bamiyanapp/dev-standards/issues/8)) ([3969ca2](https://github.com/bamiyanapp/dev-standards/commit/3969ca2ccda20392d56f623137cf74b660f76e12))
* **ci:** reusable-ci.ymlのmerge jobにenable_auto_mergeトグルを追加 ([8cc618e](https://github.com/bamiyanapp/dev-standards/commit/8cc618ea7849ffc4b7630d0ba71b8f39ea7bb7c5))
* **ci:** reusable-ci.ymlをElectric-Chair-Arena向けに拡張 ([#4](https://github.com/bamiyanapp/dev-standards/issues/4)) ([5f614dd](https://github.com/bamiyanapp/dev-standards/commit/5f614ddbc961cb0f8df1534b390cf533da760597))
* **git-workflow:** 作業終了フローにPR作成の自動実行を追加 ([e656142](https://github.com/bamiyanapp/dev-standards/commit/e656142749585974d4e39ab7984ce20681ee1d3c))
* **release:** dev-standards自身のリリース運用を導入 ([#47](https://github.com/bamiyanapp/dev-standards/issues/47)) ([d51607b](https://github.com/bamiyanapp/dev-standards/commit/d51607ba2b837aa2677ae646cdc18462f44855d3)), closes [#32](https://github.com/bamiyanapp/dev-standards/issues/32)
* reusable-ci.ymlのパッケージ構成を柔軟化し自身でdogfooding ([#41](https://github.com/bamiyanapp/dev-standards/issues/41)) ([a04f333](https://github.com/bamiyanapp/dev-standards/commit/a04f333cc02688c71df162452275a5c3af0a2df7))
* SKILL.md/CLAUDE.md検証とCI・自動マージを追加 ([#2](https://github.com/bamiyanapp/dev-standards/issues/2)) ([3e86dc3](https://github.com/bamiyanapp/dev-standards/commit/3e86dc36903c6e7a1120ec94283445e89fd6df66))
* **skills:** プロダクト固有ルールを共通Skillへマージ ([#39](https://github.com/bamiyanapp/dev-standards/issues/39)) ([d986759](https://github.com/bamiyanapp/dev-standards/commit/d98675997b80af64a7907766027cf4a5f37023ec))
* 共通ignore/settings/CI仕様書を追加 ([#11](https://github.com/bamiyanapp/dev-standards/issues/11)) ([17d7d38](https://github.com/bamiyanapp/dev-standards/commit/17d7d38566bfb9c21a05a8bdba20dbbf45fe62a9))
* 開発ルール共通化の基盤ファイルを追加 ([dddf0a2](https://github.com/bamiyanapp/dev-standards/commit/dddf0a201fba0ec7d5b4cc6df33c45572afd3934))
