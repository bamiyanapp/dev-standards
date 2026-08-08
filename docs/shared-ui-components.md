# 共有UIコンポーネント（`shared/ui/`, `shared/pwa/`）

複数の独立ビルドフロントエンドアプリで同一サイトを構成するプロダクト（examination等）で、プロダクト固有の値を持たない、または小さなpropsで汎用化できる横断的UIコンポーネントを`shared/ui/`へ集約する。PWAキャッシュ更新パターン（`shared/pwa/`）と同様、`sync-manifest.local.json`経由でsymlink共有する（セットアップ手順は`docs/service-worker-update-pattern.md`「セットアップ手順」参照、考え方は共通）。

## 提供するコンポーネント

### `shared/ui/NavigationOverlay.jsx`

SPAクライアントサイドルーティングを導入しない全ページ遷移の設計で、リンククリックから実際の画面遷移までの間、読み込み中であることが分かるオーバーレイを表示する。プロダクト固有の値は無いが、利用側のCSSに以下のルールが必要（Tailwindのユーティリティだけでは表現できない状態遷移のため）。

```css
.nav-overlay.visible {
  display: flex;
}
```

### `shared/ui/BackToTop.jsx`

他ページへ戻るリンク。`href`（既定`"/"`）・`label`（既定`"← トップに戻る"`）をpropsで受け取る。

```jsx
<BackToTop href="/" label="← トップに戻る" />
```

### `shared/ui/SpeculationRules.jsx`

Speculation Rules API（Chrome）による他ページのprefetch。`urls`（先読み対象のURL一覧）をpropsで受け取る。現在ページ自身は自動的に除外する。データセーバー有効時・低速回線時は先読みしない。

```jsx
<SpeculationRules urls={["/", "/about/"]} />
```

### `shared/pwa/BackendCacheWarmer.jsx`

初回訪問時にバックエンドAPIをバックグラウンドで先読みし、Service Worker（`shared/pwa/sw.js`）のキャッシュを温めておく。`endpoints`（先読みするURL一覧）・`getAuthToken`（認証トークンを取得する非同期関数、任意）・`warmedFlagKey`（`sessionStorage`のフラグキー、プロダクトごとに固有の値にすること）をpropsで受け取る。

```jsx
<BackendCacheWarmer
  endpoints={["https://api.example.com/questions"]}
  getAuthToken={async () => {
    const res = await fetch("/_voice-token", { method: "POST" });
    if (!res.ok) return undefined;
    const { token } = await res.json();
    return token;
  }}
  warmedFlagKey="myapp-backend-cache-warmed"
/>
```

### `shared/ui/ShareButton.jsx`

現在のページをQRコードで表示し、URLをワンタップコピーできるボタン＋モーダル。スマートフォンオンリーの利用環境での画面共有を想定。

```jsx
<ShareButton label="このページを共有" />
```

**依存関係**: `qrcode.react`を利用側の`package.json`へ追加する必要がある（dev-standards側では強制できない）。

**Viteの`resolve.preserveSymlinks`が必須**: `ShareButton.jsx`のようにnpmパッケージをimportするコンポーネントをsymlink経由で共有する場合、Viteは既定でシンボリックリンクの実体パス（dev-standards配下）を起点に`node_modules`を探索するため、利用側にインストール済みの`qrcode.react`を見つけられずビルドエラーになる。利用側の`vite.config.js`へ以下を追加すること（PRECACHE等プロダクト固有値を持たないコンポーネント同士でも、npmパッケージに依存する共有コンポーネントを1つでも導入する場合はアプリ全体でこの設定が必要になる）。

```js
export default defineConfig({
  // ...
  resolve: {
    preserveSymlinks: true,
  },
});
```

## `sync-manifest.local.json`への追加例

```json
{
  "symlinks": [
    { "source": "shared/ui/NavigationOverlay.jsx", "target": "app/top/src/components/NavigationOverlay.jsx" },
    { "source": "shared/ui/BackToTop.jsx", "target": "app/top/src/components/BackToTop.jsx" },
    { "source": "shared/ui/SpeculationRules.jsx", "target": "app/top/src/components/SpeculationRules.jsx" },
    { "source": "shared/pwa/BackendCacheWarmer.jsx", "target": "app/top/src/components/BackendCacheWarmer.jsx" },
    { "source": "shared/ui/ShareButton.jsx", "target": "app/top/src/components/ShareButton.jsx" }
  ]
}
```

複数の独立ビルドアプリで同一コンポーネントを使う場合は、アプリの数だけエントリを追加する（`source`は同じでよい）。
