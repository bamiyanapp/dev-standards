# PWAアイコン（ホーム画面追加用）の生成手順とmanifest.json構成

ユーザー提供のロゴ・イラスト画像をPWAのホーム画面アイコンに設定する際の具体的な手順。元画像が正方形でない・余白が少ない場合にそのままリサイズすると、OSが適用する角丸/円形クロップで内容が欠けてしまう。examination#213で確立した手順。

## 問題: 元画像をそのままリサイズするとクロップで欠ける

Android・iOSともに、ホーム画面アイコンはOS側で角丸や円形にクロップされる（アイコンの形状はOS・端末のテーマに依存し、アプリ側では制御できない）。元画像の被写体がキャンバス端近くまで描かれていると、クロップされた際に頭や手足が切れる。

## 解決: 正方形キャンバスへ余白を持たせて複数サイズを生成する

Pythonの`Pillow`（`pip install pillow`）で、白背景の正方形キャンバスに被写体を縮小して中央配置する。

```python
from PIL import Image

src = Image.open("source-illustration.png").convert("RGBA")

def make_icon(size, content_ratio, filename):
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    target_w = int(size * content_ratio)
    scale = target_w / src.width
    target_h = int(src.height * scale)
    resized = src.resize((target_w, target_h), Image.LANCZOS)
    x, y = (size - target_w) // 2, (size - target_h) // 2
    canvas.alpha_composite(resized, (x, y))
    canvas.convert("RGB").save(filename, "PNG")

make_icon(512, 0.85, "icon-512.png")           # 通常アイコン（purpose: any）
make_icon(192, 0.85, "icon-192.png")           # 通常アイコン（purpose: any）
make_icon(180, 0.80, "apple-touch-icon.png")   # iOS Safari用
make_icon(512, 0.65, "icon-maskable-512.png")  # maskable（より広い安全マージン）
```

`content_ratio`（被写体がキャンバス幅に占める割合）は用途によって変える。

- **通常アイコン**（`purpose: any`）: 0.8〜0.85程度。多くの環境ではクロップが軽微なため、余白を控えめにして視認性を保つ
- **maskable**（`purpose: maskable`、OSが円形・角丸正方形等へ大胆にクロップする前提）: 0.6〜0.65程度。[Maskable.app](https://maskable.app/)等のsafe-zoneガイドライン（中央の直径80%の円が常に見える）に沿う
- **apple-touch-icon**: iOSも角丸クロップを適用するため、通常アイコンよりやや広め

背景は透過ではなく不透明（白等）にする。iOSのホーム画面は透過部分を黒で塗りつぶすため、透過のまま使うと背景が黒くなる。

## manifest.json

```json
{
  "name": "アプリのフルネーム",
  "short_name": "ホーム画面の表示名（12文字程度まで）",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`index.html`から参照する。

```html
<link rel="icon" type="image/png" href="favicon.png" />
<link rel="apple-touch-icon" href="apple-touch-icon.png" />
<link rel="manifest" href="manifest.json" />
<meta name="theme-color" content="#ffffff" />
```

`apple-touch-icon`はiOS Safariが`manifest.json`の`icons`を認識しないことがあるため、`manifest.json`を用意していても個別に指定が必要。

## 罠: favicon等のlinkを絶対パスにすると、想定外のファイルが常に参照される

「ページごとに独立ビルドする複数アプリ構成」（`docs/vite-react-app-template.md`参照）で、各アプリがサイトの異なるサブディレクトリへデプロイされる場合、`<link rel="icon" href="/favicon.png">`のような**絶対パス**は常にサイトルートのファイルを参照する（ブラウザはこのURLをドメインルートから解決するため、どのサブディレクトリのページであっても同じ1箇所を指す）。

各アプリの`favicon.png`が全て同一内容であれば表面化しないが、`manifest.json`のように**アプリごとに内容を変えたいファイル**でこれをやると、どのページを開いても常にサイトルート（多くの場合トップページ）のmanifestが読み込まれてしまい、個別のアプリ名・起動URLが機能しない。

`href="favicon.png"`のように**相対パス**（先頭にスラッシュを付けない）で指定し、各ページが自分自身と同じディレクトリのファイルを参照するようにする。`manifest.json`内の`start_url`・`scope`はアプリごとの実際のデプロイ先パスを絶対パスで指定してよい（`manifest.json`自体はそのアプリのディレクトリから解決されるため、参照元の相対パス問題とは別）。

## 実例

examination `app/*/public/manifest.json`・各`index.html`（[examination#213](https://github.com/bamiyanapp/examination/issues/213)）。
