// PWAの汎用キャッシュ戦略。ナビゲーション（ページ本体）はNetwork First、それ以外の
// 同一オリジンサブリソース・設定済みAPIホストへのGETはStale-While-Revalidateで扱う。
// 「更新後もキャッシュされた古いコードが表示され続ける」問題への対応として、
// ページ本体だけはネットワーク優先にしている。詳細な設計判断の経緯は
// docs/service-worker-update-pattern.mdを参照。
//
// このファイルは汎用化のためプロダクト固有の値を一切持たない。同じディレクトリの
// sw-config.js（プロダクト固有、dev-standardsでは共有しない）が下記のグローバルを
// 定義している前提で動作する。
//   self.SW_CONFIG = {
//     cacheVersion: string,   // キャッシュ名のバージョンサフィックス。キャッシュ戦略・
//                             // precacheUrls等を変更した際は必ず値を変更し、
//                             // activate時に旧キャッシュを確実に破棄させること
//     precacheUrls: string[], // インストール時に先読みキャッシュするページ一覧
//     apiHostnames: string[], // Stale-While-Revalidateでキャッシュするバックエンド
//                             // APIのホスト名一覧（同一オリジンでない別ホストのAPI）
//     noCacheSameOriginPrefixes: string[], // （任意、既定[]）Cookie等の認証セッションに
//                             // 依存し、レスポンスがアカウントごとに変わる同一オリジンAPI
//                             // のパスprefix一覧。Cache StorageのキーはURLのみでCookieを
//                             // 考慮しないため、通常のStale-While-Revalidate対象に含めると
//                             // 別アカウントへの切り替え後も前のアカウントのレスポンスを
//                             // 返し続けてしまう。ここに列挙したprefixに一致する同一オリジン
//                             // GETはキャッシュ対象から完全に除外し、常にネットワークへ
//                             // 直接流す
//   };
importScripts("./sw-config.js");

const { cacheVersion, precacheUrls, apiHostnames, noCacheSameOriginPrefixes = [] } = self.SW_CONFIG;
const STATIC_CACHE = `pwa-static-${cacheVersion}`;
const API_CACHE = `pwa-api-${cacheVersion}`;
const CURRENT_CACHES = [STATIC_CACHE, API_CACHE];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(
        precacheUrls.map(async (url) => {
          try {
            // X-Precache-Requestは、認証チェックを同一オリジン最前段（Lambda@Edge等）で
            // 行っている構成において、これが「ページ本体への実際のナビゲーションではなく
            // バックグラウンドの先読みfetchである」ことを伝えるための独自ヘッダー。
            // ブラウザが自動付与するSec-Fetch-Modeだけに頼ると、送信されない・
            // ブラウザ実装依存で信頼できない場合がある。認証を挟まない構成では
            // 参照されないだけで無害なため、常に送ってよい
            const response = await fetch(url, { headers: { "X-Precache-Request": "1" } });
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch {
            // オフライン等でプリキャッシュに失敗しても致命的ではないため無視する
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

// キャッシュを即座に返しつつ、裏側でネットワーク取得してキャッシュを更新する。
// キャッシュが無い場合のみネットワークの結果を待って返す。ページ本体以外の
// サブリソース（ハッシュ付きJS/CSS等、内容が変われば別ファイル名になるもの）・
// 設定済みAPIホストにはこの方式を使う
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await networkFetch) || Response.error();
}

// ページ本体（HTMLナビゲーション）用。まずネットワークから最新を取得し、
// 取得できた場合のみキャッシュを更新して返す。オフライン等でネットワークが
// 使えない場合のみキャッシュ（インストール時のプリキャッシュ等）にフォールバックする。
// Stale-While-Revalidateと異なり、表示が「1回前のデプロイ内容」のまま固定される
// ことがなく、常に最新のHTMLを取得する
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // POST等は毎回必ず最新のネットワークリクエストが必要なためキャッシュ対象から除外する
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (apiHostnames.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    // 認証セッション（Cookie）に依存し、アカウントごとにレスポンスが変わる同一オリジン
    // APIはキャッシュ対象から除外する。event.respondWithを呼ばずreturnすることで、
    // ブラウザの通常のfetch処理（キャッシュを介さない）に委ねる
    if (noCacheSameOriginPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
      return;
    }

    // request.modeが"navigate"のリクエストはページ本体そのもの（URL直接入力・
    // リンククリック等によるフルページ遷移）を指す標準的な判定方法。それ以外の
    // 同一オリジンGET（ハッシュ付きJS/CSS等のサブリソース）はStale-While-Revalidateのまま
    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request, STATIC_CACHE));
    } else {
      event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    }
  }
});
