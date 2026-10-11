import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import createVersionJsonPlugin from "./createVersionJsonPlugin.js";

function writeFakePackageJson(version) {
  const dir = mkdtempSync(join(tmpdir(), "create-version-json-plugin-test-"));
  const path = join(dir, "package.json");
  writeFileSync(path, JSON.stringify({ name: "fake", version }));
  return { dir, path };
}

test("writeBundleでdist直下へversion・buildTimeを含むversion.jsonを書き出す", () => {
  const { dir, path } = writeFakePackageJson("1.2.3");
  try {
    const distDir = join(dir, "dist");
    mkdirSync(distDir);
    const now = new Date("2026-08-29T10:00:00.000Z");
    const plugin = createVersionJsonPlugin(path, now);
    plugin.writeBundle({ dir: distDir });

    const written = JSON.parse(readFileSync(join(distDir, "version.json"), "utf-8"));
    assert.deepEqual(written, { version: "1.2.3", buildTime: "2026-08-29T10:00:00.000Z" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("nowを省略した場合は現在時刻に近いbuildTimeを使う", () => {
  const { dir, path } = writeFakePackageJson("1.0.0");
  try {
    const distDir = join(dir, "dist");
    mkdirSync(distDir);
    const before = Date.now();
    const plugin = createVersionJsonPlugin(path);
    plugin.writeBundle({ dir: distDir });
    const after = Date.now();

    const written = JSON.parse(readFileSync(join(distDir, "version.json"), "utf-8"));
    const buildTime = new Date(written.buildTime).getTime();
    assert.ok(buildTime >= before && buildTime <= after);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
