// API Gateway REST（HTTP）ハンドラ向けの共通CORSレスポンス生成ヘルパー。
// WebSocketハンドラ（$connect/$disconnect/カスタムルート）はプレーンテキストの
// body・CORSヘッダー無しで別形状のため対象外（`shared/lambda/webSocketBroadcast.js`参照）。
//
// 500応答のbodyにerror.messageを含めるかは呼び出し側の判断に委ねる
// （serverErrorのincludeMessageオプション）。

function jsonResponse(origin, statusCode, body, { credentials = false } = {}) {
  const headers = { "Access-Control-Allow-Origin": origin };
  if (credentials) {
    headers["Access-Control-Allow-Credentials"] = true;
  }
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

// CORSヘッダーを付けないJSONレスポンス（dev-standards#1379）。API Gateway（HTTP API）側で
// CORSを処理する構成や、サーバー間の内部APIでは、Lambda側でAccess-Control-*を付ける必要が
// 無いため、jsonResponse（originが第1引数）とは別名で提供する。jsonResponseのシグネチャは
// 既存の参照側（karuta等）が使っているため変えない
function plainJsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function badRequest(origin, message) {
  return jsonResponse(origin, 400, { message });
}

function notFound(origin, message) {
  return jsonResponse(origin, 404, { message });
}

// レート制限に達したときの429応答（dev-standards#1406）。再試行を促す文言は呼び出し側が決める
function tooManyRequests(origin, message) {
  return jsonResponse(origin, 429, { message });
}

function serverError(origin, error, { includeMessage = false } = {}) {
  console.error(error);
  const body = includeMessage
    ? { message: "Internal Server Error", error: error.message }
    : { message: "Internal Server Error" };
  return jsonResponse(origin, 500, body);
}

module.exports = { jsonResponse, plainJsonResponse, badRequest, notFound, tooManyRequests, serverError };
