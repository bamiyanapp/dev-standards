# 外部CDNの重要レンダリングパスCSS/フォントを避けるパターン

フロントエンドの`<head>`で、スタイルシートやWebフォントを外部CDN（Google Fonts・cdn.jsdelivr.net等）から`<link rel="stylesheet">`で読み込んでいるあらゆるWebアプリに共通する課題がある。karuta（[bamiyanapp/karuta](https://github.com/bamiyanapp/karuta)）#1761の調査が実例である。Bootstrap・特定のCSSフレームワークに限らない一般的な性能パターンであり、`shared/ui/bootstrap-theme.css`を使わないプロダクトにも適用できる。

## 問題: 外部CDNの`<link rel="stylesheet">`がレンダリングをブロックする

ブラウザは`<head>`内の`<link rel="stylesheet">`を、ページのレンダリングを開始する前に取得し終える必要があると扱う（レンダリングブロッキング）。読み込み元が自ドメイン外の外部CDNの場合、取得には以下が追加でかかる。

- DNS解決（自ドメインとは別ホストのため、ブラウザが未解決なら必要）
- TLSハンドシェイク（HTTPS接続の確立）
- リクエスト・レスポンスの往復（RTT）

これらは`preconnect`で多少短縮できるが、根本的には無くならない。karuta#1761の実機調査（Lighthouse `render-blocking-resources`監査）では、Google Fonts CDN・Bootstrap CDNの2つのスタイルシートだけで推定1,880msのレンダリング遅延が発生していた。この遅延がFirst Contentful Paint・Largest Contentful Paintのスコアを大きく下げていた。

## 解決: npmパッケージとしてバンドルする

同じCSS・フォントの内容であっても、ビルド時に自分のバンドルへ含めてしまえば、外部ホストへの往復自体が発生しない。

- CSSフレームワーク（Bootstrap等）: `npm install`し、エントリポイントで`import 'bootstrap/dist/css/bootstrap.min.css'`のようにimportする。CDN（`<link href="https://cdn.jsdelivr.net/...">`）は削除する
- Webフォント（Google Fonts等）: [`@fontsource`](https://fontsource.org/)系パッケージ（例: `@fontsource/m-plus-rounded-1c`）を使う。必要なウェイトのみ（例: `400.css`・`700.css`）をimportする。CDN（`<link href="https://fonts.googleapis.com/...">`）は削除する

`@fontsource`パッケージは全Unicodeサブセット（cyrillic・greek・hebrew等）のフォントファイルをビルド成果物に含めるが、CSSの`unicode-range`により、ブラウザは実際に使用する文字範囲のサブセットのみを遅延取得する。ビルド成果物のファイル数が増えること自体は、実際のダウンロード量の増加を意味しない。

karuta#1761では、この切り替えにより`render-blocking-resources`の推定遅延が1,880ms→1,050ms（残りは自前のCSSバンドル分のみ）に改善した。

## 既知の限界: ローカル検証環境とCI実行環境でスコアの改善幅が一致しないことがある

karuta#1762の実機検証では、ローカル（サンドボックス環境）でのLighthouse実行ではPerformanceスコアが0.70→0.80に改善したのに対し、実際のGitHub Actions CI環境での実行では顕著な改善が見られなかった。CPUスロットリング・ネットワーク条件（Lighthouseのシミュレート設定）がローカルとCI実行環境のマシンスペックによって変わるためと考えられる。render-blocking-resources自体の改善は環境に依存しない事実だが、**Performanceスコアという合成指標の絶対値は、測定環境に強く依存する**ことに注意する。閾値による自動マージ判定（`enable_lighthouse_ci_gating`、[`cicd-pipeline-specification.md`](cicd-pipeline-specification.md)参照）を導入する際は、必ずCI実行環境での実測値を基準に閾値を決めること。
