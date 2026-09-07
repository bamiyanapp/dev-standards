"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOpsAlertMessage, sendOpsAlert } = require("./opsAlertNotifier.js");

test("builds a message including app name, alarm name, state and reason", () => {
  const message = buildOpsAlertMessage({
    appName: "youtube-radar",
    alarmName: "transcriptApi-no-invocations",
    newState: "ALARM",
    reason: "Threshold Crossed: 1 datapoint was less than the threshold",
  });

  assert.equal(
    message,
    [
      "【運用アラート】",
      "アプリ: youtube-radar",
      "アラーム: transcriptApi-no-invocations",
      "状態: ALARM",
      "詳細: Threshold Crossed: 1 datapoint was less than the threshold",
    ].join("\n"),
  );
});

test("omits the reason line when reason is not provided", () => {
  const message = buildOpsAlertMessage({
    appName: "youtube-radar",
    alarmName: "transcriptApi-no-invocations",
    newState: "ALARM",
  });

  assert.equal(message, ["【運用アラート】", "アプリ: youtube-radar", "アラーム: transcriptApi-no-invocations", "状態: ALARM"].join("\n"));
});

test("sendOpsAlert posts to the LINE push endpoint with the message", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200 };
  };

  await sendOpsAlert({ message: "テスト通知", channelAccessToken: "token", userId: "user1", fetchImpl });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.line.me/v2/bot/message/push");
  assert.equal(calls[0].init.headers.authorization, "Bearer token");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    to: "user1",
    messages: [{ type: "text", text: "テスト通知" }],
  });
});

test("sendOpsAlert throws when the LINE API responds with an error", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });

  await assert.rejects(
    () => sendOpsAlert({ message: "テスト通知", channelAccessToken: "token", userId: "user1", fetchImpl }),
    /HTTP 500/,
  );
});
