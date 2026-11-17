# フロントエンド共通のAPIクライアント（`shared/api/apiClient.js`）

フレームワーク非依存のESMである。`fetch`の直書きが分散すると、リトライ・エラー判定・URL組み立てが不統一になる。呼び出しを1つのクライアントへ集約する。外部ライブラリ（TanStack Query等）は入れない。

## 使い方

```js
import { createApiClient, ApiError, messageForApiError } from "./shared/apiClient.js"; // symlink先

// baseUrlは環境変数から、この1箇所だけで受け取る
export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_URL });

const items = await api.get("/items", { params: { q: "鳥", page: undefined } }); // undefined・nullは付けない
await api.post("/items", { body: { name: "x" } });
```

- `get(path, { params, signal, retry })`・`post(path, { body, signal, retry })`を持つ
- `fetch`は`createApiClient({ fetch })`で差し替えられる（テスト・SSR用）
- 応答が204ならnullを返す

## エラー（`ApiError`）

失敗は`ApiError`として投げる。`kind`で区別する。

| kind | 意味 |
|---|---|
| `network` | 通信自体の失敗 |
| `http` | 2xx以外。`status`にHTTPステータス |
| `parse` | 応答がJSONでない |

画面への通知（`alert`等）は、クライアントでは行わない。失敗をどう見せるかは呼び出し側の責務である。

利用者へ見せる文言は、`messageForApiError(error, messages)`で種別から選ぶ。`error.message`（内部メッセージ）は表示しない。`messages`で一部を上書きできる。キーは`network`・`parse`・`http`・`http:<status>`・`default`である。`shared/ui/NotificationProvider.jsx`の`notify`と組み合わせて使う。

## リトライ

`retry: { count, baseDelayMs, maxDelayMs }`で、指数バックオフの再試行ができる。既定はリトライなしである。

- 対象は、`network`と、`http`で`status`が5xxまたは429のものだけである。4xxは再試行しても変わらない
- `post`は、既定でリトライしない。応答を受け取れなかっただけで処理が成功している場合、リトライすると二重登録になるためである。冪等な更新に限り、呼び出し側が指定する
- `AbortSignal`で中断された場合は、リトライせずに`AbortError`を投げる

方針は[`serverless-api-hardening-checklist.md`](serverless-api-hardening-checklist.md)の「外部API呼び出し」と同じである。

## 配布

他の`shared/*`と同様に、`sync-manifest.local.json`のsymlinkで配布する。Viteの`resolve.preserveSymlinks`の注意点は[`shared-ui-components.md`](shared-ui-components.md)を参照する。
