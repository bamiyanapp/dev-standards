// このテンプレートにはexamination固有のUserMenu.jsx等は含めない。
// dev-standardsが提供する横断的コンポーネント（NavigationOverlay・BackToTop・
// SpeculationRules・ServiceWorkerRegistration・BackendCacheWarmer・UpdateNotifier・
// ShareButton等）を使う場合は、docs/shared-ui-components.md・
// docs/service-worker-update-pattern.mdの手順に従いsync-manifest.local.json経由で
// symlink化し、以下のように組み合わせる（プロダクト固有の値はpropsで渡す）。
//
// import NavigationOverlay from "./components/NavigationOverlay.jsx";
// import BackToTop from "./components/BackToTop.jsx";
// import SpeculationRules from "./components/SpeculationRules.jsx";
//
// function App() {
//   return (
//     <>
//       <NavigationOverlay />
//       <SpeculationRules urls={["/"]} />
//       <BackToTop />
//       {/* このアプリ固有のページコンポーネント */}
//     </>
//   );
// }

function App() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">__APP_NAME__</h1>
    </main>
  );
}

export default App;
