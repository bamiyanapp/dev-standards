import { test as testBase, expect } from '@playwright/test';
import { addCoverageReport } from 'monocart-reporter';

// Playwright（Chromiumのみ）のE2Eテスト実行中にJS/CSSカバレッジを収集し、
// monocart-reporterのグローバルカバレッジレポートへ追加する自動fixture
// （docs/e2e-coverage-pattern.md参照）。playwright.config.jsのreporterに
// monocart-reporterを追加し、outputDir: 'coverage'・reports: [['json-summary'], ...]
// を指定することで、frontend-test（ユニットテスト）と同じ
// coverage/coverage-summary.json形式・パスでE2E実行時のカバレッジが出力される。
//
// 使い方（e2eスペックファイル）:
//   import { test, expect } from './coverageFixture.js'; // symlink
//
// projectNameは呼び出し側のplaywright.config.jsが定義するprojects[].nameと
// 一致させる必要がある（既定'chromium'。firefox/webkitプロジェクトでは
// page.coverageのCDP APIが使えないため収集をスキップする）
export const test = testBase.extend({
  autoCoverageFixture: [async ({ page }, use, testInfo) => {
    const isChromium = testInfo.project.name === 'chromium';
    if (isChromium) {
      await Promise.all([
        page.coverage.startJSCoverage({ resetOnNavigation: false }),
        page.coverage.startCSSCoverage({ resetOnNavigation: false }),
      ]);
    }

    await use('autoCoverageFixture');

    if (isChromium) {
      const [jsCoverage, cssCoverage] = await Promise.all([
        page.coverage.stopJSCoverage(),
        page.coverage.stopCSSCoverage(),
      ]);
      await addCoverageReport([...jsCoverage, ...cssCoverage], testInfo);
    }
  }, { scope: 'test', auto: true }],
});

export { expect };
