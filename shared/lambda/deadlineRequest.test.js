"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { requestWithDeadline, DeadlineRequestError } = require("./deadlineRequest.js");

const base = { getRemainingMs: () => 60000, sleep: async () => {}, random: () => 0 };

test("成功したらそのまま返す", async () => {
  const res = await requestWithDeadline({ ...base, send: async () => ({ statusCode: 200, body: "ok" }) });
  assert.deepEqual(res, { statusCode: 200, body: "ok" });
});

test("5xx・429は再試行し、2回目の成功を返す", async () => {
  for (const code of [429, 500, 502, 503, 504]) {
    let n = 0;
    const res = await requestWithDeadline({ ...base, send: async () => (++n === 1 ? { statusCode: code } : { statusCode: 200 }) });
    assert.equal(res.statusCode, 200);
    assert.equal(n, 2);
  }
});

test("その他の4xxは再試行せず、そのまま返す", async () => {
  let n = 0;
  const res = await requestWithDeadline({ ...base, send: async () => (n++, { statusCode: 400, body: "bad" }) });
  assert.equal(res.statusCode, 400);
  assert.equal(n, 1);
});

test("再試行の上限を超えたら、statusCodeと試行回数を持つエラーを投げ、messageに本文を含めない", async () => {
  await assert.rejects(
    requestWithDeadline({ ...base, send: async () => ({ statusCode: 503, body: "secret-body" }) }),
    (e) => e instanceof DeadlineRequestError && e.statusCode === 503 && e.attempts === 2 && e.body === "secret-body" && !e.message.includes("secret"),
  );
});

test("sendの例外も再試行する", async () => {
  let n = 0;
  const res = await requestWithDeadline({
    ...base,
    send: async () => {
      if (++n === 1) throw new Error("ECONNRESET");
      return { statusCode: 200 };
    },
  });
  assert.equal(res.statusCode, 200);
});

test("signalを無視するsendでも時間切れで失敗し、signalが中断される", async () => {
  let signal;
  await assert.rejects(
    requestWithDeadline({
      ...base,
      getRemainingMs: () => 5000,
      safetyMarginMs: 1950,
      minAttemptMs: 1,
      maxRetries: 0,
      send: (s) => ((signal = s), new Promise(() => {})),
    }),
    (e) => e.attempts === 1,
  );
  assert.equal(signal.aborted, true);
});

test("残り時間が足りなければ送信しない", async () => {
  let n = 0;
  await assert.rejects(
    requestWithDeadline({ ...base, getRemainingMs: () => 4000, send: async () => (n++, { statusCode: 200 }) }),
    (e) => e.attempts === 0,
  );
  assert.equal(n, 0);
});

test("待ち時間を含めると足りない場合は再試行しない", async () => {
  let remaining = 10000;
  let n = 0;
  await assert.rejects(
    requestWithDeadline({
      ...base,
      getRemainingMs: () => remaining,
      send: async () => {
        n++;
        remaining = 5400;
        return { statusCode: 500 };
      },
    }),
    (e) => e.attempts === 1,
  );
  assert.equal(n, 1);
});

test("待ち時間は500〜1000ms", async () => {
  const waits = [];
  await requestWithDeadline({
    ...base,
    random: () => 0.999,
    sleep: async (ms) => void waits.push(ms),
    send: (() => {
      let n = 0;
      return async () => (++n === 1 ? { statusCode: 500 } : { statusCode: 200 });
    })(),
  });
  assert.ok(waits[0] >= 500 && waits[0] <= 1000);
});
