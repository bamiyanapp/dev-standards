"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { countUnknownLicense, summarizeSbom, renderSbomSection } = require("./dependency-sbom-summary.js");

const SAMPLE_SBOM = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  components: [
    { name: "foo", licenses: [{ license: { id: "MIT" } }] },
    { name: "bar", licenses: [] },
    { name: "baz", licenses: [{ license: {} }] },
  ],
};

test("countUnknownLicense: licenses配列が空、またはid/nameが無いエントリを数える", () => {
  assert.equal(countUnknownLicense(SAMPLE_SBOM.components), 2);
});

test("summarizeSbom: componentCount・unknownLicenseCountを含む要約を返す", () => {
  assert.deepEqual(summarizeSbom(SAMPLE_SBOM), {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    componentCount: 3,
    unknownLicenseCount: 2,
  });
});

test("summarizeSbom: componentsが無い場合は0件として扱う", () => {
  assert.deepEqual(summarizeSbom({}), { bomFormat: null, specVersion: null, componentCount: 0, unknownLicenseCount: 0 });
});

test("renderSbomSection: 件数とArtifact参照の案内を含む", () => {
  const body = renderSbomSection(summarizeSbom(SAMPLE_SBOM));
  assert.match(body, /CycloneDX（1\.6）: 3件のコンポーネント/);
  assert.match(body, /ライセンス不明のコンポーネントが2件/);
  assert.match(body, /Artifact/);
});

test("renderSbomSection: ライセンス不明が0件なら該当文を含まない", () => {
  const body = renderSbomSection(summarizeSbom({ components: [{ name: "foo", licenses: [{ license: { id: "MIT" } }] }] }));
  assert.doesNotMatch(body, /ライセンス不明/);
});

test("CLI: SBOMファイルを受け取りMarkdown断片を標準出力する", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dependency-sbom-summary-test-"));
  const sbomPath = path.join(tmpDir, "sbom.json");
  fs.writeFileSync(sbomPath, JSON.stringify(SAMPLE_SBOM));

  const output = execFileSync(process.execPath, [path.join(__dirname, "dependency-sbom-summary.js"), sbomPath], { encoding: "utf-8" });
  assert.match(output, /3件のコンポーネント/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
