import { useEffect } from "react";

// Speculation Rules API（Chrome）で他ページのHTML/JS/CSSをバックグラウンドで
// 先読み（prefetch）し、リンククリック時の遷移を高速化する。データセーバー有効時・
// 低速回線時は通信量を考慮し先読みしない。urlsはpropsで受け取り、現在ページ自身は
// 自動的に除外する。prerenderはページ側のuseEffectでのデータ取得等が意図せず
// 先走って実行される副作用があるため、prefetchのみに対応する
export default function SpeculationRules({ urls }) {
  useEffect(() => {
    if (!window.HTMLScriptElement?.supports?.("speculationrules")) return;

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData) return;
    if (connection?.effectiveType && ["slow-2g", "2g"].includes(connection.effectiveType)) return;

    const filteredUrls = (urls || []).filter((url) => url !== window.location.pathname);
    if (filteredUrls.length === 0) return;

    const script = document.createElement("script");
    script.type = "speculationrules";
    script.textContent = JSON.stringify({ prefetch: [{ source: "list", urls: filteredUrls }] });
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [urls]);

  return null;
}
