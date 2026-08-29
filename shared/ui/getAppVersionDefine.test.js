import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import getAppVersionDefine from "./getAppVersionDefine.js";

function writeFakePackageJson(version) {
  const dir = mkdtempSync(join(tmpdir(), "get-app-version-define-test-"));
  const path = join(dir, "package.json");
  writeFileSync(path, JSON.stringify({ name: "fake", version }));
  return { dir, path };
}

test("package.jsonのversionを__APP_VERSION__としてJSON文字列化する", () => {
  const { dir, path } = writeFakePackageJson("1.2.3");
  try {
    const result = getAppVersionDefine(path);
    assert.equal(result.__APP_VERSION__, JSON.stringify("1.2.3"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("__APP_BUILD_TIME__は渡されたnowのISO文字列をJSON文字列化する", () => {
  const { dir, path } = writeFakePackageJson("1.0.0");
  try {
    const now = new Date("2026-08-29T10:00:00.000Z");
    const result = getAppVersionDefine(path, now);
    assert.equal(result.__APP_BUILD_TIME__, JSON.stringify("2026-08-29T10:00:00.000Z"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("nowを省略した場合は現在時刻に近いISO文字列を使う", () => {
  const { dir, path } = writeFakePackageJson("1.0.0");
  try {
    const before = Date.now();
    const result = getAppVersionDefine(path);
    const after = Date.now();
    const buildTime = new Date(JSON.parse(result.__APP_BUILD_TIME__)).getTime();
    assert.ok(buildTime >= before && buildTime <= after);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
