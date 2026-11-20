import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShareButton from "./ShareButton.jsx";

afterEach(cleanup);

describe("ShareButton", () => {
  it("開くまではモーダルを表示しない", () => {
    render(<ShareButton />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("開くとgetUrlのURLを表示し、閉じるで消える", () => {
    render(<ShareButton label="共有" getUrl={() => "https://example.com/a"} />);
    fireEvent.click(screen.getByRole("button", { name: "共有" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("https://example.com/a")).toBeTruthy();
    fireEvent.click(screen.getByText("閉じる"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("背景（backdrop）をクリックすると閉じる（dev-standards#1541）", () => {
    const { container } = render(<ShareButton label="共有" getUrl={() => "https://example.com/c"} />);
    fireEvent.click(screen.getByRole("button", { name: "共有" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(container.ownerDocument.querySelector(".modal-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("URLをコピーするとクリップボードへ書き込み、表示が変わる", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareButton getUrl={() => "https://example.com/b"} />);
    fireEvent.click(screen.getByRole("button", { name: "このページを共有" }));
    fireEvent.click(screen.getByRole("button", { name: "URLをコピー" }));
    await waitFor(() => expect(screen.getByText("コピーしました")).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith("https://example.com/b");
  });

  it("クリップボードが使えなくても例外にならない", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareButton getUrl={() => "u"} />);
    fireEvent.click(screen.getByRole("button", { name: "このページを共有" }));
    fireEvent.click(screen.getByRole("button", { name: "URLをコピー" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByText("URLをコピー")).toBeTruthy();
  });
});
