# 独立ビルドReactアプリのスキャフォールドテンプレート（`templates/vite-react-app/`）

「ページごとに独立ビルドのReact（Vite）アプリ」という構成（examinationの`app/top`・`app/mock-interviews`等）を新規に増やす際の雛形。Vite・React 19・Bootstrap 5.3・vitest・Testing Library・oxlintという同一のツール構成をゼロから手で再現する手間を省く。ダークモード対応等のBootstrap向け共通テーマは`docs/shared-ui-components.md`の`shared/ui/bootstrap-theme.css`を別途組み合わせる。

`examination#78`のように、MkDocs等の静的サイトの一部ページだけをReactアプリへ段階移行する構成、あるいは複数の独立ページを持つプロダクト全体を最初からこの構成で作る場合のどちらにも使える。

## 含まれるもの・含まれないもの

- 含まれる: ビルドツール一式の設定ファイル（`package.json`・`vite.config.js`・`.oxlintrc.json`・`.gitignore`）、PWA白画面対策込みの`index.html`（`docs/pwa-initial-loading-indicator.md`参照）、最小限の`src/main.jsx`・`src/App.jsx`・`src/index.css`・`src/setupTests.js`・`src/App.test.jsx`
- **含まれない**: `UserMenu.jsx`等のプロダクト固有の値（API URL、認証方式等）を持つコンポーネント。`NavigationOverlay`・`BackToTop`・`SpeculationRules`等の横断的UIコンポーネントは`docs/shared-ui-components.md`・`docs/service-worker-update-pattern.md`の手順で別途symlink化する（`src/App.jsx`内にコメントで組み込み例を記載済み）

## 使い方

1. テンプレート一式を新しいアプリのディレクトリへコピーする。

   ```sh
   cp -r dev-standards/templates/vite-react-app/. app/<new-app-name>/
   ```

2. プレースホルダを置換する。

   - `__APP_NAME__`: `package.json`の`name`（例: `my-app-<new-app-name>`）、`index.html`の`<title>`、`src/App.jsx`の見出しへ、それぞれ適切な値を設定する
   - `__BASE_PATH__`: `vite.config.js`の`base`。静的サイトの特定サブパスへビルド成果物を配置する場合はそのパス（例: `/settings/foo/`）、サイトルート自体に配置する場合は`base`オプション自体を削除する

   ```sh
   cd app/<new-app-name>
   grep -rl '__APP_NAME__' . | xargs sed -i 's/__APP_NAME__/<実際の値>/g'
   sed -i 's|__BASE_PATH__|<実際のbase path>|' vite.config.js
   ```

3. `npm install`後、`npm run lint`・`npm test`・`npm run build`が通ることを確認する。
4. このリポジトリのCI（`reusable-ci.yml`の`packages`入力）へ新しいアプリのディレクトリを追加する（`docs/cicd-pipeline-specification.md`参照）。
5. 横断的UIコンポーネント（`NavigationOverlay`等）・PWAキャッシュ更新パターンを使う場合は、`sync-manifest.local.json`へ該当エントリを追加し`node dev-standards/scripts/bootstrap.js`を実行する（`docs/shared-ui-components.md`・`docs/service-worker-update-pattern.md`参照）。

## 検証

`templates/vite-react-app/`一式を実際にコピーしプレースホルダを置換した状態で、`npm install`・`npm run lint`・`npm test`・`npm run build`がいずれも成功することを確認済み。
