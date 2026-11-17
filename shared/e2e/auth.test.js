import test from 'node:test';
import assert from 'node:assert/strict';
import { loginWithCookies } from './auth.js';

const fakeContext = () => {
  const added = [];
  return { added, addCookies: async (c) => void added.push(...c) };
};

test('指定したCookie名で、baseURLのホストへ注入する。httpsならSecure', async () => {
  const ctx = fakeContext();
  await loginWithCookies(ctx, { baseURL: 'https://example.com/app/', cookies: { refresh_token: 'tok' } });
  assert.deepEqual(ctx.added, [{ name: 'refresh_token', value: 'tok', domain: 'example.com', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
});

test('httpのlocalhostではSecureにしない。secureで上書きできる', async () => {
  const a = fakeContext();
  await loginWithCookies(a, { baseURL: 'http://localhost:4173/', cookies: { c: 'v' } });
  assert.equal(a.added[0].secure, false);
  const b = fakeContext();
  await loginWithCookies(b, { baseURL: 'http://localhost:4173/', cookies: { c: 'v' }, secure: true });
  assert.equal(b.added[0].secure, true);
});

test('値が空のCookieは注入せず、全部空なら例外（Secret未設定に気づける）', async () => {
  const ctx = fakeContext();
  await loginWithCookies(ctx, { baseURL: 'https://example.com/', cookies: { a: 'x', b: '', c: undefined } });
  assert.deepEqual(ctx.added.map((c) => c.name), ['a']);
  await assert.rejects(loginWithCookies(fakeContext(), { baseURL: 'https://example.com/', cookies: { a: '' } }), /Secret/);
});

test('baseURL・cookiesが無ければ、例外を投げる', async () => {
  await assert.rejects(loginWithCookies(fakeContext(), { cookies: { a: 'x' } }), /baseURL/);
  await assert.rejects(loginWithCookies(fakeContext(), { baseURL: 'https://example.com/' }), /cookies/);
});
