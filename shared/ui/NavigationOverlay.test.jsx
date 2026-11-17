import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import NavigationOverlay from "./NavigationOverlay.jsx";

afterEach(cleanup);

function setup(linkAttrs) {
  const { container } = render(
    <>
      <NavigationOverlay />
      <a data-testid="l" {...linkAttrs}>link</a>
      <p data-testid="p">text</p>
    </>,
  );
  return { overlay: container.querySelector("#nav-overlay"), q: (id) => container.querySelector(`[data-testid=${id}]`) };
}

describe("NavigationOverlay", () => {
  it("サイト内リンクのクリックでvisibleを付ける", () => {
    const { overlay, q } = setup({ href: "/next" });
    fireEvent.click(q("l"));
    expect(overlay.classList.contains("visible")).toBe(true);
  });

  it.each([
    ["外部リンク", { href: "https://example.com" }],
    ["別タブ", { href: "/x", target: "_blank" }],
    ["hrefなし", {}],
  ])("%sでは表示しない", (_name, attrs) => {
    const { overlay, q } = setup(attrs);
    fireEvent.click(q("l"));
    expect(overlay.classList.contains("visible")).toBe(false);
  });

  it("リンク以外のクリックでは表示しない", () => {
    const { overlay, q } = setup({ href: "/next" });
    fireEvent.click(q("p"));
    expect(overlay.classList.contains("visible")).toBe(false);
  });
});
