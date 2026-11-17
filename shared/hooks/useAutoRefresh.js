import { useEffect, useRef } from "react";

// 画面が再表示されたとき、および表示中の一定間隔で、callbackを呼ぶ。
// スマートフォンのPWAで、複数人が同じデータを操作する場合に、他の人の変更を反映するために使う。
// ブラウザのリロードしか手段が無いと、ホーム画面に追加したPWAでは操作しにくい。
//
// フックは「いつ呼ぶか」だけを担当する。データの取得と反映は呼び出し側に残す。
// 自動の再取得では、読み込み中の表示を出さず、失敗しても画面にエラーを出さないこと
// （docs/frontend-ui-conventions.mdの「データ更新方式」参照）。
//
// options:
//   intervalMs: 表示中に呼ぶ間隔（ミリ秒）。省略すると、再表示時のみ呼ぶ
//
// 非表示の間は、タイマーを止める。アンマウント時に、リスナーとタイマーを解除する。
// document.visibilityStateが無い環境でも例外を投げない（常に表示中として扱う）。
export function useAutoRefresh(callback, { intervalMs } = {}) {
  // 最新のcallbackを参照し、callbackの参照が変わってもタイマーを張り直さない
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  }, [callback]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    let timer = null;
    const visible = () => document.visibilityState === undefined || document.visibilityState === "visible";
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const start = () => {
      if (intervalMs > 0 && timer === null) timer = setInterval(() => latest.current(), intervalMs);
    };

    const onVisibilityChange = () => {
      if (visible()) {
        latest.current();
        start();
      } else {
        stop();
      }
    };

    if (visible()) start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [intervalMs]);
}
