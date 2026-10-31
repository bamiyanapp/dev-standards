import "./jsdomSetup.js";
import test, { describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { renderHook, act } from "@testing-library/react";
import { useSpeechRecognition } from "./useSpeechRecognition.js";

describe("useSpeechRecognition", () => {
  let originalSpeechRecognition;

  beforeEach(() => {
    originalSpeechRecognition = window.SpeechRecognition;
  });

  afterEach(() => {
    if (originalSpeechRecognition === undefined) {
      delete window.SpeechRecognition;
    } else {
      window.SpeechRecognition = originalSpeechRecognition;
    }
  });

  class FakeRecognition {
    start() {
      FakeRecognition.lastInstance = this;
    }
  }

  test("SpeechRecognition未対応の場合、isSupportedはfalseでstart()は何もしない", () => {
    delete window.SpeechRecognition;

    const { result } = renderHook(() => useSpeechRecognition({}));

    assert.equal(result.current.isSupported, false);
    assert.doesNotThrow(() => result.current.start());
  });

  test("対応環境ではisSupportedがtrueで、認識結果がonResultへ渡る", () => {
    window.SpeechRecognition = FakeRecognition;
    const results = [];

    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult: (text) => results.push(text) }),
    );

    assert.equal(result.current.isSupported, true);

    act(() => {
      result.current.start();
    });
    const instance = FakeRecognition.lastInstance;
    assert.equal(instance.lang, "ja-JP");
    assert.equal(instance.interimResults, false);

    act(() => {
      instance.onresult({ results: [[{ transcript: "こんにちは" }]] });
    });

    assert.deepEqual(results, ["こんにちは"]);
  });

  test("エラー発生時はonErrorが呼ばれ、onNoResultは呼ばれない", () => {
    window.SpeechRecognition = FakeRecognition;
    let errorArg;
    let noResultCalled = false;

    const { result } = renderHook(() =>
      useSpeechRecognition({
        onError: (error) => {
          errorArg = error;
        },
        onNoResult: () => {
          noResultCalled = true;
        },
      }),
    );

    act(() => {
      result.current.start();
    });
    const instance = FakeRecognition.lastInstance;

    act(() => {
      instance.onerror({ error: "no-speech" });
      instance.onend();
    });

    assert.equal(errorArg, "no-speech");
    assert.equal(noResultCalled, false);
  });

  test("結果もエラーも無いまま終了した場合はonNoResultが呼ばれる", () => {
    window.SpeechRecognition = FakeRecognition;
    let noResultCalled = false;

    const { result } = renderHook(() =>
      useSpeechRecognition({
        onNoResult: () => {
          noResultCalled = true;
        },
      }),
    );

    act(() => {
      result.current.start();
    });
    const instance = FakeRecognition.lastInstance;

    act(() => {
      instance.onend();
    });

    assert.equal(noResultCalled, true);
  });
});
