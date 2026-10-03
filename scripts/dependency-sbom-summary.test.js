"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { findUnknownLicenseComponents, summarizeSbom, renderSbomSection } = require("./dependency-sbom-summary.js");

const SAMPLE_SBOM = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  components: [
    { name: "foo", version: "1.0.0", licenses: [{ license: { id: "MIT" } }] },
    { name: "bar", version: "2.0.0", licenses: [] },
    { name: "baz", version: "3.0.0", licenses: [{ license: {} }] },
  ],
};

test("findUnknownLicenseComponents: licenses配列が空、またはid/nameが無いエントリを名前・バージョン付きで抽出する", () => {
  assert.deepEqual(findUnknownLicenseComponents(SAMPLE_SBOM.components), [
    { name: "bar", version: "2.0.0" },
    { name: "baz", version: "3.0.0" },
  ]);
});

test("summarizeSbom: componentCount・unknownLicenseComponentsを含む要約を返す", () => {
  assert.deepEqual(summarizeSbom(SAMPLE_SBOM), {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    componentCount: 3,
    unknownLicenseComponents: [
      { name: "bar", version: "2.0.0" },
      { name: "baz", version: "3.0.0" },
    ],
  });
});

test("summarizeSbom: componentsが無い場合は0件として扱う", () => {
  assert.deepEqual(summarizeSbom({}), { bomFormat: null, specVersion: null, componentCount: 0, unknownLicenseComponents: [] });
});

test("renderSbomSection: 件数・ライセンス不明コンポーネントの一覧・Artifact参照の案内を含む（issue #716）", () => {
  const body = renderSbomSection(summarizeSbom(SAMPLE_SBOM));
  assert.match(body, /CycloneDX（1\.6）: 3件のコンポーネント/);
  assert.match(body, /ライセンス不明のコンポーネント（2件）/);
  assert.match(body, /\| bar \| 2\.0\.0 \|/);
  assert.match(body, /\| baz \| 3\.0\.0 \|/);
  assert.match(body, /Artifact/);
});

test("renderSbomSection: ライセンス不明が0件なら一覧セクション自体を表示しない", () => {
  const body = renderSbomSection(summarizeSbom({ components: [{ name: "foo", version: "1.0.0", licenses: [{ license: { id: "MIT" } }] }] }));
  assert.doesNotMatch(body, /ライセンス不明/);
  assert.doesNotMatch(body, /<details>/);
});

test("CLI: SBOMファイルを受け取りMarkdown断片を標準出力する", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dependency-sbom-summary-test-"));
  const sbomPath = path.join(tmpDir, "sbom.json");
  fs.writeFileSync(sbomPath, JSON.stringify(SAMPLE_SBOM));

  const output = execFileSync(process.execPath, [path.join(__dirname, "dependency-sbom-summary.js"), sbomPath], { encoding: "utf-8" });
  assert.match(output, /3件のコンポーネント/);
  assert.match(output, /\| bar \| 2\.0\.0 \|/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
