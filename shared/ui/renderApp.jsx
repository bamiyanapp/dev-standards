import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./ErrorBoundary.jsx";

// アプリを、StrictModeとErrorBoundaryで包んで、描画する（dev-standards#1380）。
// どのプロダクトのmain.jsxも、同じ包み方をする。違うのは、渡す値（報告先URL等）だけである。
// 新しいプロダクトが、既存のmain.jsxを書き写さずに済むように、組み立てをここに置く。
//
// 使い方（main.jsx）:
//   import renderApp from "./renderApp.jsx"; // symlink
//   renderApp(<><App /><PwaUpdatePrompt /></>, { reportUrl: `${API_BASE_URL}/report-client-error` });
//
// element: 描画するReact要素。複数の要素は、フラグメントで束ねる
// reportUrl: クライアントエラーの報告先URL（任意。ErrorBoundaryのreportUrl）
// fallbackUrl: 例外検知時に遷移するURL（任意。ErrorBoundaryのfallbackUrl）
// renderFallback: フォールバック画面を差し替える関数（任意。ErrorBoundaryのrenderFallback）
// rootElement: 描画先の要素（既定は、id="root"の要素）
// 戻り値: createRootが返すroot。テストや、unmountに使う
export default function renderApp(element, { reportUrl, fallbackUrl, renderFallback, rootElement } = {}) {
  const container = rootElement ?? document.getElementById("root");
  if (!container) {
    throw new Error("renderApp: 描画先の要素（id=\"root\"）が見つかりません");
  }
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <ErrorBoundary reportUrl={reportUrl} fallbackUrl={fallbackUrl} renderFallback={renderFallback}>
        {element}
      </ErrorBoundary>
    </StrictMode>,
  );
  return root;
}
