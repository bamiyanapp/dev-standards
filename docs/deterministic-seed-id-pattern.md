# 静的コンテンツをDynamoDB等へ冪等に同期する: 決定的IDとランダムIDの使い分け

Markdown等の静的コンテンツをデプロイのたびにDynamoDB等のデータストアへ同期する場合、実行するたびに重複行を作らず安全に「上書き」できるようにするための設計。examinationの`scripts/seed-interview-questions.js`（[examination#77](https://github.com/bamiyanapp/examination/issues/77)）で確立した。

## 問題: シードスクリプトを何度実行しても安全にしたい

デプロイのたびにMarkdown等のソースファイルから同じ内容をデータストアへ投入する処理を書くと、素朴に「ランダムID・現在時刻ベースのID」で行を追加してしまうと、実行するたびに重複行が増え続ける。事前にテーブルを全削除してから再投入する方式は、ユーザーが後からUI経由で追加した行（シード対象外のコンテンツ）まで消してしまう。

## 解決: コンテンツ自体から決定的なIDを導出する

行の内容（一意性を担保するのに十分なフィールドの組み合わせ）からハッシュ値を計算し、それをそのままIDとして使う。

```js
const crypto = require("crypto");

// familySlug・category・questionから決定的なquestionIdを生成する。
// これにより本スクリプトは何度実行しても同じ行を上書きするだけになり
// （新規重複を作らない）、Markdownを唯一の入力源とした再実行可能な
// 移行・同期処理にできる
function buildQuestionId(familySlug, category, question) {
  return crypto.createHash("sha256").update(`${familySlug}::${category}::${question}`).digest("hex").slice(0, 32);
}
```

同じ入力（`familySlug`・`category`・`question`の組み合わせ）からは常に同じIDが生成されるため、`PutItem`を何度実行しても同じ行を上書きするだけで、新規重複は発生しない。ソース側の内容が変わればID自体も変わる（＝別レコード扱いになる）ため、「更新」ではなく「置き換え」の意味論になる点に注意する（更新前のIDに紐づく他データ（コメント・参照等）がある設計では別途考慮が必要）。

## ランダムID・決定的IDの使い分け

同じテーブルに、シードスクリプト由来の行とユーザー操作由来の行が混在する場合、IDの体系を意図的に分ける。

| 由来 | ID生成方式 | 理由 |
|---|---|---|
| 静的コンテンツの同期（シードスクリプト） | 決定的（コンテンツのハッシュ） | 再実行しても重複を作らない |
| ユーザー操作による追加（フォーム送信・bot経由等） | ランダム（例: `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`） | 同じ内容でも複数回登録できる必要があり、決定的にする意味が無い |

決定的IDのパターン（例: SHA-256ハッシュなら16進数文字列の固定長）が分かっていれば、「この行はシード由来か、ユーザー操作由来か」をID自体の形式から機械的に判定できる。

```js
const DETERMINISTIC_ID_PATTERN = /^[0-9a-f]{32}$/;

// 旧シードスクリプト（決定的ID導入前、時刻+ランダム値のIDだった）が投入した
// 行を削除する。createdBy="seed"かつ決定的ID形式でない行のみを対象とする
// ため、ユーザー操作由来の行（createdByが実際のユーザーID）を誤って消さない
async function removeLegacySeedRows(ddb, tableName, familySlug) {
  const result = await ddb.send(new QueryCommand({ /* ... */ }));
  const legacyItems = (result.Items || []).filter(
    (item) => item.createdBy?.S === "seed" && !DETERMINISTIC_ID_PATTERN.test(item.questionId?.S || "")
  );
  for (const item of legacyItems) {
    await ddb.send(new DeleteItemCommand({ TableName: tableName, Key: { /* ... */ } }));
  }
}
```

このように、ID体系の移行（ランダムID→決定的ID等）を行った場合も、`createdBy`（由来の記録）と組み合わせることで、ユーザー操作由来の行を巻き込まずに旧形式の行だけを安全にクリーンアップできる。

## 設計上の要点

- ハッシュの入力に使うフィールドは「同じ内容とみなしてよい単位」を正しく表現するものを選ぶ。examinationでは`familySlug`（家族単位で分離）・`category`（面接種別）・`question`（質問文そのもの）の組み合わせとし、同じ質問文でも家族・種別が違えば別レコードとして扱う
- `createdBy`等の「由来」を示す属性を必ず持たせる。ID体系だけでなく由来も記録しておくと、後からのデータ移行・クリーンアップ・トラブルシュートで役立つ
- ハッシュの衝突は理論上あり得るが、SHA-256の128bit切り詰め程度でも実用上のリスクは無視できる規模（家族・チーム単位の小規模データ）であれば許容してよい

## 実例

examination `infra/bot-stack/scripts/seed-interview-questions.js`の`buildQuestionId`・`removeLegacySeedRows`（[examination#77](https://github.com/bamiyanapp/examination/issues/77)）。
