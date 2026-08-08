import { useEffect } from "react";

// どのページを最初に開いても、バックエンドの一覧取得APIをバックグラウンドで
// 先に取得しておき、Service Worker（shared/pwa/sw.js）のキャッシュを温めておく。
// 実際にそのページへ遷移した際はキャッシュから即座に表示できる。ブラウザセッション
// あたり1回だけ実行する（getAuthTokenの発行元に1日あたりの上限がある場合等に、
// 通常の閲覧だけで上限を消費しないようにするため）。
//
// endpoints: 先読みするURL一覧
// getAuthToken: 認証トークンを取得する非同期関数（任意）。省略時は認証ヘッダー無しでfetchする
// warmedFlagKey: sessionStorageに書き込むフラグのキー（複数プロダクトで同一オリジンを
//   共有する場合の衝突を避けるため、プロダクトごとに固有の値を指定すること）
export default function BackendCacheWarmer({ endpoints, getAuthToken, warmedFlagKey = "backend-cache-warmed" }) {
  useEffect(() => {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    if (sessionStorage.getItem(warmedFlagKey)) return;
    sessionStorage.setItem(warmedFlagKey, "1");

    (async () => {
      try {
        const token = getAuthToken ? await getAuthToken() : undefined;
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        await Promise.all((endpoints || []).map((url) => fetch(url, headers ? { headers } : undefined).catch(() => {})));
      } catch {
        // バックグラウンドでの事前取得のため、失敗しても他機能をブロックしない
      }
    })();
  }, [endpoints, getAuthToken, warmedFlagKey]);

  return null;
}
