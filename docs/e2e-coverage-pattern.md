# E2Eテストのカバレッジ収集パターン（`monocart-reporter`）

`reusable-ci.yml`の`frontend-e2e-test`ジョブは「Show E2E coverage」ステップを持つ。このステップは`<frontend_dir>/coverage/coverage-summary.json`を読む。これはfrontend-testのユニットテストカバレッジと同じ形式・パスである。読み取った値を使い、Job Summaryへの表示・`e2e_coverage_threshold`によるゲートを行う（README.md「入力パラメータ」参照）。

この仕組みは「Playwright側でその形式のファイルを実際に出力する」構成が各プロダクトで組まれていることが前提である。単に`enable_e2e_test: true`にしただけでは何も出力されない。「coverage/coverage-summary.json が見つからないため、カバレッジ表示をスキップします」というメッセージだけがJob Summaryに残る。この状態ではE2Eカバレッジが恒常的に算出できない（複数プロダクトで同じ症状が確認されている）。本ドキュメントは、この出力を実際に行うための具体的な設定手順を示す。

## 全体像

1. Playwrightの`reporter`に`monocart-reporter`を追加し、`coverage`オプションで出力先・レポート種別を指定する
2. `shared/e2e/coverageFixture.js`（本ドキュメント）をsymlinkする。各E2Eスペックファイルの`test`/`expect`をこれ経由のものへ差し替える。これによりテスト実行中のJS/CSSカバレッジをChrome DevTools Protocol経由で収集する。monocart-reporterのグローバルレポートへ追加する
3. ビルド成果物にソースマップを含める（`vite.config.js`の`build.sourcemap: true`）。無いとカバレッジがビルド後のバンドルファイル単位でしか集計されず、`coverage_check_per_file`によるソースファイル単位のゲートが機能しない

## 1. 依存関係の追加

```sh
npm install --save-dev monocart-reporter
```

## 2. `playwright.config.js`

