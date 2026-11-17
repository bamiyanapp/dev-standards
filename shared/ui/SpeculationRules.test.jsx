import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import SpeculationRules from "./SpeculationRules.jsx";

const rules = () => document.head.querySelector('script[type="speculationrules"]');

function setConnection(c) {
  Object.defineProperty(navigator, "connection", { value: c, configurable: true });
}

beforeEach(() => {
  window.HTMLScriptElement.supports = () => true;
  setConnection(undefined);
});
afterEach(() => {
  cleanup();
  delete window.HTMLScriptElement.supports;
});

describe("SpeculationRules", () => {
  it("現在ページを除いたURLをprefetchとして挿入し、アンマウントで除去する", () => {
    const { unmount } = render(<SpeculationRules urls={["/", "/a", "/b"]} />);
    // jsdomの現在パスは "/"
    expect(JSON.parse(rules().textContent)).toEqual({ prefetch: [{ source: "list", urls: ["/a", "/b"] }] });
    unmount();
    expect(rules()).toBeNull();
  });

  it("APIが未対応なら何もしない", () => {
    window.HTMLScriptElement.supports = () => false;
    render(<SpeculationRules urls={["/a"]} />);
    expect(rules()).toBeNull();
  });

  it.each([
    ["データセーバー", { saveData: true }],
    ["2g", { effectiveType: "2g" }],
    ["slow-2g", { effectiveType: "slow-2g" }],
  ])("%sでは先読みしない", (_n, conn) => {
    setConnection(conn);
    render(<SpeculationRules urls={["/a"]} />);
    expect(rules()).toBeNull();
  });

  it("対象URLが空なら挿入しない", () => {
    render(<SpeculationRules urls={["/"]} />);
    expect(rules()).toBeNull();
    render(<SpeculationRules />);
    expect(rules()).toBeNull();
  });
});
