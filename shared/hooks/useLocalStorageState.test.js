import "./jsdomSetup.js";
import test, { describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorageState } from "./useLocalStorageState.js";

describe("useLocalStorageState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("未保存の場合はdefaultValueを返す", () => {
    const { result } = renderHook(() => useLocalStorageState("myKey", "default"));
    assert.equal(result.current[0], "default");
  });

  test("localStorageに保存済みの値があればそれを返す（parseあり）", () => {
    localStorage.setItem("count", "5");
    const { result } = renderHook(() => useLocalStorageState("count", 2, (v) => parseInt(v, 10)));
    assert.equal(result.current[0], 5);
  });

  test("値を更新するとlocalStorageに永続化される", () => {
    const { result } = renderHook(() => useLocalStorageState("myKey", "default"));

    act(() => {
      result.current[1]("updated");
    });

    assert.equal(result.current[0], "updated");
    assert.equal(localStorage.getItem("myKey"), "updated");
  });

  test("数値・真偽値もformatを介さずlocalStorageに正しく文字列化される", () => {
    const { result } = renderHook(() => useLocalStorageState("flag", false, (v) => v === "true"));

    act(() => {
      result.current[1](true);
    });

    assert.equal(localStorage.getItem("flag"), "true");
    assert.equal(result.current[0], true);
  });
});
