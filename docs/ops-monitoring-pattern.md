# 運用監視（サイレント障害検知）パターン（`shared/lambda/opsAlertNotifier.js`）

バックエンド以外の実行環境（自宅Raspberry Pi等）が完全に停止・クラッシュした場合、AWS側には一切ログもリクエストも残らないため、通常のエラーログ監視では気づけない（youtube-radar issue #122由来）。CloudWatch Alarmで「想定間隔以上、期待するリクエスト/イベントが発生していない」こと自体を異常として検知し、SNS経由でLambdaを起動、運用監視専用のLINE Bot（各プロダクトのユーザー向け通知Botとは別に、全プロダクト共通で1つ新規開設したもの）へ通知する。

**このファイル自体はnpmパッケージを`require`しない**（symlink経由で共有する場合の制約は`docs/daily-rate-limit-pattern.md`参照）。SNSイベントのパース等、実際のLambdaハンドラの実装は呼び出し側に委ねる。

## 使い方

呼び出し側（プロダクトのbackend）でLambdaハンドラを実装する。

```js
// backend/src/opsAlertLambda.js（ESMプロジェクトの例）
import { buildOpsAlertMessage, sendOpsAlert } from "./opsAlertNotifier.js"; // symlink先

export async function handler(event) {
  for (const record of event.Records ?? []) {
    const alarm = JSON.parse(record.Sns.Message);
    const message = buildOpsAlertMessage({
      appName: "youtube-radar",
      alarmName: alarm.AlarmName,
      newState: alarm.NewStateValue,
      reason: alarm.NewStateReason,
    });
    await sendOpsAlert({
      message,
      channelAccessToken: process.env.OPS_ALERT_LINE_CHANNEL_ACCESS_TOKEN,
      userId: process.env.OPS_ALERT_LINE_USER_ID,
    });
  }
}
```

## serverless.ymlでの組み込み例

「想定間隔以上、期待するLambda（例: 定期的にポーリングを行うクライアントから呼ばれるAPI）の呼び出しが無い」ことを検知する例。`TreatMissingData: breaching`（メトリクス自体が存在しない＝呼び出しが無い状態を、閾値割れと同様に異常とみなす）が要点。

```yaml
resources:
  Resources:
    OpsAlertTopic:
      Type: AWS::SNS::Topic
      Properties:
        TopicName: ${self:service}-${sls:stage}-ops-alert

    TranscriptApiNoInvocationsAlarm:
      Type: AWS::CloudWatch::Alarm
      Properties:
        AlarmName: ${self:service}-${sls:stage}-transcriptApi-no-invocations
        Namespace: AWS/Lambda
        MetricName: Invocations
        Dimensions:
          - Name: FunctionName
            Value: ${self:service}-${sls:stage}-transcriptApi
        Statistic: Sum
        # 想定実行間隔（例: cronで10分ごと）に対して十分な余裕を持たせる。
        # 短すぎると正常な間隔のばらつきで誤検知する
        Period: 3600
        EvaluationPeriods: 1
        Threshold: 1
        ComparisonOperator: LessThanThreshold
        TreatMissingData: breaching
        AlarmActions:
          - !Ref OpsAlertTopic

functions:
  opsAlert:
    handler: src/opsAlertLambda.handler
    environment:
      OPS_ALERT_LINE_CHANNEL_ACCESS_TOKEN: ${env:OPS_ALERT_LINE_CHANNEL_ACCESS_TOKEN}
      OPS_ALERT_LINE_USER_ID: ${env:OPS_ALERT_LINE_USER_ID}
    events:
      - sns:
          arn: !Ref OpsAlertTopic
```

## 運用監視専用LINE Botについて

各プロダクトが持つユーザー向け通知用のLINE公式アカウントとは別に、**運用監視専用のLINE公式アカウントを全プロダクト共通で1つ新規開設**する。LINE Developersコンソール（スマートフォンのブラウザから操作可能）から作成し、チャンネルアクセストークンと通知先のユーザーIDを取得する。

GitHub Secrets自体はリポジトリ単位でしか登録できないため、共通化されるのはLINE公式アカウント（と、そこへ送るためのメッセージ組み立て・送信ロジック）のみである。各プロダクトは自身のリポジトリのGitHub Secretsへ、同じ値を`OPS_ALERT_LINE_CHANNEL_ACCESS_TOKEN`・`OPS_ALERT_LINE_USER_ID`として個別に登録する。

メッセージに`appName`を含めているのは、1つのLINE Botに複数プロダクトからの通知が届くため、どのアプリの異常かをひと目で区別できるようにするため。

## 設計上の要点

- `buildOpsAlertMessage`はCloudWatch AlarmのSNSメッセージ（`AlarmName`・`NewStateValue`・`NewStateReason`）から通知文を組み立てる純粋関数、`sendOpsAlert`はLINE Messaging APIへの送信のみを行う。SNSイベント自体のパース（`event.Records`のループ等）はプロダクトごとのLambdaハンドラに委ねる
- 「異常発生（ALARM）」だけでなく「復旧（OK）」でも同じLambdaが呼ばれるため、`newState`をメッセージに含めることで復旧報告も兼ねる
- CloudWatch Alarmの`Period`・`EvaluationPeriods`は、監視対象の正常な実行間隔のばらつきを考慮し、短すぎて誤検知しない値にする（cronの実行間隔そのものではなく、十分な余裕を持たせた値にする）
