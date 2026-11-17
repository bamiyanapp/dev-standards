import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlaywrightConfig, makeEntryFilter, validateBasePath } from './playwright.config.base.js';

const defineConfig = (c) => c;
const devices = { 'Desktop Chrome': { viewport: { width: 1280, height: 720 } } };
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
