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
