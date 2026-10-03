"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  extractPackageName,
  buildBlastRadiusMap,
  matchesCriticalPath,
  findCriticalPathImpact,
  loadCriticalPaths,
} = require("./dependency-blast-radius.js");

test("extractPackageName: 通常のパッケージ名はそのまま返す", () => {
  assert.equal(extractPackageName("react"), "react");
});

test("extractPackageName: サブパスimportはパッケージ名部分のみ返す", () => {
  assert.equal(extractPackageName("lodash/debounce"), "lodash");
});

test("extractPackageName: scopedパッケージはscope/name部分のみ返す", () => {
  assert.equal(extractPackageName("@scope/pkg/sub/path"), "@scope/pkg");
});

function depcruiseFixture(edges) {
  // edges: [[fromFile, toModuleSpecifier, dependencyTypes]]
  const bySource = new Map();
  for (const [from, to, types] of edges) {
    if (!bySource.has(from)) bySource.set(from, []);
    bySource.get(from).push({ module: to, dependencyTypes: types });
  }
  return { modules: [...bySource.entries()].map(([source, dependencies]) => ({ source, dependencies })) };
}

test("buildBlastRadiusMap: npm依存エッジのみをパッケージ名ごとに集約する", () => {
  const depcruiseJson = depcruiseFixture([
    ["frontend/src/A.jsx", "react", ["npm", "import"]],
    ["frontend/src/B.jsx", "react", ["npm", "import"]],
    ["frontend/src/B.jsx", "./A.jsx", ["local"]],
  ]);
  const map = buildBlastRadiusMap(depcruiseJson);
  assert.deepEqual(map, { react: ["frontend/src/A.jsx", "frontend/src/B.jsx"] });
});

test("buildBlastRadiusMap: サブパスimportは同じパッケージ名へ集約される", () => {
  const depcruiseJson = depcruiseFixture([
    ["frontend/src/A.jsx", "lodash/debounce", ["npm", "import"]],
    ["frontend/src/B.jsx", "lodash", ["npm", "import"]],
  ]);
  const map = buildBlastRadiusMap(depcruiseJson);
  assert.deepEqual(map, { lodash: ["frontend/src/A.jsx", "frontend/src/B.jsx"] });
});

test("matchesCriticalPath: prefix一致で判定する", () => {
  assert.equal(matchesCriticalPath("frontend/src/payment/Checkout.jsx", ["frontend/src/payment/"]), true);
  assert.equal(matchesCriticalPath("frontend/src/Home.jsx", ["frontend/src/payment/"]), false);
});

test("findCriticalPathImpact: 重要パスに該当する直接依存のみhitになる", () => {
  const blastRadiusMap = {
    react: ["frontend/src/payment/Checkout.jsx", "frontend/src/Home.jsx"],
    lodash: ["frontend/src/Home.jsx"],
  };
  const result = findCriticalPathImpact({
    blastRadiusMap,
    changedDirectPackageNames: ["react", "lodash"],
    criticalPaths: ["frontend/src/payment/"],
  });
  assert.equal(result.hasCriticalPathImpact, true);
  assert.deepEqual(result.hits, [
    { packageName: "react", file: "frontend/src/payment/Checkout.jsx", criticalPath: "frontend/src/payment/" },
  ]);
});

test("findCriticalPathImpact: criticalPathsが空の場合は常にhitなし（フォールバック）", () => {
  const blastRadiusMap = { react: ["frontend/src/payment/Checkout.jsx"] };
  const result = findCriticalPathImpact({
    blastRadiusMap,
    changedDirectPackageNames: ["react"],
    criticalPaths: [],
  });
  assert.equal(result.hasCriticalPathImpact, false);
  assert.deepEqual(result.hits, []);
});

test("findCriticalPathImpact: 間接依存（changedDirectPackageNamesに含まれない）は対象外", () => {
  const blastRadiusMap = { transitive: ["frontend/src/payment/Checkout.jsx"] };
  const result = findCriticalPathImpact({
    blastRadiusMap,
    changedDirectPackageNames: ["react"],
    criticalPaths: ["frontend/src/payment/"],
  });
  assert.equal(result.hasCriticalPathImpact, false);
});

test("loadCriticalPaths: ファイルが存在しない場合は空配列", () => {
  assert.deepEqual(loadCriticalPaths(path.join(os.tmpdir(), "does-not-exist.json")), []);
});

test("loadCriticalPaths: 壊れたJSONの場合も空配列へ安全側にフォールバックする", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "critical-paths-test-"));
  const filePath = path.join(tmpDir, "critical-paths.json");
  fs.writeFileSync(filePath, "{not valid json");
  assert.deepEqual(loadCriticalPaths(filePath), []);
});

test("loadCriticalPaths: criticalPathsキーを読み取る", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "critical-paths-test-"));
  const filePath = path.join(tmpDir, "critical-paths.json");
  fs.writeFileSync(filePath, JSON.stringify({ criticalPaths: ["frontend/src/payment/"] }));
  assert.deepEqual(loadCriticalPaths(filePath), ["frontend/src/payment/"]);
});

test("CLI: critical-paths.json省略時は昇格なし（hit: false）を出力する", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "blast-radius-cli-test-"));
  const depcruisePath = path.join(tmpDir, "depcruise.json");
  const updateInfoPath = path.join(tmpDir, "update-info.json");
  fs.writeFileSync(
    depcruisePath,
    JSON.stringify({ modules: [{ source: "frontend/src/payment/Checkout.jsx", dependencies: [{ module: "react", dependencyTypes: ["npm"] }] }] }),
  );
  fs.writeFileSync(updateInfoPath, JSON.stringify({ changes: [{ name: "react", direct: true }] }));
  const githubOutputPath = path.join(tmpDir, "github-output.txt");
  fs.writeFileSync(githubOutputPath, "");

  const stdout = execFileSync("node", [path.join(__dirname, "dependency-blast-radius.js"), depcruisePath, updateInfoPath], {
    encoding: "utf-8",
    env: { ...process.env, GITHUB_OUTPUT: githubOutputPath },
  });

  const result = JSON.parse(stdout);
  assert.equal(result.hasCriticalPathImpact, false);
  assert.match(fs.readFileSync(githubOutputPath, "utf-8"), /hit=false/);
});
