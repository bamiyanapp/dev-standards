// Playwrightの設定の土台。monocart-reporterの設定は、coverageFixture.jsと対で正しく動くものであり、
// 片方だけを配布して片方を書き写させると、書き写しの過程で条件が緩くなる事故が起きる
// （entryFilterが緩くなり、他アプリのコードがカバレッジへ混入した。dev-standards#1360・examination#687）。
// そのため、設定そのものを配布する。docs/e2e-coverage-pattern.mdを参照。
//
// 使い方（参照側のplaywright.config.js）:
//   import { defineConfig, devices } from '@playwright/test';
//   import { buildPlaywrightConfig } from './playwright.config.base.js'; // symlink
//   export default buildPlaywrightConfig({ defineConfig, devices, reportName: 'アプリ名 E2E Report', basePath: '/sub/' });
//
// defineConfig・devicesは、参照側のnode_modulesから解決させるため、引数で受け取る
// （symlink経由では、この配布物から@playwright/testをimportできない）。

/** basePathが「/で始まり/で終わる」形であることを確かめる。そうでなければ例外を投げる（黙って既定値を使わない） */
export function validateBasePath(basePath) {
  if (typeof basePath !== 'string' || !basePath.startsWith('/') || !basePath.endsWith('/')) {
    throw new Error(`basePathは必須で、'/'で始まり'/'で終わる形（例: '/' や '/sub/'）で指定してください。vite.config.jsのbaseと同じ値です。受け取った値: ${JSON.stringify(basePath)}`);
  }
  return basePath;
}

/**
 * カバレッジの対象にするエントリの判定。自アプリのアセット（`<basePath>assets/`配下）だけを通す。
 * includes()ではなく、pathnameの先頭一致を使う。basePathが'/'のとき、includes('/assets/')では
 * 同一オリジン上の別アプリ（/other/assets/x.js）にも一致してしまう。
 * 別オリジンのURLや、data:・blob:等の特殊なURLでも、例外を投げずにfalseを返す
 */
export function makeEntryFilter(basePath) {
  const prefix = `${validateBasePath(basePath)}assets/`;
  return (entry) => {
    try {
      const url = new URL(entry.url);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.pathname.startsWith(prefix);
    } catch {
      return false;
    }
  };
}

/**
 * options:
 *   defineConfig, devices: @playwright/testのもの（注入する）
 *   reportName: monocart-reporterのレポート名
 *   basePath: 必須。vite.config.jsのbaseと同じ値（'/'で始まり'/'で終わる）
 *   webServer: 任意。ローカルのpreviewサーバーに対して実行する構成用（{ command, url, ... }）。
 *     baseURLはwebServer.url。無ければ、環境変数E2E_BASE_URL（本番環境に対して実行する構成）
 *   overrides: 任意。retries等の上書き（トップレベルを浅く上書きする。useやreporterを渡すと置き換わる）
 */
export function buildPlaywrightConfig({ defineConfig, devices, reportName, basePath, webServer, overrides = {} }) {
  validateBasePath(basePath);
  if (typeof defineConfig !== 'function' || !devices) {
    throw new Error('defineConfigとdevicesは、参照側の@playwright/testのものを渡してください。');
  }
  return defineConfig({
    testDir: './e2e',
    retries: process.env.CI ? 1 : 0,
    reporter: [
      ['html'],
      // 失敗したテストの理由を、Job SummaryとPRコメントへ出すために必要（reusable-ci.ymlの失敗の概要）
      ['json', { outputFile: 'playwright-report/results.json' }],
      ['monocart-reporter', {
        name: reportName,
        coverage: {
          // frontend-testと同じパスに出力する（check-coverage-threshold複合actionの既定）
          outputDir: './coverage',
          reports: [['json-summary'], ['console-summary']],
          entryFilter: makeEntryFilter(basePath),
          // node_modulesを除外し、自プロダクトのsrc/配下のみを対象にする
          sourceFilter: { '**/node_modules/**': false, 'src/**': true },
        },
      }],
    ],
    use: { baseURL: webServer ? webServer.url : process.env.E2E_BASE_URL },
    // coverageFixture.jsは、projectNameが'chromium'のときだけカバレッジを収集する
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    ...(webServer ? { webServer: { reuseExistingServer: !process.env.CI, ...webServer } } : {}),
    ...overrides,
  });
}
