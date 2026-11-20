import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSharedRules } from './eslint.shared-rules.js';

test('既定はwarnで、プラグインに依存しない5つのルールを返す', () => {
  const { rules } = createSharedRules();
  assert.deepEqual(Object.keys(rules).sort(), ['complexity', 'max-lines', 'max-lines-per-function', 'no-alert', 'no-restricted-globals']);
  assert.equal(rules['no-alert'], 'warn');
  assert.equal(rules['no-restricted-globals'][0], 'warn');
  assert.equal(rules['no-restricted-globals'][1].name, 'fetch');
  assert.deepEqual(rules.complexity, ['warn', 15]);
});

test('levelと上限を、引数で上書きできる', () => {
  const { rules } = createSharedRules({ level: 'error', maxLines: 300, maxLinesPerFunction: 50, complexity: 10 });
  assert.equal(rules['no-alert'], 'error');
  assert.equal(rules['max-lines'][1].max, 300);
  assert.equal(rules['max-lines-per-function'][1].max, 50);
  assert.deepEqual(rules.complexity, ['error', 10]);
});

test('空行・コメントを数えない', () => {
  const { rules } = createSharedRules();
  assert.equal(rules['max-lines'][1].skipBlankLines, true);
  assert.equal(rules['max-lines'][1].skipComments, true);
  assert.equal(rules['max-lines-per-function'][1].skipBlankLines, true);
});

test('import文のほかに、外部モジュールへ依存しない', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('./eslint.shared-rules.js', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s/m.test(src), false);
});
