import test from "node:test";
import assert from "node:assert/strict";
import createViteConfig from "./createViteConfig.js";

test("既定: baseと、共有物を使うために必須の設定を返す", () => {
  const config = createViteConfig({ base: "/education/" });
  assert.equal(config.base, "/education/");
  assert.equal(config.resolve.preserveSymlinks, true);
  assert.equal(config.build.sourcemap, true);
  assert.equal(config.test.environment, "jsdom");
  assert.equal(config.test.setupFiles, "./src/setupTests.ts");
  assert.deepEqual(config.plugins, []);
});

test("vitestExclude: 渡した既定の除外に、e2e/**を足す", () => {
  const config = createViteConfig({ base: "/", vitestExclude: ["**/node_modules/**", "**/dist/**"] });
  assert.deepEqual(config.test.exclude, ["**/node_modules/**", "**/dist/**", "e2e/**"]);
});

test("plugins・setupFiles・coverageExcludeを渡せる", () => {
  const plugin = { name: "dummy" };
  const config = createViteConfig({ base: "/", plugins: [plugin], setupFiles: "./x.ts", coverageExclude: ["src/components/**"] });
  assert.deepEqual(config.plugins, [plugin]);
  assert.equal(config.test.setupFiles, "./x.ts");
  assert.deepEqual(config.test.coverage, { exclude: ["src/components/**"] });
});

test("coverageExcludeを渡さなければ、coverageの設定を作らない", () => {
  assert.equal("coverage" in createViteConfig({ base: "/" }).test, false);
});

test("overrides: オブジェクトは再帰的に合成し、配列は置き換える", () => {
  const config = createViteConfig({
    base: "/",
    overrides: { build: { outDir: "out" }, test: { exclude: ["only"], environment: "node" }, server: { port: 3000 } },
  });
  assert.equal(config.build.sourcemap, true, "既定のキーは残る");
  assert.equal(config.build.outDir, "out");
  assert.deepEqual(config.test.exclude, ["only"], "配列は置き換える");
  assert.equal(config.test.environment, "node");
  assert.equal(config.test.setupFiles, "./src/setupTests.ts");
  assert.equal(config.server.port, 3000);
});

test("baseが無い・空のときは例外を投げる", () => {
  assert.throws(() => createViteConfig({}), /baseは必須/);
  assert.throws(() => createViteConfig({ base: "" }), /baseは必須/);
});
