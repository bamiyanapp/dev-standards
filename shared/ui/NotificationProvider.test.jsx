import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotificationProvider, useNotify, AUTO_DISMISS_MS } from "./NotificationProvider.jsx";

let notify;
function Probe() {
  notify = useNotify();
  return null;
}
const setup = () => render(<NotificationProvider><Probe /></NotificationProvider>);
const show = (n) => act(() => notify(n));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("NotificationProvider", () => {
  it("errorはrole=alertで、自動では消えない", () => {
    setup();
    show({ type: "error", message: "失敗した" });
    expect(screen.getByRole("alert").textContent).toContain("失敗した");
    act(() => void vi.advanceTimersByTime(AUTO_DISMISS_MS * 10));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("success・infoはrole=statusで、4秒後に消える", () => {
    setup();
    show({ type: "success", message: "保存した" });
    show({ type: "info", message: "お知らせ" });
    expect(screen.getAllByRole("status")).toHaveLength(2);
    act(() => void vi.advanceTimersByTime(AUTO_DISMISS_MS));
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("同じ文言は重ねて出さない", () => {
    setup();
    show({ type: "error", message: "同じ" });
    show({ type: "error", message: "同じ" });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("同時に表示するのは最大3件で、古いものから消す", () => {
    setup();
    for (const m of ["1", "2", "3", "4"]) show({ type: "error", message: m });
    const texts = screen.getAllByRole("alert").map((e) => e.textContent);
    expect(texts).toHaveLength(3);
    expect(texts.join()).not.toContain("1閉じる");
    expect(texts.some((t) => t.startsWith("4"))).toBe(true);
  });

  it("閉じるボタン（ラベルつき）で消せる", () => {
    setup();
    show({ type: "error", message: "失敗した" });
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Providerの外でuseNotifyを使うと分かりやすい例外になる", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/NotificationProvider/);
    spy.mockRestore();
  });
});
