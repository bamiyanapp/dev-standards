"use strict";

// 外部API（LLM等）の呼び出しに、残り実行時間に基づくタイムアウトとリトライを付ける。
// HTTP送信そのものは持たない。https.requestを使うかfetchを使うか、レスポンスを
// どうデコードするかは、呼び出し側のsendが決める。本ヘルパーは「いつ打ち切るか」
// 「再試行するか」だけを担う。
//
// options:
//   send: (signal) => Promise<{ statusCode, body }>。signalはAbortSignal
//   getRemainingMs: () => number。Lambdaではcontext.getRemainingTimeInMillisを渡す
//   perAttemptMaxMs: 1回あたりの上限（既定: 10000）
//   safetyMarginMs: Lambda自体のタイムアウトまで残す余裕（既定: 2000）
//   minAttemptMs: これ未満しか残っていなければ送信しない（既定: 3000）
//   maxRetries: 再試行の回数（既定: 1）
//   sleep・random: テストで差し替える
//
// リトライ対象: statusCodeが429・500・502・503・504、およびsendが例外を投げた場合
// （接続エラー・時間切れ）。それ以外の4xxはリトライしない。
// 待ち時間は500〜1000msのランダム値。待ち時間を含めて残りが足りなければ再試行しない。
// 失敗時は、statusCode（最後に得たもの）・attempts・bodyを持つエラーを投げる。
// bodyはmessageに含めない（そのまま利用者へ返されるのを防ぐ）。
// 利用回数のカウント（dailyRateLimit.js）は呼び出し側が1回だけ行う（再試行で増やさない）。

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class DeadlineRequestError extends Error {
  constructor(message, { statusCode, attempts, body, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "DeadlineRequestError";
    this.statusCode = statusCode;
    this.attempts = attempts;
    this.body = body;
  }
}

// signalが中断されたら拒否するPromiseと競わせる（sendがsignalを無視しても時間切れにする）
function attempt(send, ms) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("時間切れ"));
    }, ms);
  });
  return Promise.race([send(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

async function requestWithDeadline({
  send,
  getRemainingMs,
  perAttemptMaxMs = 10000,
  safetyMarginMs = 2000,
  minAttemptMs = 3000,
  maxRetries = 1,
  sleep = defaultSleep,
  random = Math.random,
}) {
  let attempts = 0;
  let last = {};
  for (;;) {
    const budget = Math.min(perAttemptMaxMs, getRemainingMs() - safetyMarginMs);
    if (budget < minAttemptMs) {
      throw new DeadlineRequestError("残り時間が足りないため送信しませんでした", { ...last, attempts });
    }
    attempts++;
    let retryable;
    try {
      const response = await attempt(send, budget);
      if (!RETRYABLE_STATUS.has(response.statusCode)) return response;
      last = { statusCode: response.statusCode, body: response.body };
      retryable = true;
    } catch (cause) {
      last = { ...last, cause };
      retryable = true;
    }
    if (!retryable || attempts > maxRetries) {
      throw new DeadlineRequestError("外部APIの呼び出しに失敗しました", { ...last, attempts });
    }
    const wait = 500 + Math.floor(random() * 501);
    if (getRemainingMs() - wait - safetyMarginMs < minAttemptMs) {
      throw new DeadlineRequestError("外部APIの呼び出しに失敗しました（再試行の時間が足りません）", { ...last, attempts });
    }
    await sleep(wait);
  }
}

module.exports = { requestWithDeadline, DeadlineRequestError };
