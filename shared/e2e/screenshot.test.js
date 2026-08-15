import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// captureScreenshotはprocess.cwd()基準でSCREENSHOT_DIRを算出する（symlink越しでも
// 参照側リポジトリの<frontend_dir>/e2e-screenshotsを指すようにするため）。この
// テストではprocess.chdir()で一時ディレクトリへ切り替えてから検証する。
// SCREENSHOT_DIRはimport時に評価済みの定数のため、モジュール自体をchdir後に
// 動的importし直す
async function withTempCwd(run) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "screenshot-test-"));
  const originalCwd = process.cwd();
  process.chdir(tmpDir);
  try {
    const mod = await import(`./screenshot.js?cwd=${encodeURIComponent(tmpDir)}`);
    await run(mod, tmpDir);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function fakePage(pngBytes = Buffer.from("fake-png")) {
  return {
    async screenshot() {
      return pngBytes;
    },
  };
}

function fakeTestInfo({ file = "/repo/frontend/e2e/example.spec.js", title = "does something" } = {}) {
  const attachments = [];
  return {
    file,
    title,
    attachments,
    async attach(name, options) {
      attachments.push({ name, ...options });
    },
  };
}

test("writes the PNG and Playwright attachment", async () => {
  await withTempCwd(async ({ captureScreenshot, SCREENSHOT_DIR }, tmpDir) => {
    const page = fakePage();
    const testInfo = fakeTestInfo();

    await captureScreenshot(page, testInfo, "example");

    assert.equal(SCREENSHOT_DIR, path.resolve(tmpDir, "e2e-screenshots"));
    assert.equal(fs.readFileSync(path.join(SCREENSHOT_DIR, "example.png"), "utf-8"), "fake-png");
    assert.equal(testInfo.attachments.length, 1);
    assert.equal(testInfo.attachments[0].name, "example");
    assert.equal(testInfo.attachments[0].contentType, "image/png");
  });
});

test("writes a caption file only when a caption is passed", async () => {
  await withTempCwd(async ({ captureScreenshot, SCREENSHOT_DIR }) => {
    const page = fakePage();

    await captureScreenshot(page, fakeTestInfo(), "with-caption", "説明文");
    assert.equal(fs.readFileSync(path.join(SCREENSHOT_DIR, "with-caption.caption.txt"), "utf-8"), "説明文");

    await captureScreenshot(page, fakeTestInfo(), "without-caption");
    assert.equal(fs.existsSync(path.join(SCREENSHOT_DIR, "without-caption.caption.txt")), false);
  });
});

test("records the spec file basename and test title for CI-side grouping", async () => {
  await withTempCwd(async ({ captureScreenshot, SCREENSHOT_DIR }) => {
    const page = fakePage();
    const testInfo = fakeTestInfo({ file: "/repo/frontend/e2e/quiz-room.spec.js", title: "admin creates a room" });

    await captureScreenshot(page, testInfo, "room-created");

    assert.equal(fs.readFileSync(path.join(SCREENSHOT_DIR, "room-created.spec.txt"), "utf-8"), "quiz-room.spec.js");
    assert.equal(fs.readFileSync(path.join(SCREENSHOT_DIR, "room-created.title.txt"), "utf-8"), "admin creates a room");
  });
});

test("passes fullPage through to page.screenshot()", async () => {
  await withTempCwd(async ({ captureScreenshot }) => {
    const calls = [];
    const page = {
      async screenshot(options) {
        calls.push(options);
        return Buffer.from("fake-png");
      },
    };

    await captureScreenshot(page, fakeTestInfo(), "default-full-page");
    await captureScreenshot(page, fakeTestInfo(), "viewport-only", undefined, { fullPage: false });

    assert.deepEqual(calls, [{ fullPage: true }, { fullPage: false }]);
  });
});
