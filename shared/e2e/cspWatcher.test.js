import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCspViolations, watchCspViolations } from './cspWatcher.js';

// exposeFunction・addInitScriptを模した、偽のpage。ページ内で起きた違反を、emitで再現する
function fakePage() {
  const exposed = {};
  const scripts = [];
  return {
    scripts,
    async exposeFunction(name, fn) { exposed[name] = fn; },
    async addInitScript(fn, arg) { scripts.push({ fn, arg }); },
    emit(violation) { exposed.__reportCspViolation(violation); },
  };
}

test('ページ内の違反が、violationsへ溜まる（遷移をまたぐexposeFunction経由）', async () => {
  const page = fakePage();
  const violations = await watchCspViolations(page);
  page.emit({ directive: 'script-src-elem', blocked: 'https://evil.example/x.js', source: 'https://app/', line: 3, disposition: 'enforce' });
  page.emit({ directive: 'connect-src', blocked: 'https://api.other/', disposition: 'enforce' });
  assert.equal(violations.length, 2);
  assert.equal(page.scripts.length, 1);
  assert.equal(page.scripts[0].arg, '__reportCspViolation');
});

test('ページ内スクリプトは、securitypolicyviolationを購読し、報告する（DOMの偽物で確認）', async () => {
  const page = fakePage();
  await watchCspViolations(page);
  const listeners = {};
  const reported = [];
  globalThis.document = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  globalThis.window = { __reportCspViolation: (v) => reported.push(v) };
  try {
    page.scripts[0].fn(page.scripts[0].arg);
    listeners.securitypolicyviolation({ violatedDirective: 'img-src', blockedURI: 'data', sourceFile: '', lineNumber: 0, disposition: 'enforce' });
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
  assert.deepEqual(reported, [{ directive: 'img-src', blocked: 'data', source: '', line: 0, disposition: 'enforce' }]);
});

test('Report-Onlyの違反は、既定では集め、includeReportOnly: falseなら除く', async () => {
  const a = fakePage();
  const all = await watchCspViolations(a);
  a.emit({ directive: 'x', blocked: 'y', disposition: 'report' });
  assert.equal(all.length, 1);
  const b = fakePage();
  const enforced = await watchCspViolations(b, { includeReportOnly: false });
  b.emit({ directive: 'x', blocked: 'y', disposition: 'report' });
  b.emit({ directive: 'x', blocked: 'y', disposition: 'enforce' });
  assert.equal(enforced.length, 1);
});

test('formatCspViolations: 違反が無ければ空。あれば件数・指令・遮断先・場所を出す', () => {
  assert.equal(formatCspViolations([]), '');
  const msg = formatCspViolations([
    { directive: 'script-src-elem', blocked: 'https://evil.example/x.js', source: 'https://app/index.html', line: 7 },
    { directive: 'script-src-attr', blocked: '' },
  ]);
  assert.match(msg, /CSP違反が2件/);
  assert.match(msg, /script-src-elem: https:\/\/evil\.example\/x\.js （https:\/\/app\/index\.html:7）/);
  assert.match(msg, /script-src-attr: \(inline\)/);
  assert.match(msg, /security-headers-pattern\.md/);
});
