import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary.jsx";

function Boom() {
  throw new Error("kaboom");
}

let location;
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  location = { reload: vi.fn(), href: "http://localhost/page" };
  vi.stubGlobal("location", location);
  globalThis.fetch = vi.fn().mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ErrorBoundary", () => {
  it("例外が無ければ、子をそのまま表示する", () => {
    render(<ErrorBoundary><p>正常</p></ErrorBoundary>);
    expect(screen.getByText("正常")).toBeTruthy();
  });

  it("例外を捕捉すると、既定のBootstrapのフォールバックと再読み込みボタンを表示する。押すと再読み込みする", () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText("エラーが発生しました")).toBeTruthy();
    const button = screen.getByRole("button", { name: "再読み込み" });
    expect(button.className).toBe("btn btn-primary");
    fireEvent.click(button);
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it("fallbackUrlがあれば、例外の検知時にそのURLへ遷移し、ボタンもそのURLへ遷移する（再読み込みはしない）", () => {
    render(<ErrorBoundary fallbackUrl="/stable"><Boom /></ErrorBoundary>);
    expect(location.href).toBe("/stable");
    location.href = "http://localhost/page";
    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(location.href).toBe("/stable");
    expect(location.reload).not.toHaveBeenCalled();
  });

  it("reportUrlがあれば、例外情報をPOSTする。送信が失敗しても、フォールバックを表示する", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    render(<ErrorBoundary reportUrl="/report"><Boom /></ErrorBoundary>);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/report");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ message: "kaboom", url: "http://localhost/page" });
    expect(screen.getByText("エラーが発生しました")).toBeTruthy();
  });

  it("renderFallbackを渡すと、表示を差し替えられる。reloadとerrorを受け取る（Bootstrapのクラスは出ない）", () => {
    const renderFallback = ({ reload, error }) => (
      <div className="tw-fallback">
        <span>{error.message}</span>
        <button type="button" onClick={reload}>もう一度</button>
      </div>
    );
    const { container } = render(<ErrorBoundary renderFallback={renderFallback}><Boom /></ErrorBoundary>);
    expect(screen.getByText("kaboom")).toBeTruthy();
    expect(container.querySelector(".btn")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "もう一度" }));
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it("renderFallbackのreloadも、fallbackUrlがあればそこへ遷移する", () => {
    render(<ErrorBoundary fallbackUrl="/stable" renderFallback={({ reload }) => <button type="button" onClick={reload}>戻る</button>}><Boom /></ErrorBoundary>);
    location.href = "http://localhost/page";
    fireEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(location.href).toBe("/stable");
    expect(location.reload).not.toHaveBeenCalled();
  });
});
