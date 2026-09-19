# DynamoDBの安全なバックフィル・移行スクリプトパターン

稼働中のDynamoDBテーブルに対し、本番トラフィックを止めずにスキーマ移行・データ補完を行うための設計。karuta（[bamiyanapp/karuta](https://github.com/bamiyanapp/karuta)）の`backend/backfill-total-stats.js`で確立したパターン。DynamoDBの条件付き書き込みによる「無停止スキーマ移行時のレース回避」という一般的な運用テクニックで、対象テーブルの意味に依存しない。

## 問題: Scanから実際のUpdateまでの間に本番トラフィックが割り込む

既存アイテムを一括で走査（`Scan`）し、新しいフィールドを補完する移行スクリプトを書く場合、「読み取った内容から新しい値を計算し、`UpdateCommand`で書き込む」という2段階の処理になる。この間に本番トラフィックによる書き込みが先行していた場合、移行スクリプトが古い値ベースで計算した結果で無条件に上書きしてしまうと、その間にライブトラフィックが記録した更新が消えてしまう。

## 解決: `ConditionExpression`で「まだ移行されていないアイテムにだけ」書き込む

1. `ExclusiveStartKey`によるページネーションで、テーブル全体を`Scan`する
2. 既に移行済み（対象フィールドが存在する）アイテムはスキップする
3. 移行後の値を計算し、`UpdateCommand`に`ConditionExpression: "attribute_not_exists(<対象フィールド>)"`を付けて書き込む
4. `ConditionalCheckFailedException`（Scan後、実際のUpdateまでの間にライブトラフィックが先に対象フィールドを書き込んでいた場合）はエラーではなくスキップとして扱い、処理を継続する

```js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "ap-northeast-1" });
const docClient = DynamoDBDocumentClient.from(client);

async function backfillNewField(tableName) {
  let updatedCount = 0;
  let skippedCount = 0;
  let exclusiveStartKey;

  do {
    const scanResult = await docClient.send(
      new ScanCommand({ TableName: tableName, ExclusiveStartKey: exclusiveStartKey })
    );
    const items = scanResult.Items || [];

    for (const item of items) {
      if (typeof item.newField !== "undefined") {
        continue; // 既に移行済み
      }

      const newValue = deriveNewValue(item); // 移行元フィールドから新フィールドの値を導出する

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { /* 主キー */ },
            // Scan時点から実際の更新までの間にライブトラフィックが先に書き込んでいた場合、
            // このUpdateで上書きして記録を消してしまわないようにする
            ConditionExpression: "attribute_not_exists(newField)",
            UpdateExpression: "set newField = :v",
            ExpressionAttributeValues: { ":v": newValue },
          })
        );
        updatedCount++;
      } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
          skippedCount++;
          continue;
        }
        throw error;
      }
    }

    exclusiveStartKey = scanResult.LastEvaluatedKey;
  } while (exclusiveStartKey);

  console.log(`Backfilled ${updatedCount} item(s), skipped ${skippedCount} item(s) already updated by live traffic.`);
  return updatedCount;
}
```

## 設計上の要点

- **実行タイミングを明記する**: このパターンは「同時書き込みでライブトラフィックの記録を上書きしない」ことは保証するが、「移行前の履歴が新フィールドへ反映されないまま残る」ケース自体は防げない（`ConditionalCheckFailedException`でスキップしたアイテムは、移行元フィールドの旧い値のまま新フィールドには反映されない）。新しい書き込みロジック（新フィールドへの`ADD`等）をデプロイする**前**、もしくはトラフィックが無い時間帯に一度だけ実行するようスクリプトのコメント・実行手順に明記する
- **冪等にする**: 既に移行済み（対象フィールドが存在する）アイテムは`Scan`結果からその場でスキップする。同じスクリプトを何度実行しても安全（2回目以降は何もしない）になる
- **モジュールとして分離し、CLI実行もテストも両対応にする**: `module.exports`で関数をエクスポートしつつ、`require.main === module`のガードで直接実行（`node backfill-xxx.js`）にも対応する。テスト（`aws-sdk-client-mock`）では関数を直接importして呼び出し、実行結果（`updatedCount`）やモックへの呼び出し内容を検証できる
- **進捗をログ出力する**: 大規模テーブルでは`Scan`のページネーションに時間がかかるため、更新件数・スキップ件数を最後にログ出力しておくと、実行結果の妥当性（想定件数と一致するか）を確認しやすい
- 決定的ID・冪等な同期処理全般については`docs/deterministic-seed-id-pattern.md`も参照。あちらは「新規追加を何度実行しても重複させない」パターン、本ドキュメントは「既存アイテムの更新をライブトラフィックと安全に共存させる」パターンで、解決する問題が異なる

## 実例

karuta（`bamiyanapp/karuta`）の`backend/backfill-total-stats.js`が本パターンの完全な実装例（設計コメントを含む）。
