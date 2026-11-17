// フロントエンド共通のAPIクライアント（フレームワーク非依存のESM）。
// fetch直書きが分散すると、リトライ・エラー判定・URL組み立てが不統一になる。
// 外部ライブラリ（TanStack Query等）は入れない。小規模アプリでは、バンドルサイズの負担のほうが大きい。
//
// createApiClient({ baseUrl, fetch })が、get・postを持つオブジェクトを返す。
//   - baseUrlは呼び出し側が注入する（環境変数→createApiClientの1箇所だけで受け取る）
//   - fetchは差し替え可能（既定はグローバルfetch）。テストやSSRで使う
//   - クエリ文字列はURLSearchParamsで組み立てる。undefined・nullの値は付けない
//   - 失敗はApiErrorとして投げる。kindは次の3つ
//       "network": 通信自体の失敗（fetchが例外を投げた。中断は除く）
//       "http":    2xx以外（statusにHTTPステータス）
//       "parse":   応答がJSONでない
//   - 画面への通知（alert等）は行わない。失敗をどう見せるかは呼び出し側の責務
//
// リトライ（retry: { count, baseDelayMs, maxDelayMs }）は指数バックオフで、既定はリトライなし。
//   - 対象は、kind "network"と、kind "http"のstatusが5xxまたは429のみ。4xxは再試行しても変わらない
//   - 更新系（post）は、既定でリトライしない。応答を受け取れなかっただけで処理が成功している場合、
//     リトライすると二重登録になるため。冪等な更新（冪等キーがある等）に限り、呼び出し側が指定する
//   - AbortSignalで中断された場合は、リトライせずそのままAbortErrorを投げる

export class ApiError extends Error {
  constructor(kind, message, { status, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

// 末尾のスラッシュを除く。参照側のsonarjs（super-linear-regex）に違反しないよう、正規表現を使わない（#1470）
function trimTrailingSlashes(text) {
  let end = text.length;
  while (end > 0 && text[end - 1] === "/") end--;
  return text.slice(0, end);
}

export function buildUrl(baseUrl, path, params) {
  const base = trimTrailingSlashes(baseUrl);
  const url = `${base}/${String(path).replace(/^\/+/, "")}`;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) query.append(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${url}?${qs}` : url;
}

export function isRetryable(error) {
  if (!(error instanceof ApiError)) return false;
  if (error.kind === "network") return true;
  return error.kind === "http" && (error.status === 429 || error.status >= 500);
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 1回分の通信。失敗はApiError（中断はAbortErrorのまま）で投げる。
// request関数の複雑度を、参照側のsonarjs（cognitive-complexity、上限15）に収めるため分けている（#1470）
async function fetchOnce(fetchImpl, url, init) {
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch (cause) {
    if (cause?.name === "AbortError") throw cause;
    throw new ApiError("network", "通信に失敗しました", { cause });
  }
  if (!response.ok) throw new ApiError("http", `HTTP ${response.status}`, { status: response.status });
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch (cause) {
    throw new ApiError("parse", "応答がJSONではありません", { cause });
  }
}

async function request(fetchImpl, url, init, retry, sleep) {
  const { count = 0, baseDelayMs = 300, maxDelayMs = 3000 } = retry || {};
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(fetchImpl, url, init);
    } catch (error) {
      if (attempt >= count || !isRetryable(error)) throw error;
      await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** attempt));
    }
  }
}

export function createApiClient({ baseUrl, fetch: fetchImpl = globalThis.fetch, sleep = defaultSleep }) {
  if (!baseUrl) throw new Error("baseUrlは必須です");
  return {
    get(path, { params, signal, retry } = {}) {
      return request(fetchImpl, buildUrl(baseUrl, path, params), { method: "GET", signal }, retry, sleep);
    },
    post(path, { body, signal, retry } = {}) {
      const init = { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) };
      return request(fetchImpl, buildUrl(baseUrl, path), init, retry, sleep);
    },
  };
}

// ApiErrorの種別から、利用者へ見せる固定の文言を選ぶ。error.message（内部メッセージ）は表示しない。
// messagesで一部を上書きできる。キーは、"network"・"parse"・"http"・"http:<status>"・"default"。
const DEFAULT_MESSAGES = {
  network: "通信に失敗しました。接続を確認して、もう一度お試しください。",
  parse: "データを読み取れませんでした。時間をおいてお試しください。",
  http: "処理に失敗しました。時間をおいてお試しください。",
  "http:401": "ログインの有効期限が切れました。もう一度ログインしてください。",
  "http:403": "この操作は許可されていません。",
  "http:404": "対象が見つかりませんでした。",
  "http:429": "アクセスが集中しています。時間をおいてお試しください。",
  default: "エラーが発生しました。時間をおいてお試しください。",
};

export function messageForApiError(error, messages = {}) {
  const table = { ...DEFAULT_MESSAGES, ...messages };
  if (!(error instanceof ApiError)) return table.default;
  if (error.kind === "http") return table[`http:${error.status}`] ?? table.http;
  return table[error.kind] ?? table.default;
}
