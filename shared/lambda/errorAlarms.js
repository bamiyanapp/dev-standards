"use strict";

// Lambda関数ごとのErrorsアラーム（CloudWatch Alarm）のリソースを、関数名の一覧から組み立てる。
// 関数ごとにほぼ同じAWS::CloudWatch::Alarmを手書きすると、重複が増え、関数を追加するときに
// アラームの追加を忘れる。serverless.ymlの`functions`のキー一覧から生成すれば、関数を足したときに、
// アラームも自動で増える（issue #1367）。追加の依存は無い。Serverless Frameworkのプラグインは使わない。
//
// 使い方（serverless.yml）:
//   resources: ${file(./alarms.js)}
// alarms.js:
//   const { buildErrorAlarms } = require("./errorAlarms.js"); // symlink先
//   module.exports = (serverless) =>
//     buildErrorAlarms({ functionNames: Object.keys(serverless.service.functions), alarmActionTopic: "OpsAlertTopic" });
//
// 注意: Errorsメトリクスは、ハンドラが例外を外へ投げたときにしか増えない。例外を捕捉して500や502を
// 返す実装では増えないため、API Gatewayの5XXErrorのアラームと併用する（docs/ops-monitoring-pattern.md）。
//
// options:
//   functionNames: serverless.ymlのfunctionsのキー
//   alarmActionTopic: 通知先のSNSトピックの論理ID（同じテンプレート内のもの）
//   period / evaluationPeriods / threshold: 既定は、5分間に1回でもエラーがあれば
//   exclude: アラームを作らない関数名（opsAlert自身など）

// Serverless Frameworkが関数に付ける論理IDの規則: 先頭を大文字にし、-をDash、_をUnderscoreへ置き換え、
// 末尾にLambdaFunctionを付ける（osls packageの出力で確認済み）
function functionLogicalId(name) {
  const normalized = name.replace(/-/g, "Dash").replace(/_/g, "Underscore");
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}LambdaFunction`;
}

function buildErrorAlarms({ functionNames, alarmActionTopic, period = 300, evaluationPeriods = 1, threshold = 1, exclude = [] }) {
  if (!Array.isArray(functionNames) || functionNames.length === 0) throw new Error("functionNamesは、関数名の配列で指定してください。");
  if (!alarmActionTopic) throw new Error("alarmActionTopic（通知先のSNSトピックの論理ID）は必須です。");
  const Resources = {};
  for (const name of functionNames.filter((n) => !exclude.includes(n))) {
    const fn = functionLogicalId(name);
    Resources[`${fn.replace(/LambdaFunction$/, "")}ErrorsAlarm`] = {
      Type: "AWS::CloudWatch::Alarm",
      Properties: {
        AlarmName: { "Fn::Sub": `\${AWS::StackName}-${name}-errors` },
        Namespace: "AWS/Lambda",
        MetricName: "Errors",
        Dimensions: [{ Name: "FunctionName", Value: { Ref: fn } }],
        Statistic: "Sum",
        Period: period,
        EvaluationPeriods: evaluationPeriods,
        Threshold: threshold,
        ComparisonOperator: "GreaterThanOrEqualToThreshold",
        // 呼び出しが無い間はエラーも無い。「呼び出しが無いこと」の検知（Invocations + breaching）とは使い分ける
        TreatMissingData: "notBreaching",
        AlarmActions: [{ Ref: alarmActionTopic }],
      },
    };
  }
  return { Resources };
}

module.exports = { buildErrorAlarms, functionLogicalId };
