# 認可の漏れを確かめるテストの型

複数の利用者・家族・テナントのデータを扱うAPIは、他人のデータを読めない・書けないことが核心である。
認証（誰か）は共通化されている。認可（何を見てよいか）の漏れを確かめる型は、共有されていなかった。
本書は、その型を共有する（[#1616](https://github.com/bamiyanapp/dev-standards/issues/1616)）。
自動検知は難しい。認可はプロダクト固有の仕様に依存するため、まず型とレビューの観点を共有する。

## 現状（2026-11時点の調査）

- examination: `infra/bot-stack/functions/`の各APIテストに、未認証の403のテストがある
- examination: 家族の境界（`familySlug`）は、認証の結果から決まり、リクエストからは受け取らない
- examination: 他の家族のデータを要求して拒否されること自体を確かめるテストは、見当たらない
- karuta: `quizRoomHandler.test.js`に、管理者トークンの不一致・権限の無い操作の403のテストがある

境界を、認証の結果から決める設計は、IDORを構造的に防ぐ。ただし、その設計が崩れても気づけるテストが無い。

## 設計の原則

- 境界の識別子（テナントID・家族ID）は、認証の結果から決める。リクエストの値を信用しない
- リクエストが識別子を運ぶ場合は、認証の結果と一致するかを必ず確かめる
- 拒否は、403か404で返す。404は、存在自体を隠したいときに選ぶ
- 拒否のとき、他人のデータの有無が分かる情報を返さない（エラー文言・件数・処理時間）

## テストの型

各APIについて、次の表を埋める。行がテストケースである。

| 識別子の受け口 | リクエスト | 期待 |
| --- | --- | --- |
| パス | 他テナントのIDを、パスに指定する | 403または404 |
| クエリ | 他テナントのIDを、クエリに指定する | 403または404、または無視される |
| ボディ | 他テナントのIDを、ボディに指定する | 403または404、または無視される |
| 認証の結果 | 他テナントに属する利用者で呼ぶ | 自分のデータだけが返る |
| 未認証 | 認証なしで呼ぶ | 403 |

「無視される」は、境界を認証の結果から決める設計のときである。
このとき、応答に他人のデータが含まれないことを確かめる。

## テストの雛形

認証の結果が、テナントAの利用者を返す状態で、テナントBのIDを指定して呼ぶ。

```js
it("他の家族のIDを指定しても、自分の家族のデータだけを返す", async () => {
  mockAuthAs({ email: "a@example.test", familySlug: "family-a" });
  const response = await handler(eventWith({ queryStringParameters: { familySlug: "family-b" } }));
  expect(response.statusCode).toBe(200);
  // 問い合わせの対象が、認証の結果（family-a）であることを確かめる
  expect(lastQueryKey()).toEqual("family-a");
  expect(JSON.stringify(response.body)).not.toContain("family-b");
});

it("他の家族のリソースを更新しようとすると、拒否される", async () => {
  mockAuthAs({ email: "a@example.test", familySlug: "family-a" });
  mockStoredItemOwnedBy("family-b");
  const response = await handler(eventWith({ method: "PUT", pathParameters: { id: "item-1" } }));
  expect([403, 404]).toContain(response.statusCode);
  expect(writeWasCalled()).toBe(false);
});
```

- `mockAuthAs`・`eventWith`等は、各プロダクトのテストの作法に合わせて用意する
- 書き込みのテストは、拒否のあと、書き込みが呼ばれていないことも確かめる
- テストデータのメールアドレスは、`example.test`等の予約ドメインにする

## レビューの観点

`code-review` Skillの観点に、認可の漏れを加えた。
新しいAPIや、データを取得・更新する処理を足したときに、次を確かめる。

- 境界の識別子は、認証の結果から決まっているか
- 他テナントのIDを指定したケースの、テストがあるか
- 一覧・検索・エクスポートでも、境界の条件が掛かっているか

## 関連

- [`serverless-api-hardening-checklist.md`](serverless-api-hardening-checklist.md): APIの堅牢化のチェックリスト
- [`anonymous-write-api-pattern.md`](anonymous-write-api-pattern.md): ログイン無しの書き込みAPIの対策
