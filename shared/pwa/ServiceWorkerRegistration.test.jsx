import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration.jsx";

let update;
let register;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  update = vi.fn().mockResolvedValue();
  register = vi.fn().mockResolvedValue({ update });
  Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete navigator.serviceWorker;
});

describe("ServiceWorkerRegistration", () => {
  it("既定は/sw.js、swUrl指定ならそのURLを登録する", async () => {
    render(<ServiceWorkerRegistration />);
    expect(register).toHaveBeenCalledWith("/sw.js");
    cleanup();
    render(<ServiceWorkerRegistration swUrl="/app/sw.js" />);
    expect(register).toHaveBeenLastCalledWith("/app/sw.js");
  });

  it("フォアグラウンドへ戻ったときにupdateを呼ぶ", async () => {
    render(<ServiceWorkerRegistration />);
    await waitFor(() => expect(register).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(0);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("5分ごとにupdateを呼ぶ", async () => {
    render(<ServiceWorkerRegistration />);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("登録失敗はconsole.errorに出し、update失敗は無視する", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    register.mockRejectedValue(new Error("x"));
    render(<ServiceWorkerRegistration />);
    await waitFor(() => expect(err).toHaveBeenCalled());
  });

  it("未対応環境では何もしない", () => {
    delete navigator.serviceWorker;
    expect(() => render(<ServiceWorkerRegistration />)).not.toThrow();
  });

  it("アンマウント後はタイマーが止まる", async () => {
    const { unmount } = render(<ServiceWorkerRegistration />);
    await vi.advanceTimersByTimeAsync(0);
    unmount();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(update).not.toHaveBeenCalled();
  });
});
