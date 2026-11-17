import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import UpdateNotifier from "./UpdateNotifier.jsx";

function installSW(controller) {
  const target = new EventTarget();
  target.controller = controller;
  Object.defineProperty(navigator, "serviceWorker", { value: target, configurable: true });
  return target;
}

beforeEach(() => installSW({}));
afterEach(() => {
  cleanup();
  delete navigator.serviceWorker;
});

describe("UpdateNotifier", () => {
  it("既存の制御下で切り替わったら更新バナーを表示する", () => {
    const sw = installSW({});
    render(<UpdateNotifier />);
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => void sw.dispatchEvent(new Event("controllerchange")));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "更新する" })).toBeTruthy();
  });

  it("初回インストール（制御なし）では表示しない", () => {
    const sw = installSW(null);
    render(<UpdateNotifier />);
    act(() => void sw.dispatchEvent(new Event("controllerchange")));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("serviceWorker未対応でも例外にならない", () => {
    delete navigator.serviceWorker;
    expect(() => render(<UpdateNotifier />)).not.toThrow();
  });

  it("アンマウントでリスナーを外す", () => {
    const sw = installSW({});
    const { unmount } = render(<UpdateNotifier />);
    unmount();
    expect(() => sw.dispatchEvent(new Event("controllerchange"))).not.toThrow();
  });
});
