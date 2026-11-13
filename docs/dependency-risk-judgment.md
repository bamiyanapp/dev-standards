# 依存更新Risk判定

`reusable-ci.yml`は`dependency-risk-summary` jobを持つ。このjobは`enable_dependency_risk_summary`・`enable_dependency_risk_gating`の2入力を持つ。本ドキュメントは、依存更新Risk判定の仕組み全体の入口であり、他ドキュメントとの位置関係・共通部分（外部データソース一覧）のみを扱う。背景はissue #645「OSS依存更新の自動安全判定・エスカレーション基盤」（[bamiyanapp/dev-standards#645](https://github.com/bamiyanapp/dev-standards/issues/645)）を参照。両入力自体の一覧（デフォルト値等）は[`reusable-workflows-reference.md`](reusable-workflows-reference.md)を参照する。

本仕組みは大きく2つに分かれる（issue #1355で本ドキュメントから分割）。

- [`dependency-risk-judgment-renovate-logic.md`](dependency-risk-judgment-renovate-logic.md): Renovate等が作成した依存更新PR単位で動作する判定ロジック（`dependency-risk-summary` job本体）。判定フロー全体図・適用リスク/維持リスクの判定マトリクス・merge gate連携・自動クローズを扱う
- [`dependency-risk-judgment-periodic-scans.md`](dependency-risk-judgment-periodic-scans.md): PRの作成を待たずに動作する定期スキャン（Renovateの提案に依存しない推移的依存のセーフティネット）。3つの定期スキャン系セーフティネットの関係・dev-standards自身のリリース時点でのRisk判定履歴生成を扱う

## 外部データソース一覧

本仕組みが参照する外部APIを一覧にする。個別の使われ方は、[`dependency-risk-judgment-renovate-logic.md`](dependency-risk-judgment-renovate-logic.md)の各節を参照する。いずれも認証不要の公開API・公開データセットであり、APIキー等の秘密情報は使わない。

| データソース | 取得内容 | 使用スクリプト | URL |
|---|---|---|---|
| OSV.dev | CVE/CVSSの既知の脆弱性情報（新旧バージョン両方） | `dependency-vulnerability-info.js` | `api.osv.dev/v1` |
| CISA KEVカタログ | 実際に悪用が確認された脆弱性（Known Exploited Vulnerability）かどうか | `dependency-exploit-info.js` | `www.cisa.gov/.../known_exploited_vulnerabilities.json` |
| EPSS API | 脆弱性が実際に悪用される確率スコア（EPSS） | `dependency-exploit-info.js` | `api.first.org/data/v1/epss` |
| npm registry | `deprecated`フィールド（サポート終了検知） | `dependency-deprecation-info.js`・`dependency-deprecation-scan.js` | `registry.npmjs.org/{name}` |
| npm registry | `time.modified`（最終リリース日、放置検知） | `dependency-staleness-info.js` | `registry.npmjs.org/{name}` |
| npm registry | `_npmUser`（公開者情報、メンテナ変更・Trusted Publishing検知） | `dependency-maintainer-info.js` | `registry.npmjs.org/{name}` |
| npm registry | 週次の全体スキャン対象パッケージ情報 | `dependency-full-scan.js` | `registry.npmjs.org/{name}` |
| OpenSSF Scorecard公開データセットAPI | パッケージの質的なメンテナンス状態スコア（10点満点） | `dependency-scorecard-info.js` | `api.securityscorecards.dev/projects/github.com/{owner}/{repo}` |
| Node.js公式リリース一覧 | 稼働中Node.jsバージョンの最新性チェック | `runtime-version-scan.js` | `nodejs.org/dist/index.json` |
| nodejs/security-wg（GitHub） | Node.js本体の既知脆弱性データベース | `runtime-version-scan.js` | `raw.githubusercontent.com/nodejs/security-wg/main/vuln/core/index.json` |
| dev-standards自身のリポジトリ | dev-standards自身のリリース時点でのRisk判定履歴（重複判定の回避） | `dependency-risk-history-lookup.js` | `raw.githubusercontent.com/bamiyanapp/dev-standards/...` |

一方、以下は外部通信をせず、`package-lock.json`等の既存ファイル内の情報のみで判定する。

- `dependency-package-anomaly-info.js`（新規install script検知）: `package-lock.json`内の`hasInstallScript`フラグ比較のみ
- `dependency-sbom-summary.js`: SBOM生成自体は別ツール（CI側の`@cyclonedx/cdxgen`等）の出力を要約するのみ
- `dependency-update-info.js`・`github-actions-update-info.js`: いずれも`package-lock.json`・workflowファイルのdiffのみ
