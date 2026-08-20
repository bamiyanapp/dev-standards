# 標準技術スタック（新規プロジェクトのクイックスタート）

新しいプロダクトを立ち上げる際、ゼロから技術選定・雛形作成をせずに最短で始められるよう、examination（[bamiyanapp/examination](https://github.com/bamiyanapp/examination)）で検証済みの構成を「標準スタック」としてまとめる。個々の要素は既にdev-standards配下に個別ドキュメント・雛形として存在するため、本ドキュメントはそれらを一望できる索引と、着手手順のチェックリストを兼ねる。

対象は、家族・チーム等の限定的な範囲で使う小規模なWebプロダクト（不特定多数への公開・大規模スケールは想定しない）。

## スタック一覧

| レイヤー | 技術 | 詳細ドキュメント |
|---|---|---|
| フロントエンド | React 19 + Vite + Tailwind CSS v4 + daisyUI 5、ページごとに独立ビルドするアプリ構成 | `docs/vite-react-app-template.md` |
| フロントエンド共通コンポーネント | ナビゲーション・PWA関連コンポーネント等をsymlinkで共有 | `docs/shared-ui-components.md` |
| フロントエンド共通規約 | 共通フォント、トップページ必須表示項目（バージョン・更新日時） | `docs/frontend-ui-conventions.md` |
| テスト | vitest + Testing Library（フロントエンド）、oxlint（lint） | `docs/vite-react-app-template.md` |
| PWA | 初期ローディング表示、Service Workerの更新反映パターン、ホーム画面アイコンの生成手順 | `docs/pwa-initial-loading-indicator.md`、`docs/service-worker-update-pattern.md`、`docs/pwa-icon-generation-pattern.md` |
| インフラ・認証 | S3 + CloudFront + Cognito(Google) + Lambda@Edge、Serverless Framework v3（OSS版） | `docs/serverless-static-site-pattern.md` |
| 認証まわりの個別パターン | ログインCSRF対策、別オリジンAPIへの短命トークン認証、日次レート制限 | `docs/oauth-csrf-nonce-pattern.md`、`docs/short-lived-bearer-token-pattern.md`、`docs/daily-rate-limit-pattern.md` |
| バックエンド実装上の罠 | Node.js `https.request`のレスポンスボディはBufferのまま集めてから一度だけデコードする（マルチバイト文字のチャンク境界文字化け対策） | `docs/https-response-buffer-encoding-pattern.md` |
| LLM API連携 | dual-format JSON応答の同時生成、緩いJSON出力のパース救済 | `docs/llm-dual-format-response-pattern.md` |
| CI/CD | reusable-ci.yml（lint/test/build/自動マージ）+ reusable-cd.yml（semantic-release） | `docs/cicd-pipeline-specification.md` |
| コミット規約 | Conventional Commits（commitlint） | リポジトリルート`commitlint.config.cjs`、`.claude/skills/git-conventions` |
| 開発フロー | Issue駆動、Git運用、コードレビュー観点等（Claude Code向け） | リポジトリルート`CLAUDE.md`、`.claude/skills/` |

## 新規プロジェクトの立ち上げ手順（最短ルート）

1. **リポジトリ作成・dev-standardsの取り込み**

   ```sh
   git submodule add -b main https://github.com/bamiyanapp/dev-standards.git dev-standards
   node dev-standards/scripts/bootstrap.js
   ```

   `CLAUDE.md`を新規作成し先頭で`@dev-standards/CLAUDE.md`をインポートする（README.md「利用方法」参照）。

2. **フロントエンドアプリの雛形をコピー**（ページごとに独立ビルドする構成にする場合）

   `docs/vite-react-app-template.md`の手順で`templates/vite-react-app/`をコピーし、プレースホルダを置換する。複数ページを持つ場合はページごとにこれを繰り返す。

3. **横断的UIコンポーネント・PWAパターンの適用**

   ナビゲーション・共有ボタン・共通フォント・初期ローディング表示・Service Worker更新通知等が必要なら、`sync-manifest.local.json`へエントリを追加し`node dev-standards/scripts/bootstrap.js`を再実行する（`docs/shared-ui-components.md`・`docs/pwa-initial-loading-indicator.md`・`docs/service-worker-update-pattern.md`参照）。

4. **ログインが必要な場合はインフラ構成を導入**

   `docs/serverless-static-site-pattern.md`に沿って`auth-stack`（Cognito）・`site-stack`（S3+CloudFront+Lambda@Edge）を構築する。別バックエンドAPI（LINE bot・外部AI連携等）が必要な場合は同ドキュメントの「別オリジンのバックエンドAPIが必要な場合」を参照し、`docs/short-lived-bearer-token-pattern.md`で接続する。

5. **CI/CDの有効化**

   `docs/cicd-pipeline-specification.md`に沿って`.github/workflows/ci.yml`・`cd.yml`から`reusable-ci.yml`・`reusable-cd.yml`を`uses:`で呼び出す。`packages`入力（ページごとに独立ビルドする構成の場合）・`enable_release`（semantic-release運用する場合）等、プロダクトに応じた入力を選ぶ。

6. **各種lint/test/buildが通ることを確認してから最初のPRを作成する**

## この索引に無いもの

上記に当てはまらない個別の技術判断（特定の外部API連携の設計、プロダクト固有のドメインロジック等）は、この標準スタックの対象外。プロダクトごとの`infra/README.md`・`CLAUDE.md`（プロジェクト固有ルール）に記載する。

新しいプロダクトで得られた知見が複数プロダクトへ再利用できると判断した場合は、既存ドキュメントへの追記または新規ドキュメント追加を検討し、本ドキュメントの一覧へ追加する。
