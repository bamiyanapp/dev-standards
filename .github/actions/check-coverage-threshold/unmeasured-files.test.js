"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { globToRegExp, splitGlobList, makeMatcher, findUnmeasuredFiles, describeUnmeasured } = require("./unmeasured-files.js");

const SOURCE = "src/**/*.{ts,tsx,js,jsx}";
const IGNORE = "**/*.test.*,**/*.spec.*,**/*.d.ts,src/main.*,src/setupTests.*,src/vite-env.d.ts";
const cwd = "/work/app";
const summary = (...files) => ({ total: {}, ...Object.fromEntries(files.map((f) => [f, {}])) });
const find = (summaryJson, files, opts = {}) => findUnmeasuredFiles(summaryJson, { cwd, sourceGlobs: SOURCE, ignoreGlobs: IGNORE, files, ...opts });

test("globToRegExp: **・*・?を解釈し、正規表現の特殊文字はエスケープする", () => {
  assert.equal(globToRegExp("src/**/*.ts").test("src/a.ts"), true);
  assert.equal(globToRegExp("src/**/*.ts").test("src/a/b/c.ts"), true);
  assert.equal(globToRegExp("src/*.ts").test("src/a/b.ts"), false);
  assert.equal(globToRegExp("src/?.ts").test("src/a.ts"), true);
  assert.equal(globToRegExp("src/a.ts").test("src/aXts"), false);
});

test("splitGlobList: {}の中のカンマでは分割しない", () => {
  assert.deepEqual(splitGlobList("src/**/*.{ts,tsx}, **/*.test.*"), ["src/**/*.{ts,tsx}", "**/*.test.*"]);
  assert.deepEqual(splitGlobList(""), []);
});

test("makeMatcher: 波括弧の展開と複数globのOR", () => {
  const matches = makeMatcher(SOURCE);
  assert.equal(matches("src/App.tsx"), true);
  assert.equal(matches("src/physics/world.ts"), true);
  assert.equal(matches("src/style.css"), false);
  assert.equal(matches("scripts/build.js"), false);
});

test("全ファイルが計測済みなら、未計測は0件", () => {
  const files = ["src/App.tsx", "src/physics/world.ts"];
  assert.deepEqual(find(summary("src/App.tsx", "src/physics/world.ts"), files), []);
});

test("サマリーにキーが無いファイルを、未計測として返す", () => {
  const files = ["src/App.tsx", "src/components/VehicleCanvas.tsx"];
  assert.deepEqual(find(summary("src/App.tsx"), files), ["src/components/VehicleCanvas.tsx"]);
});

test("テストファイル・.d.ts・main・setupTests・vite-env.d.tsは対象外", () => {
  const files = ["src/a.test.ts", "src/a.spec.tsx", "src/types.d.ts", "src/main.tsx", "src/setupTests.ts", "src/vite-env.d.ts", "src/deep/b.test.js"];
  assert.deepEqual(find(summary(), files), []);
});

test("src/の外のファイル（e2e・設定ファイル）は対象外", () => {
  assert.deepEqual(find(summary(), ["e2e/home.spec.ts", "vite.config.ts", "playwright.config.ts"]), []);
});

test("サマリーのキーが絶対パスでも相対パスでも、計測済みとして扱う", () => {
  const files = ["src/a.ts", "src/b.ts"];
  assert.deepEqual(find(summary("/work/app/src/a.ts", "src/b.ts"), files), []);
  assert.deepEqual(find(summary("/work/app/src/a.ts"), files), ["src/b.ts"]);
});

test("結果は名前順で返る", () => {
  assert.deepEqual(find(summary(), ["src/z.ts", "src/a.ts"]), ["src/a.ts", "src/z.ts"]);
});

test("describeUnmeasured: 0件なら空文字、1件以上ならファイル名と対処を含む表を返す", () => {
  assert.equal(describeUnmeasured([], "frontend", cwd), "");
  const md = describeUnmeasured(["src/x.ts"], "frontend", cwd);
  assert.match(md, /src\/x\.ts/);
  assert.match(md, /coverage\.include/);
  assert.match(md, /1件/);
});
