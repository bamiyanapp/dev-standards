import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConfirmDialog from "./ConfirmDialog.jsx";

// jsdomは<dialog>のshowModal・closeを実装していないことがあるため、openプロパティだけを模す
beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = vi.fn(function () {
    this.open = true;
  });
  window.HTMLDialogElement.prototype.close = vi.fn(function () {
    this.open = false;
  });
});
afterEach(cleanup);

const base = { title: "削除の確認", message: "元に戻せません", confirmLabel: "削除する" };

describe("ConfirmDialog", () => {
  it("openでshowModalを呼び、閉じるとcloseを呼ぶ", () => {
    const { rerender } = render(<ConfirmDialog {...base} open onConfirm={() => {}} onCancel={() => {}} />);
    expect(window.HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    expect(screen.getByText("元に戻せません")).toBeTruthy();
    rerender(<ConfirmDialog {...base} open={false} onConfirm={() => {}} onCancel={() => {}} />);
    expect(window.HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1);
  });

  it("実行ボタンの文言は動詞で、キャンセルボタンが初期フォーカスを持つ", () => {
    render(<ConfirmDialog {...base} open onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("button", { name: "削除する", hidden: true })).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("キャンセル");
  });

  it("キャンセルボタン・Escキー・背景クリックでonCancelを呼ぶ", () => {
    const onCancel = vi.fn();
    const { container } = render(<ConfirmDialog {...base} open onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("キャンセル"));
    const dialog = container.querySelector("dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.click(dialog);
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it("onConfirmがPromiseを返す間は、ボタンを無効にし二重送信を防ぐ", async () => {
    let resolve;
    const onConfirm = vi.fn(() => new Promise((r) => (resolve = r)));
    render(<ConfirmDialog {...base} open onConfirm={onConfirm} onCancel={() => {}} />);
    const button = screen.getByText("削除する");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    resolve();
    await waitFor(() => expect(button.disabled).toBe(false));
  });
});
