"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateRules, isError } = require("./check-eslint-rules.js");
const required = require("./eslint-required-rules.json");

const FULL = {
  rules: {
    complexity: [2, 15],
    "max-lines": [2, { max: 500 }],
    "@typescript-eslint/no-unused-vars": [2],
    "sonarjs/cognitive-complexity": [2, 15],
  },
};

test("必須ルールがすべてerrorで有効なら、満たしていないルールは無い", () => {
  assert.deepEqual(evaluateRules(FULL), []);
});

test("max-linesが無い状態（Electric-Chair-Arenaの実例）を検知する", () => {
  const { "max-lines": _omit, ...rules } = FULL.rules;
  const missing = evaluateRules({ rules });
  assert.deepEqual(missing.map((m) => m.id), ["max-lines"]);
  assert.equal(missing[0].reason, "有効になっていません");
});

test("warn・offは、満たさない。warnの場合は、その旨を示す", () => {
  const missing = evaluateRules({ rules: { ...FULL.rules, complexity: [1, 15], "no-unused-vars": 0, "@typescript-eslint/no-unused-vars": [0] } });
  assert.deepEqual(missing.map((m) => m.id), ["complexity", "no-unused-vars"]);
  assert.match(missing[0].reason, /warn/);
  assert.equal(missing[1].reason, "有効になっていません");
});

test("no-unused-vars は、TypeScript版でも満たす。sonarjsは、いずれか1ルールがerrorなら満たす", () => {
  assert.deepEqual(evaluateRules({ rules: { ...FULL.rules, "sonarjs/cognitive-complexity": 0, "sonarjs/no-duplicate-string": 2 } }), []);
  assert.deepEqual(evaluateRules({ rules: { ...FULL.rules, "sonarjs/cognitive-complexity": 0 } }).map((m) => m.id), ["sonarjs"]);
});

test("isError: 数値・文字列・配列のerrorを判定する", () => {
  for (const v of [2, "error", [2], ["error", {}]]) assert.equal(isError(v), true);
  for (const v of [0, 1, "off", "warn", [0], ["warn"]]) assert.equal(isError(v), false);
});

test("設定が空でも、例外にならず、すべてを不足として返す。必須ルールの一覧は、4つある", () => {
  assert.equal(evaluateRules({}).length, required.rules.length);
  assert.equal(required.rules.length, 4);
});
