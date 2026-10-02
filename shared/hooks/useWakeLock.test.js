import "./jsdomSetup.js";
import test, { describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "@testing-library/react";
import { useWakeLock } from "./useWakeLock.js";

// node:testにはvitestのvi.waitFor相当が無いため、assertionが成功するまで
// 短い間隔でポーリングする簡易実装で代替する
async function waitFor(assertion, { timeout = 1000, interval = 10 } = {}) {
  const start = Date.now();
  for (;;) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start > timeout) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}

describe("useWakeLock", () => {
  let originalWakeLock;

  beforeEach(() => {
    originalWakeLock = navigator.wakeLock;
  });

  afterEach(() => {
    if (originalWakeLock === undefined) {
      delete navigator.wakeLock;
    } else {
      Object.defineProperty(navigator, "wakeLock", { value: originalWakeLock, configurable: true });
    }
  });

  const mockSentinel = () => ({
    release: mock.fn(() => Promise.resolve(undefined)),
    addEventListener: mock.fn(),
  });

  test("activeがfalseの場合はwakeLockをリクエストしない", () => {
    const request = mock.fn();
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });

    renderHook(() => useWakeLock(false));

    assert.equal(request.mock.callCount(), 0);
  });

  test("Wake Lock API未対応の場合はエラーにならない", () => {
    delete navigator.wakeLock;

    assert.doesNotThrow(() => renderHook(() => useWakeLock(true)));
  });

  test("activeがtrueの場合はscreenのwakeLockをリクエストする", async () => {
    const sentinel = mockSentinel();
    const request = mock.fn(() => Promise.resolve(sentinel));
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });

    renderHook(() => useWakeLock(true));
    await waitFor(() => assert.equal(request.mock.callCount(), 1));
    assert.equal(request.mock.calls[0].arguments[0], "screen");
  });

  test("アンマウント時にsentinelをreleaseする", async () => {
    const sentinel = mockSentinel();
    const request = mock.fn(() => Promise.resolve(sentinel));
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });

    const { unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => assert.equal(request.mock.callCount(), 1));

    unmount();

    assert.equal(sentinel.release.mock.callCount(), 1);
  });

  test("可視状態に戻った際、sentinelが失われていれば再取得する", async () => {
    const sentinel = mockSentinel();
    const request = mock.fn(() => Promise.resolve(sentinel));
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });

    renderHook(() => useWakeLock(true));
    await waitFor(() => assert.equal(request.mock.callCount(), 1));

    // ブラウザがタブ非表示時に自動解放したケースを模して、releaseハンドラを呼ぶ
    const releaseHandler = sentinel.addEventListener.mock.calls.find(
      (call) => call.arguments[0] === "release",
    ).arguments[1];
    releaseHandler();

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => assert.equal(request.mock.callCount(), 2));
  });
});
