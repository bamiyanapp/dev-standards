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

function badRequest(origin, message) {
  return jsonResponse(origin, 400, { message });
}

function notFound(origin, message) {
  return jsonResponse(origin, 404, { message });
}

function serverError(origin, error, { includeMessage = false } = {}) {
  console.error(error);
  const body = includeMessage
    ? { message: "Internal Server Error", error: error.message }
    : { message: "Internal Server Error" };
  return jsonResponse(origin, 500, body);
}

module.exports = { jsonResponse, badRequest, notFound, serverError };
