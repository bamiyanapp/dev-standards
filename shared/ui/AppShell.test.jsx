import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import AppShell from "./AppShell.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// 描画順と、渡されたpropsを記録する偽の部品
function makeParts(log) {
  const part = (name) =>
    function Part(props) {
      log.push({ name, props });
      return <i data-part={name} />;
    };
  return {
    ServiceWorkerRegistration: part("ServiceWorkerRegistration"),
    BackendCacheWarmer: part("BackendCacheWarmer"),
    UpdateNotifier: part("UpdateNotifier"),
    SpeculationRules: part("SpeculationRules"),
    NavigationOverlay: part("NavigationOverlay"),
    UserMenu: part("UserMenu"),
    BackToTop: part("BackToTop"),
  };
}

function render(element) {
  act(() => root.render(element));
}

const names = () => [...container.querySelectorAll("[data-part]")].map((e) => e.dataset.part);

describe("AppShell", () => {
  it("部品を、決まった順序で並べ、最後にページを描画する", () => {
    const log = [];
    render(
      <AppShell
        parts={makeParts(log)}
        backendEndpoints={["/a"]}
        prefetchUrls={["/p"]}
        page={<main data-testid="page">本文</main>}
      />,
    );
    expect(names()).toEqual([
      "ServiceWorkerRegistration",
      "BackendCacheWarmer",
      "UpdateNotifier",
      "SpeculationRules",
      "NavigationOverlay",
      "UserMenu",
      "BackToTop",
    ]);
    expect(container.lastElementChild.tagName).toBe("MAIN");
  });

  it("渡さなかった部品は、描画しない", () => {
    const parts = makeParts([]);
    render(<AppShell parts={{ UpdateNotifier: parts.UpdateNotifier }} page={<p>x</p>} />);
    expect(names()).toEqual(["UpdateNotifier"]);
  });

  it("partsが無くても、ページだけを描画する", () => {
    render(<AppShell page={<p data-testid="only">x</p>} />);
    expect(names()).toEqual([]);
    expect(container.textContent).toBe("x");
  });

  it("先読みURL・エンドポイントが空なら、SpeculationRules・BackendCacheWarmerを描画しない", () => {
    const parts = makeParts([]);
    render(<AppShell parts={parts} backendEndpoints={[]} page={null} />);
    expect(names()).not.toContain("SpeculationRules");
    expect(names()).not.toContain("BackendCacheWarmer");
  });

  it("showBackToTop=falseなら、BackToTopを描画しない", () => {
    render(<AppShell parts={makeParts([])} showBackToTop={false} page={null} />);
    expect(names()).not.toContain("BackToTop");
  });

  it("値を、各部品へそのまま渡す", () => {
    const log = [];
    const getToken = () => "t";
    render(
      <AppShell
        parts={makeParts(log)}
        backendEndpoints={["/a", "/b"]}
        getBackendAuthToken={getToken}
        warmedFlagKey="k"
        prefetchUrls={["/p"]}
        swUrl="/app/sw.js"
        page={null}
      />,
    );
    const propsOf = (n) => log.find((l) => l.name === n).props;
    expect(propsOf("ServiceWorkerRegistration")).toEqual({ swUrl: "/app/sw.js" });
    expect(propsOf("BackendCacheWarmer")).toEqual({ endpoints: ["/a", "/b"], getAuthToken: getToken, warmedFlagKey: "k" });
    expect(propsOf("SpeculationRules")).toEqual({ urls: ["/p"] });
  });

  it("swUrl・warmedFlagKeyを渡さなければ、部品の既定値に任せる（キーを渡さない）", () => {
    const log = [];
    render(<AppShell parts={makeParts(log)} backendEndpoints={["/a"]} page={null} />);
    const propsOf = (n) => log.find((l) => l.name === n).props;
    expect("swUrl" in propsOf("ServiceWorkerRegistration")).toBe(false);
    expect("warmedFlagKey" in propsOf("BackendCacheWarmer")).toBe(false);
  });
});
