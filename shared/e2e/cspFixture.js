import { test as base } from '@playwright/test';
import { formatCspViolations, watchCspViolations } from './cspWatcher.js';

// 各テストの実行中に、CSP違反が1件でもあれば、テストを失敗させる自動fixture（dev-standards#1407 段階2）。
// 本番と同じCSPを、previewサーバーにも付けておく（docs/security-headers-pattern.md）と、
// E2Eが本番と同じ制約で動き、違反をテストで見つけられる。
//
// 使い方（e2eスペックファイル）:
//   import { test, expect } from './cspFixture.js'; // symlink
// coverageFixture.jsと併用する場合は、@playwright/testのmergeTestsで合わせる:
//   import { mergeTests } from '@playwright/test';
//   import { test as csp } from './cspFixture.js';
//   import { test as coverage, expect } from './coverageFixture.js';
//   export const test = mergeTests(csp, coverage);
//
// 違反を許す正当な理由があるテストは、test.use({ allowCspViolations: true })で無効にできる
export const test = base.extend({
  allowCspViolations: [false, { option: true }],
  autoCspWatcher: [async ({ page, allowCspViolations }, use) => {
    const violations = await watchCspViolations(page);
    await use('autoCspWatcher');
    const message = formatCspViolations(violations);
    if (message && !allowCspViolations) throw new Error(message);
  }, { scope: 'test', auto: true }],
});

export { expect } from '@playwright/test';
