"use strict";

// Lambda@Edge（CloudFrontのviewer-request）向けの、HTTPまわりの純粋関数（dev-standards#1378）。
// examinationの`checkAuth.js`から、振る舞いを変えずに移した。外部依存は無い。
// Cookieの属性（Secure・HttpOnly・SameSite=Lax）は、認証の安全性に関わる。変えたくなったら別Issueにする。

function parseCookies(headers) {
  const cookies = {};
  const cookieHeaders = (headers.cookie || []).map((h) => h.value);
  for (const header of cookieHeaders) {
    for (const part of header.split(";")) {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (key) cookies[key] = value;
    }
  }
  return cookies;
}

function cookieString(name, value, maxAgeSeconds) {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function redirectResponse(location, setCookieValues) {
  const headers = {
    location: [{ key: "Location", value: location }],
  };
  if (setCookieValues && setCookieValues.length > 0) {
    headers["set-cookie"] = setCookieValues.map((value) => ({ key: "Set-Cookie", value }));
  }
  return {
    status: "302",
    statusDescription: "Found",
    headers,
  };
}

function jsonResponse(statusCode, statusDescription, body) {
  return {
    status: String(statusCode),
    statusDescription,
    headers: {
      "content-type": [{ key: "Content-Type", value: "application/json; charset=utf-8" }],
    },
    body: JSON.stringify(body),
  };
}

// ディレクトリ形式のURL（末尾が"/"、または拡張子が無い）を、index.htmlへ正規化する。
// CloudFrontのDefault Root Objectはサブパスに効かないため、ここで補う
function normalizeUri(uri) {
  if (uri.endsWith("/")) {
    return `${uri}index.html`;
  }
  if (!uri.includes(".")) {
    return `${uri}/index.html`;
  }
  return uri;
}

function parseJsonBody(request) {
  if (!request.body || !request.body.data) return null;
  const raw =
    request.body.encoding === "base64" ? Buffer.from(request.body.data, "base64").toString("utf-8") : request.body.data;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { parseCookies, cookieString, redirectResponse, jsonResponse, normalizeUri, parseJsonBody };
