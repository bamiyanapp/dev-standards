# PWA起動時の白画面対策（`index.html`への静的ローディング表示）

PWA（ホーム画面に追加したアプリ、スタンドアロン表示）を起動した際、JSバンドルの読み込み・パース・Reactのマウントが完了するまでの間、画面が真っ白になる問題への対処。通常のブラウザタブでは前後にブラウザ自体のUIがあるため気になりにくいが、PWAでは画面全体がアプリ表示領域になるため、この空白期間がより目立つ（[examination#156](https://github.com/bamiyanapp/examination/issues/156)）。

## 原因

各アプリの`index.html`は`<div id="root"></div>`が空のまま配信され、JSバンドルの読み込み・パース・実行（Reactのマウント）が完了するまで、ブラウザは何も表示するものを持たない。

## 対処: JS非依存の静的ローディング表示を`index.html`へ直接埋め込む

コード共有ではなく、コピー可能なスニペット＋手順としてのレシピ。JSバンドルの読み込みを待たずにブラウザがHTML/CSSだけで表示できるよう、ローディング表示（スピナー）を`index.html`の`<div id="root">`の**中身**として直接書く。`createRoot(document.getElementById("root")).render(<App />)`はマウント時に`#root`の中身を丸ごと置き換えるため、追加のJSコードなしにReactマウント完了と同時に自動的に消える。

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>アプリ名</title>
    <style>
      #initial-loading {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        color: #1f2937;
      }
      #initial-loading div {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 4px solid rgba(127, 127, 127, 0.3);
        border-top-color: currentColor;
        animation: initial-loading-spin 0.8s linear infinite;
      }
      @keyframes initial-loading-spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-color-scheme: dark) {
        #initial-loading {
          background: #1d232a;
          color: #a6adbb;
        }
      }
    </style>
  </head>
  <body>
    <div id="root">
      <div id="initial-loading" aria-hidden="true">
        <div></div>
      </div>
    </div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

導入時は、色（`background`/`color`）・タイトルをプロダクトに合わせて変更する。

## 設計上の要点

- `<style>`はビルド後のCSS（Tailwind等）を一切経由しない、`index.html`自体へのインラインスタイルにする。ビルド後CSSの読み込みもJSと同様に時間がかかるため、そこに依存するとローディング表示自体の表示も遅れてしまう
- `prefers-color-scheme`メディアクエリで明暗テーマに追従させる。ビルド後のTailwind設定（`data-theme`属性等）とは独立した、ブラウザ標準のOSテーマ設定ベースの判定になるが、ローディング表示自体はごく短時間しか表示されないため実用上問題にならない
- `aria-hidden="true"`を付け、スクリーンリーダーに読み上げさせない
- このパターンは`index.html`という各アプリのビルド設定ファイルに直接埋め込む性質上、`shared/pwa/`のようなJSファイルのsymlink共有には向かない。プロダクトごとに`index.html`へ直接コピー＆調整する
- Service Workerによるキャッシュ更新パターン（`docs/service-worker-update-pattern.md`）とは別の問題（こちらはJS到達前の空白、あちらはHTML自体の到達・更新検知）のため、混同しないこと。PWA起動時の体感速度改善としては、本パターンに加えてHTML到達自体の速度（ナビゲーションリクエストのキャッシュ戦略）も別途検討する余地がある（examinationでの検討例: examination#175）
