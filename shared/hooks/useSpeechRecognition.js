import { useCallback, useEffect, useRef, useState } from "react";

// SpeechRecognition（音声認識）は標準のDOM型定義に含まれていない（Chrome系ブラウザ
// 独自実装が事実上の標準として広く使われているのみ）ため、フィーチャー検出のみ行う。
// 未対応環境（iOS Safari・Firefox等）ではisSupportedがfalseになり、start()は何もしない。
function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

// 音声認識を1回分（start〜結果またはエラーまで）実行するフック。
// lang: 認識言語（既定"ja-JP"）
// onResult(transcript): 認識結果を受け取ったときに呼ばれる
// onError(error): ブラウザから認識エラーが通知されたときに呼ばれる
// onNoResult(): 発話が検出できずに終了した（結果もエラーも無いまま終わった）ときに呼ばれる
export function useSpeechRecognition({ lang = "ja-JP", onResult, onError, onNoResult } = {}) {
  // ctorはマウント後に変わらない値のため、useRefではなくuseStateで保持し
  // レンダー中に.currentを読む形（React的に非推奨）を避ける
  const [SpeechRecognitionCtor] = useState(() => getSpeechRecognitionCtor());
  const callbacksRef = useRef({ onResult, onError, onNoResult });
  useEffect(() => {
    callbacksRef.current = { onResult, onError, onNoResult };
  }, [onResult, onError, onNoResult]);

  const start = useCallback(() => {
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.interimResults = false;
    let resultReceived = false;

    recognition.onresult = (event) => {
      resultReceived = true;
      callbacksRef.current.onResult?.(event.results[0][0].transcript);
    };

    recognition.onerror = (event) => {
      resultReceived = true;
      callbacksRef.current.onError?.(event.error);
    };

    recognition.onend = () => {
      if (!resultReceived) {
        callbacksRef.current.onNoResult?.();
      }
    };

    recognition.start();
  }, [lang, SpeechRecognitionCtor]);

  return { isSupported: !!SpeechRecognitionCtor, start };
}
