"use client";

import { useEffect } from "react";

// iOS PWA（ホーム画面から起動したスタンドアロン表示）はブラウザの自動的な
// Service Worker更新チェック（ページ遷移時・約24時間おき）が働きにくく、
// アプリを終了せずバックグラウンドへ回して再度開いただけでは新バージョンに
// 気づかないことがある。アプリがフォアグラウンドに戻るたびに明示的に
// registration.update()を呼び、新バージョンの検知（UpdateNotifierが拾う
// controllerchangeイベント）を確実にする。詳細な経緯・キャッシュ戦略の全体像は
// docs/service-worker-update-pattern.mdを参照
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// サイトルートが配信する/sw.jsを登録する（詳細はdocs/service-worker-update-pattern.md）。
// 複数の独立ビルドアプリで同一サイトを構成する場合、各アプリはこのコンポーネントを
// dev-standards側からsymlinkして複製する（sync-manifest.local.json参照）。
// GitHub Pagesのプロジェクトページ等、サイトルート以外のbasePath配下（例: /app-name/）へ
// 配信するプロダクトは、swUrlへ実際に配信されるsw.jsの絶対パスを渡す（issue #346）。
export default function ServiceWorkerRegistration({ swUrl = "/sw.js" } = {}) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration;
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        registration = reg;
      })
      .catch((error) => {
        console.error("Service Worker registration failed", error);
      });

    function checkForUpdate() {
      if (document.visibilityState === "visible") {
        registration?.update().catch(() => {
          // オフライン等での更新チェック失敗は致命的ではないため無視する
        });
      }
    }

    document.addEventListener("visibilitychange", checkForUpdate);
    const intervalId = setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", checkForUpdate);
      clearInterval(intervalId);
    };
  }, [swUrl]);

  return null;
}
