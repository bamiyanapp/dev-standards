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

- `get`・`delete`は`(path, { params, signal, retry })`を取る
- `post`・`put`は`(path, { body, signal, retry })`を取る
- `fetch`は`createApiClient({ fetch })`で差し替えられる（テスト・SSR用）
- 応答が204、または本文が空（`content-length: 0`・空文字列）ならnullを返す

## 認証ヘッダー（`getHeaders`）

トークン等のヘッダーは、`getHeaders`で注入する。リクエストのたびに呼ばれ、値が`undefined`・`null`のキーは付けない。

```js
import { getAuth } from "firebase/auth";

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL,
  getHeaders: async ({ forceRefresh }) => {
    const user = getAuth().currentUser;
    return user ? { Authorization: `Bearer ${await user.getIdToken(forceRefresh)}` } : {};
  },
  shouldRefreshOn401: () => !!getAuth().currentUser,
});
```

- **トークンをstateへ保持せず、都度取得する**。IDトークンの有効期限は約1時間である。起動時の値を使い続けると、1時間後に全APIが401になる（[`lambda-api-firebase-auth-pattern.md`](lambda-api-firebase-auth-pattern.md)参照）。SDKは、失効が近いトークンを自動で更新して返す
- `shouldRefreshOn401`がtrueを返すとき、401を受けたら`getHeaders({ forceRefresh: true })`で取得し直し、**1回だけ**再試行する。リトライ回数（後述）とは別に数える。再試行後も401なら、`ApiError`を投げる。既定は再試行しない
- `getHeaders`が例外を投げたときは、`ApiError`に変換せず、そのまま投げる。認証SDKの失敗を、通信失敗と区別するためである

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
