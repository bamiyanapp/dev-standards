// 旧URL（GitHub Pages）のkill switch用Service Worker。既存のvite-plugin-pwa生成
// SW（Workbox）等がindex.htmlをprecache済みの場合、通常のページロードでは
// ナビゲーションリクエストがSWのfetchハンドラでインターセプトされ、古いアプリの
// index.htmlがキャッシュから返ってしまう可能性がある（index.html内のインライン
// スクリプトによるService Worker解除処理が実行される前に、古いキャッシュが
// 返ってしまうケースへの対策）。
//
// ブラウザはページロード時にSWスクリプト自体の更新確認を行うため、このファイルへの
// 差し替え（内容がバイト単位で変わる）がブラウザに検出されると、install時に
// skipWaiting()で即座に新SWへ切り替え、activate時に全キャッシュを削除・SW自身を
// unregister・開いているタブをnavigate()でリロードする。リロード後はSWが存在
// しないため、index.htmlがネットワークから直接取得され、移行ページのインライン
// スクリプトが確実に実行される
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
