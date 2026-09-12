# E2Eテストのカバレッジ収集パターン（`monocart-reporter`）

`reusable-ci.yml`の`frontend-e2e-test`ジョブは「Show E2E coverage」ステップで`<frontend_dir>/coverage/coverage-summary.json`（frontend-testのユニットテストカバレッジと同じ形式・パス）を読み、Job Summaryへの表示・`e2e_coverage_threshold`によるゲートを行う（README.md「入力パラメータ」参照）。

この仕組みは「Playwright側でその形式のファイルを実際に出力する」構成が各プロダクトで組まれていることが前提だが、単に`enable_e2e_test: true`にしただけでは何も出力されず、「coverage/coverage-summary.json が見つからないため、カバレッジ表示をスキップします」というメッセージだけがJob Summaryに残り、E2Eカバレッジが恒常的に算出できない状態に陥る（複数プロダクトで同じ症状が確認されている）。本ドキュメントは、この出力を実際に行うための具体的な設定手順を示す。

## 全体像

1. Playwrightの`reporter`に`monocart-reporter`を追加し、`coverage`オプションで出力先・レポート種別を指定する
2. `shared/e2e/coverageFixture.js`（本ドキュメント）をsymlinkし、各E2Eスペックファイルの`test`/`expect`をこれ経由のものへ差し替える（テスト実行中のJS/CSSカバレッジをChrome DevTools Protocol経由で収集し、monocart-reporterのグローバルレポートへ追加する）
3. ビルド成果物にソースマップを含める（`vite.config.js`の`build.sourcemap: true`）。無いとカバレッジがビルド後のバンドルファイル単位でしか集計されず、`coverage_check_per_file`によるソースファイル単位のゲートが機能しない

## 1. 依存関係の追加

```sh
npm install --save-dev monocart-reporter
```

## 2. `playwright.config.js`

```js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  reporter: [
    ['html'],
    ['monocart-reporter', {
      name: 'アプリ名 E2E Report',
      outputFile: './monocart-report/index.html',
      coverage: {
        // frontend-testと同じパスに出力する（check-coverage-threshold複合actionの既定）
        outputDir: './coverage',
        reports: [
          ['json-summary'],
          ['console-summary'],
        ],
        // ビルド成果物（自プロダクトのオリジン配下のみ）を対象にする。CDNやAPIへの
        // リクエスト等、対象外のエントリまでレポートに含めないようentryFilterで絞る
        entryFilter: (entry) => entry.url.includes('/<リポジトリ名>/'),
        // node_modules（依存パッケージのソース）を除外し、自プロダクトのsrc/配下のみを
        // 対象にする。省略するとnode_modules配下の大量のファイルがレポートに混入する
        sourceFilter: {
          '**/node_modules/**': false,
          'src/**': true,
        },
      },
    }],
  ],
  use: {
    baseURL: 'http://localhost:4173/<base-path>/',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173/<base-path>/',
    reuseExistingServer: !process.env.CI,
  },
});
```

`coverage.outputDir`は`check-coverage-threshold`複合actionの`working-directory`（＝`frontend_dir`）からの相対パスで解決されるため、`./coverage`のままでよい（`reusable-ci.yml`側の変更は不要）。

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

`coverageFixture.js`が自動fixtureとして各テストの前後で`page.coverage.startJSCoverage()`/`startCSSCoverage()`・`stopJSCoverage()`/`stopCSSCoverage()`を呼び、収集結果を`monocart-reporter`の`addCoverageReport()`でグローバルレポートへ追加する。Chromiumプロジェクト（`playwright.config.js`の`projects[].name`が`'chromium'`）以外では、`page.coverage`のChrome DevTools Protocol APIが使えないため自動的に収集をスキップする（既存の`test`/`expect`と完全互換のため、既存のテストコード自体の変更は不要）。

## 5. 動作確認

```sh
npm run build   # ソースマップ付きビルド
npm run test:e2e
cat coverage/coverage-summary.json   # totalと各src/*.jsxファイルのpctが入っていることを確認
```

`node_modules/**`のエントリが混入している場合は`sourceFilter`の設定を見直す。ソースファイル単位のエントリ（`src/components/Foo.jsx`等）ではなくビルド後のバンドルファイル単位（`assets/index-xxxxx.js`）しか出てこない場合はソースマップが有効になっているか確認する。

## 実例

uchi-stock（`bamiyanapp/uchi-stock`、issue #412）が本パターンの実装例。
