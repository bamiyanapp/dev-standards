// アプリ起動時の定型の部品（Service Worker登録・先読み・更新通知等）を、決まった順序で組み立てる（dev-standards#1380）。
// プロダクト固有なのは、渡す値（先読みURL・APIエンドポイント・トークンの取得方法）と、使う部品だけである。
// 新しいプロダクトが、既存のAppShellを書き写さずに済むように、組み立てをここに置く。
//
// 部品は、propsの`parts`で注入する。symlink共有では、兄弟のファイルを相対importできないためである。
// 渡さなかった部品は、描画しない。プロダクトが使わない部品（例: UserMenuの無い構成）は、省けばよい。
//
// 使い方:
//   import AppShell from "./AppShell.jsx"; // symlink
//   <AppShell
//     parts={{ ServiceWorkerRegistration, BackendCacheWarmer, UpdateNotifier, SpeculationRules, NavigationOverlay, UserMenu, BackToTop }}
//     prefetchUrls={["/", "/settings/"]}
//     backendEndpoints={[`${API_BASE_URL}/items`]}
//     getBackendAuthToken={getToken}
//     warmedFlagKey="my-app-backend-cache-warmed"
//     page={<Page />}
//   />
//
// page: 描画するページ（React要素）
// parts: 注入する部品。キーは、上の使い方の7つ
// prefetchUrls: SpeculationRulesへ渡す先読みURL。空・未指定なら、SpeculationRulesを描画しない
// backendEndpoints: BackendCacheWarmerへ渡す先読みURL。空・未指定なら、BackendCacheWarmerを描画しない
// getBackendAuthToken・warmedFlagKey: BackendCacheWarmerへ、そのまま渡す
// swUrl: ServiceWorkerRegistrationへ渡す、sw.jsの絶対パス（任意）
// showBackToTop: BackToTopを表示するか（既定はtrue。トップページ等では、falseにする）
export default function AppShell({
  page,
  parts = {},
  prefetchUrls,
  backendEndpoints,
  getBackendAuthToken,
  warmedFlagKey,
  swUrl,
  showBackToTop = true,
}) {
  const {
    ServiceWorkerRegistration,
    BackendCacheWarmer,
    UpdateNotifier,
    SpeculationRules,
    NavigationOverlay,
    UserMenu,
    BackToTop,
  } = parts;
  return (
    <>
      {ServiceWorkerRegistration && <ServiceWorkerRegistration {...(swUrl ? { swUrl } : {})} />}
      {BackendCacheWarmer && backendEndpoints?.length > 0 && (
        <BackendCacheWarmer
          endpoints={backendEndpoints}
          getAuthToken={getBackendAuthToken}
          {...(warmedFlagKey ? { warmedFlagKey } : {})}
        />
      )}
      {UpdateNotifier && <UpdateNotifier />}
      {SpeculationRules && prefetchUrls?.length > 0 && <SpeculationRules urls={prefetchUrls} />}
      {NavigationOverlay && <NavigationOverlay />}
      {UserMenu && <UserMenu />}
      {BackToTop && showBackToTop && <BackToTop />}
      {page}
    </>
  );
}
