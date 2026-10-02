import "./jsdomSetup.js";
import test, { describe, mock } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "@testing-library/react";
import { useValueChange } from "./useValueChange.js";

describe("useValueChange", () => {
  test("初回レンダー時はonChangeを呼ばない", () => {
    const onChange = mock.fn();
    renderHook(() => useValueChange("a", onChange));

    assert.equal(onChange.mock.callCount(), 0);
  });

  test("値が変化した場合、新旧の値を渡してonChangeを呼ぶ", () => {
    const onChange = mock.fn();
    const { rerender } = renderHook(({ value }) => useValueChange(value, onChange), {
      initialProps: { value: "a" },
    });

    rerender({ value: "b" });

    assert.equal(onChange.mock.callCount(), 1);
    assert.deepEqual(onChange.mock.calls[0].arguments, ["b", "a"]);
  });

  test("同じ値での再レンダーではonChangeを呼ばない", () => {
    const onChange = mock.fn();
    const { rerender } = renderHook(({ value }) => useValueChange(value, onChange), {
      initialProps: { value: "a" },
    });

    rerender({ value: "a" });

    assert.equal(onChange.mock.callCount(), 0);
  });

  test("nullや他のfalsy値も有効な値として区別する", () => {
    const onChange = mock.fn();
    const { rerender } = renderHook(({ value }) => useValueChange(value, onChange), {
      initialProps: { value: "key-1" },
    });

    rerender({ value: null });

    assert.deepEqual(onChange.mock.calls[0].arguments, [null, "key-1"]);
  });
});
