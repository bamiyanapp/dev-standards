"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildErrorAlarms, functionLogicalId } = require("./errorAlarms.js");

test("論理IDは、先頭を大文字にし、-をDash・_をUnderscoreにして、LambdaFunctionを付ける", () => {
  assert.equal(functionLogicalId("voiceChat"), "VoiceChatLambdaFunction");
  assert.equal(functionLogicalId("ops-alert"), "OpsDashalertLambdaFunction");
  assert.equal(functionLogicalId("get_user"), "GetUnderscoreuserLambdaFunction");
});

test("関数ごとにErrorsアラームを作り、関数が増えればアラームも増える", () => {
  const two = buildErrorAlarms({ functionNames: ["a", "b"], alarmActionTopic: "OpsAlertTopic" });
  assert.deepEqual(Object.keys(two.Resources), ["AErrorsAlarm", "BErrorsAlarm"]);
  const three = buildErrorAlarms({ functionNames: ["a", "b", "c"], alarmActionTopic: "OpsAlertTopic" });
  assert.deepEqual(Object.keys(three.Resources), ["AErrorsAlarm", "BErrorsAlarm", "CErrorsAlarm"]);
});

test("アラームの定義: Errors・Sum・notBreaching・関数の参照・通知先", () => {
  const { Resources } = buildErrorAlarms({ functionNames: ["voiceChat"], alarmActionTopic: "OpsAlertTopic" });
  const p = Resources.VoiceChatErrorsAlarm.Properties;
  assert.equal(Resources.VoiceChatErrorsAlarm.Type, "AWS::CloudWatch::Alarm");
  assert.equal(p.MetricName, "Errors");
  assert.equal(p.Namespace, "AWS/Lambda");
  assert.equal(p.TreatMissingData, "notBreaching");
  assert.deepEqual(p.Dimensions, [{ Name: "FunctionName", Value: { Ref: "VoiceChatLambdaFunction" } }]);
  assert.deepEqual(p.AlarmActions, [{ Ref: "OpsAlertTopic" }]);
  assert.deepEqual(p.AlarmName, { "Fn::Sub": "${AWS::StackName}-voiceChat-errors" });
});

test("excludeの関数は作らない。しきい値・期間は上書きできる", () => {
  const { Resources } = buildErrorAlarms({ functionNames: ["a", "opsAlert"], alarmActionTopic: "T", exclude: ["opsAlert"], period: 60, threshold: 3 });
  assert.deepEqual(Object.keys(Resources), ["AErrorsAlarm"]);
  assert.equal(Resources.AErrorsAlarm.Properties.Period, 60);
  assert.equal(Resources.AErrorsAlarm.Properties.Threshold, 3);
});

test("関数名が空・通知先が無ければ、例外を投げる", () => {
  assert.throws(() => buildErrorAlarms({ functionNames: [], alarmActionTopic: "T" }), /functionNames/);
  assert.throws(() => buildErrorAlarms({ functionNames: ["a"] }), /alarmActionTopic/);
});
