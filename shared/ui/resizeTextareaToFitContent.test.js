import test from "node:test";
import assert from "node:assert/strict";
import resizeTextareaToFitContent from "./resizeTextareaToFitContent.js";

function fakeTextarea(scrollHeight) {
  return {
    style: { height: "" },
    scrollHeight,
  };
}

test("does nothing when passed a falsy element", () => {
  assert.doesNotThrow(() => resizeTextareaToFitContent(null));
  assert.doesNotThrow(() => resizeTextareaToFitContent(undefined));
});

test("sets the height to the element's scrollHeight in pixels", () => {
  const el = fakeTextarea(120);

  resizeTextareaToFitContent(el);

  assert.equal(el.style.height, "120px");
});

test("resets height to auto before measuring, so shrinking content is reflected", () => {
  const heightValuesSeen = [];
  const el = {
    style: {
      set height(value) {
        heightValuesSeen.push(value);
      },
      get height() {
        return heightValuesSeen[heightValuesSeen.length - 1];
      },
    },
    get scrollHeight() {
      // 高さをautoに戻した直後（1回目の代入後）にのみ、縮んだ実際のscrollHeightを返す
      // ふりをする素朴なfake。autoへ戻さず古い高さのままscrollHeightを測ると、
      // スクロールバー分大きい値のままになってしまう問題を検知する
      return heightValuesSeen[heightValuesSeen.length - 1] === "auto" ? 40 : 999;
    },
  };

  resizeTextareaToFitContent(el);

  assert.deepEqual(heightValuesSeen, ["auto", "40px"]);
});
