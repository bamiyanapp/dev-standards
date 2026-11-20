import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import getSymlinkCoverageExcludes from "./getSymlinkCoverageExcludes.js";

function writeManifest(symlinks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-excludes-"));
  const file = path.join(dir, "sync-manifest.local.json");
  fs.writeFileSync(file, JSON.stringify({ symlinks }));
  return file;
}

const SYMLINKS = [
  { source: "shared/ui/ShareButton.jsx", target: "app/top/src/components/ShareButton.jsx" },
  { source: "shared/pwa/UpdateNotifier.jsx", target: "app/top/src/components/UpdateNotifier.jsx" },
  { source: "shared/ui/ShareButton.jsx", target: "app/mock/src/components/ShareButton.jsx" },
  { source: "shared/lambda/httpResponse.js", target: "infra/functions/httpResponse.js" },
  { source: "app-shared/ui/AppShell.tsx", target: "app/top/src/components/AppShell.tsx" },
];

test("appDirを指定すると、そのアプリのtargetだけを、アプリのルートからのパスで返す", () => {
  const file = writeManifest(SYMLINKS);
  assert.deepEqual(getSymlinkCoverageExcludes({ manifestPath: file, appDir: "app/top" }), ["src/components/ShareButton.jsx", "src/components/UpdateNotifier.jsx"]);
});

test("shared/ui・shared/pwa・shared/sfx以外（lambda・アプリ共通の独自コード）は、除外しない", () => {
  const file = writeManifest(SYMLINKS);
  const excludes = getSymlinkCoverageExcludes({ manifestPath: file });
  assert.equal(excludes.some((p) => p.includes("httpResponse")), false);
  assert.equal(excludes.some((p) => p.includes("AppShell")), false);
});

test("appDirを省略すると、manifestのtarget全体を、ルートからのパスで返す。重複しない・並べ替える", () => {
  const file = writeManifest(SYMLINKS);
  assert.deepEqual(getSymlinkCoverageExcludes({ manifestPath: file }), [
    "app/mock/src/components/ShareButton.jsx",
    "app/top/src/components/ShareButton.jsx",
    "app/top/src/components/UpdateNotifier.jsx",
  ]);
});

test("sourcePrefixesで、対象を変えられる", () => {
  const file = writeManifest(SYMLINKS);
  assert.deepEqual(getSymlinkCoverageExcludes({ manifestPath: file, appDir: "app/top", sourcePrefixes: ["shared/pwa/"] }), ["src/components/UpdateNotifier.jsx"]);
});

test("アプリ名が前方一致するだけの別アプリ（app/top2）は、含めない", () => {
  const file = writeManifest([{ source: "shared/ui/ShareButton.jsx", target: "app/top2/src/components/ShareButton.jsx" }]);
  assert.deepEqual(getSymlinkCoverageExcludes({ manifestPath: file, appDir: "app/top" }), []);
});

test("symlinksが無いmanifestは、空配列を返す", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-excludes-"));
  const file = path.join(dir, "sync-manifest.local.json");
  fs.writeFileSync(file, "{}");
  assert.deepEqual(getSymlinkCoverageExcludes({ manifestPath: file }), []);
});