設定そのものを、`shared/e2e/playwright.config.base.js`の`buildPlaywrightConfig()`として配布している。`coverageFixture.js`と対で正しく動く設定を、書き写させないためである。書き写しの過程で`entryFilter`が緩くなり、他アプリのコードがカバレッジへ混入する不具合が起きた（[bamiyanapp/dev-standards#1360](https://github.com/bamiyanapp/dev-standards/issues/1360)）。

```js
import { defineConfig, devices } from '@playwright/test';
import { buildPlaywrightConfig } from './playwright.config.base.js'; // symlink先

export default buildPlaywrightConfig({
  defineConfig,
  devices,
  reportName: 'アプリ名 E2E Report',
  basePath: '/サブパス/', // vite.config.jsのbaseと同じ値（必須）
});
```

- `defineConfig`・`devices`は、参照側のnode_modulesから解決させるため、引数で渡す
- `basePath`は必須である。未指定や、`/`で始まり`/`で終わる形でない場合は、例外を投げる
- `entryFilter`は、`new URL(entry.url).pathname.startsWith(`${basePath}assets/`)`である。`includes()`は使わない。`basePath: '/'`のとき、`includes('/assets/')`では別アプリにも一致してしまう。例えば`/other/assets/x.js`である
- 別オリジンのURLや、`data:`・`blob:`でも、例外を投げずに対象外にする
- jsonレポーター（下記「失敗の概要」）を含む
- `monocart-reporter`の`coverage`設定も含む。`outputDir: './coverage'`・`json-summary`・`sourceFilter`である

### 実行形態

- 本番環境に対して実行する場合は、環境変数`E2E_BASE_URL`を`baseURL`にする
- ローカルの`vite preview`に対して実行する場合は、`webServer`を渡す。`baseURL`は`webServer.url`になる

```js
export default buildPlaywrightConfig({
  defineConfig, devices, reportName: 'アプリ名 E2E Report', basePath: '/',
  webServer: { command: 'npm run preview', url: 'http://localhost:4173' },
  overrides: { retries: 2 }, // 任意。トップレベルを浅く上書きする
});
```

`coverage.outputDir`は`check-coverage-threshold`複合actionの`working-directory`からの相対パスで解決される。この`working-directory`は`frontend_dir`である。そのため、`./coverage`のままでよい（`reusable-ci.yml`側の変更は不要）。

### 失敗の概要（Job Summary・PRコメント）

スマホオンリー環境では、HTMLレポート（zip）を閲覧できない。`reusable-ci.yml`の`frontend-e2e-test` jobは、失敗したテストの題名・エラーメッセージ・該当行を、Job SummaryとPRコメントへ出す（issue #1365）。

- `buildPlaywrightConfig()`は、jsonレポーター（`outputFile: 'playwright-report/results.json'`）を含む。自前の設定を使う場合は、同じレポーターを足す
- reporterは、設定ファイルの`reporter`配列へ足す。CLIの`--reporter`で足してはいけない。`--reporter`は設定ファイルの配列を丸ごと置き換えるため、`monocart-reporter`が外れて、E2Eカバレッジが出なくなる
- `results.json`が無いときは、警告を出してスキップする。失敗にはしない
- 再試行で成功したテスト（flaky）は、失敗に含めず、件数だけを出す
- エラーメッセージのANSIエスケープシーケンスは除去する。`E2E_SECRETS_JSON`の値がメッセージに含まれていたら、伏せ字にする

## 3. `vite.config.js`にソースマップを追加

```js
export default defineConfig({
  build: {
    sourcemap: true,
  },
  // ...
});
```

ソースマップが無い場合、monocart-reporterはカバレッジをビルド後のバンドルファイル（`assets/index-xxxxx.js`等）単位でしか集計できない。ソースマップがあれば、実際の`src/App.jsx`等のソースファイル単位まで正しく遡って集計される（`coverage_check_per_file`によるファイル単位ゲートが機能するために必須）。

## 4. E2Eスペックファイルでカバレッジ収集fixtureを使う

`sync-manifest.local.json`へ追加してsymlinkする。

```json
{ "source": "shared/e2e/coverageFixture.js", "target": "frontend/e2e/coverageFixture.js" }
```

各スペックファイルのimportを`@playwright/test`から`./coverageFixture.js`へ差し替える。

```js
// 変更前
// import { test, expect } from '@playwright/test';

// 変更後
import { test, expect } from './coverageFixture.js'; // symlink
```

`coverageFixture.js`が自動fixtureとして各テストの前後で呼び出す。具体的には`page.coverage.startJSCoverage()`/`startCSSCoverage()`を呼ぶ。`stopJSCoverage()`/`stopCSSCoverage()`も呼ぶ。収集結果は`monocart-reporter`の`addCoverageReport()`でグローバルレポートへ追加する。Chromiumプロジェクト（`playwright.config.js`の`projects[].name`が`'chromium'`）を考える。それ以外では、`page.coverage`のChrome DevTools Protocol APIが使えない。そのため自動的に収集をスキップする（既存の`test`/`expect`と完全互換のため、既存のテストコード自体の変更は不要）。

### `NODE_OPTIONS=--preserve-symlinks`が必要

`coverageFixture.js`はsymlink経由でdev-standards submodule配下から読み込まれる。しかしNode（ESM）は既定でシンボリックリンクの実体パス（`dev-standards/`配下）を起点に`node_modules`を探索する。このため、参照側リポジトリの`node_modules`に存在する`@playwright/test`・`monocart-reporter`の解決に失敗することがある。エラー例は`Error: Cannot find package '@playwright/test'`である。`package.json`の`test:e2e`スクリプトへ`--preserve-symlinks`を付与して回避する。`vite.config.js`の`resolve.preserveSymlinks`と同種の問題である（[`shared-ui-components.md`](shared-ui-components.md)参照）。

```json
{ "scripts": { "test:e2e": "NODE_OPTIONS=--preserve-symlinks playwright test" } }
```

## 5. 動作確認

```sh
npm run build   # ソースマップ付きビルド
npm run test:e2e
cat coverage/coverage-summary.json   # totalと各src/*.jsxファイルのpctが入っていることを確認
```

`node_modules/**`のエントリが混入している場合は`sourceFilter`の設定を見直す。ソースファイル単位のエントリ（`src/components/Foo.jsx`等）が出てこない場合を考える。ビルド後のバンドルファイル単位（`assets/index-xxxxx.js`）しか出てこない場合である。その場合はソースマップが有効になっているか確認する。

## 複数アプリ構成（1リポジトリに複数の独立したSPA）の場合

examinationのように、1リポジトリに複数の独立したVite SPAを持つ構成がある。全アプリが同一の本番ドメイン上で動く場合、`entryFilter`を「リポジトリ名」単位ではなく**アプリごとの`base`パス**単位で絞る必要がある。

`buildPlaywrightConfig()`は、`basePath`を必須にして、アプリごとの`base`パスで絞る。

各アプリの呼び出し側（`playwright.config.js`）で、自身の`vite.config.js`と同じ`base`値を渡す。

```js
export default buildPlaywrightConfig({
  defineConfig,
  devices,
  reportName: 'アプリ名 E2E Report',
  basePath: '/サブパス/', // vite.config.jsのbaseと同じ値
});
```

`basePath`を渡さず全アプリで同じ`entryFilter`（例: `/assets/`のみでの判定）を使うとどうなるか。あるアプリのE2Eテスト実行中に、別アプリのJSが何らかの理由（Service Workerの先読み、ブラウザコンテキストの再利用等）で実行された場合、そのカバレッジまで巻き込まれてしまう。この結果、カバレッジの集計対象（`Total`）が通常時の数十倍に跳ね上がる異常が実際に発生した。examinationで2回再現している（bamiyanapp/examination#687、dev-standards#1360）。

## 認証済みの状態を作る（`shared/e2e/auth.js`）

Cognito + Lambda@Edgeの認証パターン（[`serverless-static-site-pattern.md`](serverless-static-site-pattern.md)）を採るプロダクトでは、`loginWithCookies()`で、対話的なログインを自動操作せずに、認証済みの状態を作れる。事前に取得したrefresh token等を、Cookieとして注入する。

```js
import { loginWithCookies } from './auth.js'; // symlink先

test.beforeEach(async ({ context }) => {
  await loginWithCookies(context, { baseURL: process.env.E2E_BASE_URL, cookies: { refresh_token: process.env.E2E_REFRESH_TOKEN } });
});
```

- Cookie名は引数である。値を環境変数から直接読まない。どのSecretを使うかは、参照側が決める
- 値が空のCookieは注入しない。すべて空なら、例外を投げる。Secretが未設定であることに気づける

## 実例

uchi-stock（`bamiyanapp/uchi-stock`、issue #412・PR #413）が単一アプリ構成の実装例。examination（`bamiyanapp/examination`、issue #687）が複数アプリ構成の実装例。
