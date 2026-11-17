"use strict";

// リクエストボディの入力検証を行う小さな純粋関数群。外部パッケージには依存しない。
// いずれも失敗時は、statusCode: 400・code: "VALIDATION"を持つ例外を投げる。
// 例外のクラスは参照側ごとに異なってよい。参照側のルーターは、statusCodeだけを見て
// そのまま400へ変換できる。
// エラー文言には、入力値そのものを含めない（ログ・応答への個人情報の混入を避ける）。
// 上限値の目安: 名前100文字、メモ1000文字。

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
    this.code = "VALIDATION";
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(body) {
  if (!isPlainObject(body)) throw new ValidationError("リクエストボディはオブジェクトで指定してください");
  return body;
}

// 文字列・前後の空白を除いて空でない・max文字以下。前後の空白を除いた値を返す
function requireString(value, field, { max } = {}) {
  if (typeof value !== "string") throw new ValidationError(`${field}は文字列で指定してください`);
  const trimmed = value.trim();
  if (trimmed === "") throw new ValidationError(`${field}は必須です`);
  if (max !== undefined && trimmed.length > max) throw new ValidationError(`${field}は${max}文字以内で指定してください`);
  return trimmed;
}

// undefined・null・空文字（空白のみを含む）はnullを返す。それ以外はrequireStringと同じ
function optionalString(value, field, { max } = {}) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return requireString(value, field, { max });
}

function requireBoolean(value, field) {
  if (typeof value !== "boolean") throw new ValidationError(`${field}は真偽値で指定してください`);
  return value;
}

function isRealDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// YYYY-MM-DD形式で、実在する日付。undefined・null・空文字はnullを返す
function optionalDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const valid =
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    isRealDate(value);
  if (!valid) throw new ValidationError(`${field}はYYYY-MM-DD形式の日付で指定してください`);
  return value;
}

// 指定した項目のうち、ちょうど1つ（値がundefinedでないもの）が存在すること。存在した項目名を返す
function requireExactlyOneOf(body, fields) {
  const present = fields.filter((f) => body[f] !== undefined);
  if (present.length !== 1) throw new ValidationError(`${fields.join("・")}のうち、ちょうど1つを指定してください`);
  return present[0];
}

module.exports = { ValidationError, requireObject, requireString, optionalString, requireBoolean, optionalDate, requireExactlyOneOf };
