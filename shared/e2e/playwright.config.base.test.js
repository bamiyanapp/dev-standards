import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlaywrightConfig, makeEntryFilter, validateBasePath } from './playwright.config.base.js';

const defineConfig = (c) => c;
const devices = {
  'Desktop Chrome': { viewport: { width: 1280, height: 720 } },
  'iPhone 13': { viewport: { width: 390, height: 664 }, isMobile: true, defaultBrowserType: 'webkit' },
};
const entry = (url) => ({ url });

test('basePathが未指定・不正な形なら、例外を投げる（黙って既定値を使わない）', () => {
  for (const bad of [undefined, null, '', 'sub', '/sub', 'sub/', 42]) assert.throws(() => validateBasePath(bad), /basePath/);
  assert.throws(() => buildPlaywrightConfig({ defineConfig, devices, reportName: 'x' }), /basePath/);
  assert.equal(validateBasePath('/'), '/');
  assert.equal(validateBasePath('/sub/'), '/sub/');
});

test('entryFilter: 自アプリのアセットに一致する', () => {
  const f = makeEntryFilter('/sub/');
  assert.equal(f(entry('https://example.com/sub/assets/index-abc.js')), true);
  assert.equal(f(entry('http://localhost:4173/sub/assets/a.css')), true);
});

test("entryFilter: basePathが'/'のとき、別アプリ（/other/assets/）には一致しない（includesで実装すると通ってしまう）", () => {
  const f = makeEntryFilter('/');
  assert.equal(f(entry('https://example.com/assets/x.js')), true);
  assert.equal(f(entry('https://example.com/other/assets/x.js')), false);
  const sub = makeEntryFilter('/sub/');
  assert.equal(sub(entry('https://example.com/other/sub/assets/x.js')), false);
  assert.equal(sub(entry('https://example.com/sub2/assets/x.js')), false);
});

test('entryFilter: 別オリジンのアセット以外・data:・blob:・不正なURLでも、例外を投げずfalseを返す', () => {
  const f = makeEntryFilter('/');
  for (const url of ['data:text/javascript,/assets/x', 'blob:https://example.com/assets/x', 'about:blank', 'not a url', '', undefined]) {
    assert.equal(f(entry(url)), false, String(url));
  }
});

test('設定: jsonレポーター・monocart-reporter・chromiumを含み、baseURLはE2E_BASE_URLになる', () => {
  process.env.E2E_BASE_URL = 'https://example.com/sub/';
  const c = buildPlaywrightConfig({ defineConfig, devices, reportName: 'R', basePath: '/sub/' });
  assert.deepEqual(c.reporter.map((r) => r[0]), ['html', 'json', 'monocart-reporter']);
  assert.equal(c.reporter[1][1].outputFile, 'playwright-report/results.json');
  assert.equal(c.reporter[2][1].name, 'R');
  assert.equal(c.projects[0].name, 'chromium');
  assert.equal(c.use.baseURL, 'https://example.com/sub/');
  assert.equal(c.webServer, undefined);
  delete process.env.E2E_BASE_URL;
});

test('webServerを渡すと、baseURLはそのURLになり、既定でreuseExistingServerを設定する。overridesで上書きできる', () => {
  const c = buildPlaywrightConfig({ defineConfig, devices, reportName: 'R', basePath: '/', webServer: { command: 'npm run preview', url: 'http://localhost:4173' }, overrides: { retries: 3 } });
  assert.equal(c.use.baseURL, 'http://localhost:4173');
  assert.equal(c.webServer.command, 'npm run preview');
  assert.equal(typeof c.webServer.reuseExistingServer, 'boolean');
  assert.equal(c.retries, 3);
});

test('defineConfig・devicesが無ければ、例外を投げる', () => {
  assert.throws(() => buildPlaywrightConfig({ reportName: 'R', basePath: '/' }), /defineConfig/);
});

test('mobile: 既定ではchromiumだけ。trueならmobile-iphoneが加わり、chromiumは必ず残る', () => {
  const base = { defineConfig, devices, reportName: 'R', basePath: '/' };
  assert.deepEqual(buildPlaywrightConfig(base).projects.map((p) => p.name), ['chromium']);
  const mobile = buildPlaywrightConfig({ ...base, mobile: true });
  assert.deepEqual(mobile.projects.map((p) => p.name), ['chromium', 'mobile-iphone']);
  // iPhone 13のdevices定義はWebKitを指すが、ブラウザはchromiumへ上書きする
  const iphone = mobile.projects[1].use;
  assert.equal(iphone.browserName, 'chromium');
  assert.equal(iphone.isMobile, true);
  assert.deepEqual(iphone.viewport, { width: 390, height: 664 });
});

test('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: 設定されていれば全projectへ反映し、未設定・空文字なら何も足さない', () => {
  const opts = { defineConfig, devices, reportName: 'R', basePath: '/', mobile: true };
  try {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = '/opt/pw-browsers/chromium';
    for (const project of buildPlaywrightConfig(opts).projects) {
      assert.equal(project.use.launchOptions.executablePath, '/opt/pw-browsers/chromium', project.name);
    }
    for (const empty of ['', undefined]) {
      if (empty === undefined) delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
      else process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = empty;
      for (const project of buildPlaywrightConfig(opts).projects) {
        assert.equal(project.use.launchOptions, undefined, `${project.name} (${JSON.stringify(empty)})`);
      }
    }
  } finally {
    delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
});

test('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: overridesで渡したprojectsにも反映する', () => {
  try {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = '/x/chromium';
    const c = buildPlaywrightConfig({ defineConfig, devices, reportName: 'R', basePath: '/', overrides: { projects: [{ name: 'custom', use: {} }] } });
    assert.equal(c.projects[0].use.launchOptions.executablePath, '/x/chromium');
  } finally {
    delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
});
