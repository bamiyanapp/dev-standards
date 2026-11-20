import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import renderApp from "./renderApp.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
beforeEach(() => {
  container = document.createElement("div");
  container.id = "root";
  document.body.appendChild(container);
  vi.spyOn(console, "error").mockImplementation(() => {});
  globalThis.fetch = vi.fn().mockResolvedValue({});
});
afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
});

function Boom() {
  throw new Error("kaboom");
}

describe("renderApp", () => {
  it("指定した要素へ、アプリを描画して、rootを返す", async () => {
    let root;
    await act(async () => {
      root = renderApp(<p>本体</p>, { rootElement: container });
    });
    expect(container.textContent).toBe("本体");
    expect(typeof root.unmount).toBe("function");
  });

  it("rootElementを省略すると、id=\"root\"の要素へ描画する", async () => {
    await act(async () => {
      renderApp(<p>既定の描画先</p>);
    });
    expect(container.textContent).toBe("既定の描画先");
  });

  it("未捕捉の例外は、ErrorBoundaryが受けて、reportUrlへ報告する", async () => {
    await act(async () => {
      renderApp(<Boom />, { rootElement: container, reportUrl: "https://example.com/report" });
    });
    expect(container.textContent).not.toBe("");
    expect(globalThis.fetch).toHaveBeenCalledWith("https://example.com/report", expect.anything());
  });

  it("描画先が無い場合は、分かる文言のエラーにする", () => {
    container.remove();
    expect(() => renderApp(<p>x</p>)).toThrow(/id="root"/);
    document.body.appendChild(container);
  });
});
