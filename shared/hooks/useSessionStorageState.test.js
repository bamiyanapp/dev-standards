import "./jsdomSetup.js";
import test, { describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { renderHook, act } from "@testing-library/react";
import { useSessionStorageState } from "./useSessionStorageState.js";

describe("useSessionStorageState", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("未保存の場合はdefaultValueを返す", () => {
    const { result } = renderHook(() => useSessionStorageState("myKey", []));
    assert.deepEqual(result.current[0], []);
  });

  test("sessionStorageに保存済みのJSONがあればパースして返す", () => {
    sessionStorage.setItem("players", JSON.stringify(["たろう"]));
    const { result } = renderHook(() => useSessionStorageState("players", []));
    assert.deepEqual(result.current[0], ["たろう"]);
  });

  test("壊れたJSONが保存されている場合はdefaultValueにフォールバックする", () => {
    sessionStorage.setItem("broken", "{not valid json");
    const { result } = renderHook(() => useSessionStorageState("broken", { fallback: true }));
    assert.deepEqual(result.current[0], { fallback: true });
  });

  test("値を更新するとsessionStorageにJSONとして永続化される", () => {
    const { result } = renderHook(() => useSessionStorageState("myKey", {}));

    act(() => {
      result.current[1]({ a: 1 });
    });

    assert.deepEqual(result.current[0], { a: 1 });
    assert.equal(sessionStorage.getItem("myKey"), JSON.stringify({ a: 1 }));
  });
});
