import "./jsdomSetup.js";
import test, { describe, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { renderHook, cleanup } from "@testing-library/react";
import { useAutoRefresh } from "./useAutoRefresh.js";

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new window.Event("visibilitychange"));
}

// jsdomの既定は「prerender」のため、表示中の状態へそろえる
beforeEach(() => setVisibility("visible"));
afterEach(() => {
  cleanup();
  mock.timers.reset();
  setVisibility("visible");
});

describe("useAutoRefresh", () => {
  test("表示中は、指定間隔ごとにcallbackを呼ぶ", () => {
    mock.timers.enable({ apis: ["setInterval"] });
    const callback = mock.fn();
    renderHook(() => useAutoRefresh(callback, { intervalMs: 1000 }));
    assert.equal(callback.mock.callCount(), 0);
    mock.timers.tick(3000);
    assert.equal(callback.mock.callCount(), 3);
  });

  test("非表示の間はタイマーを止め、再表示時に即座に呼んでタイマーを再開する", () => {
    mock.timers.enable({ apis: ["setInterval"] });
    const callback = mock.fn();
    renderHook(() => useAutoRefresh(callback, { intervalMs: 1000 }));
    setVisibility("hidden");
    mock.timers.tick(5000);
    assert.equal(callback.mock.callCount(), 0);
    setVisibility("visible");
    assert.equal(callback.mock.callCount(), 1);
    mock.timers.tick(1000);
    assert.equal(callback.mock.callCount(), 2);
  });

  test("intervalMsが無ければ、再表示時だけ呼ぶ", () => {
    mock.timers.enable({ apis: ["setInterval"] });
    const callback = mock.fn();
    renderHook(() => useAutoRefresh(callback));
    mock.timers.tick(60000);
    assert.equal(callback.mock.callCount(), 0);
    setVisibility("hidden");
    setVisibility("visible");
    assert.equal(callback.mock.callCount(), 1);
  });

  test("callbackの参照が変わっても、最新のcallbackを呼ぶ", () => {
    mock.timers.enable({ apis: ["setInterval"] });
    const first = mock.fn();
    const second = mock.fn();
    const { rerender } = renderHook(({ cb }) => useAutoRefresh(cb, { intervalMs: 1000 }), { initialProps: { cb: first } });
    rerender({ cb: second });
    mock.timers.tick(1000);
    assert.equal(first.mock.callCount(), 0);
    assert.equal(second.mock.callCount(), 1);
  });

  test("アンマウントでリスナーとタイマーを解除する", () => {
    mock.timers.enable({ apis: ["setInterval"] });
    const callback = mock.fn();
    const { unmount } = renderHook(() => useAutoRefresh(callback, { intervalMs: 1000 }));
    unmount();
    mock.timers.tick(5000);
    setVisibility("hidden");
    setVisibility("visible");
    assert.equal(callback.mock.callCount(), 0);
  });

  test("document.visibilityStateが無くても例外を投げない", () => {
    Object.defineProperty(document, "visibilityState", { value: undefined, configurable: true });
    const callback = mock.fn();
    assert.doesNotThrow(() => renderHook(() => useAutoRefresh(callback)));
  });
});
