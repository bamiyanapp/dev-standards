// AppShell.jsxの型定義（dev-standards#1666）。型定義が無いと、TypeScriptの参照側（tsc -b）では、
// 既定値の無い分割代入のpropsが「全て必須」と推論され、使わないprops（swUrl等）も渡す必要があった。
// reactの型は、importせず、グローバルの`React`名前空間を使う（symlink共有で、参照側のnode_modulesを
// 解決できない場合があるため。createViteConfig.d.tsと同じ理由）。
//
// symlinkの名前が`AppShell.jsx`と異なる場合（例: `SharedAppShell.jsx`）は、型定義のsymlinkも、同じ名前
// （`SharedAppShell.d.ts`）で置く。TypeScriptは、importした名前に対応する`.d.ts`を探すため。

type AnyComponent = React.ComponentType<any>;

export interface AppShellParts {
  ServiceWorkerRegistration?: AnyComponent;
  BackendCacheWarmer?: AnyComponent;
  UpdateNotifier?: AnyComponent;
  SpeculationRules?: AnyComponent;
  NavigationOverlay?: AnyComponent;
  UserMenu?: AnyComponent;
  BackToTop?: AnyComponent;
}

export interface AppShellProps {
  /** 描画するページ */
  page: React.ReactNode;
  /** 注入する部品。渡さなかった部品は、描画しない */
  parts?: AppShellParts;
  /** SpeculationRulesへ渡す先読みURL。空・未指定なら、SpeculationRulesを描画しない */
  prefetchUrls?: string[];
  /** BackendCacheWarmerへ渡す先読みURL。空・未指定なら、BackendCacheWarmerを描画しない */
  backendEndpoints?: string[];
  /** BackendCacheWarmerへ、そのまま渡す認証トークンの取得関数 */
  getBackendAuthToken?: () => unknown;
  /** BackendCacheWarmerへ、そのまま渡すフラグのキー */
  warmedFlagKey?: string;
  /** ServiceWorkerRegistrationへ渡す、sw.jsの絶対パス */
  swUrl?: string;
  /** BackToTopを表示するか（既定はtrue） */
  showBackToTop?: boolean;
}

export default function AppShell(props: AppShellProps): React.JSX.Element;
