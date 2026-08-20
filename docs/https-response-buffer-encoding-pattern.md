# Node.jsのhttps.requestでレスポンスボディをBufferのまま集めてから一度だけデコードする

Node.js標準の`https`モジュール（`https.request`）を生で使って外部APIを呼び出す際、レスポンスボディの蓄積方法を誤ると、マルチバイト文字（日本語等）がチャンク境界で分割されたときに文字化け（U+FFFD置換文字）を起こす。axios・node-fetch等のHTTPクライアントライブラリは内部で正しく処理しているため表面化しないが、依存を増やしたくない小規模なLambda関数等で`https`モジュールを直接使う場合に踏みやすい罠。examinationの`geminiConversation.js`（`postJson`）・`checkAuth.js`（`postForm`）の両方で実際に本番データの文字化けを引き起こしていた（[examination#182](https://github.com/bamiyanapp/examination/issues/182)）。

## 問題のあるコード

```js
function postJson(hostname, path, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: "POST", headers }, (res) => {
      let data = "";
      // NG: chunkはBuffer。`data += chunk`は暗黙にchunk.toString()（UTF-8）を
      // チャンクごとに個別実行してしまう
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.end(JSON.stringify(bodyObj));
  });
}
```

`data += chunk`は`chunk`（Buffer）を暗黙に文字列へ変換するが、この変換はチャンクごとに独立して行われる。UTF-8のマルチバイト文字（日本語は多くが3バイト）がTCP/TLSのパケット分割によってちょうどチャンク境界をまたいだ場合、前半・後半それぞれのBufferが単独では不正なUTF-8シーケンスになり、`Buffer.toString("utf-8")`はデコードできないバイト列を1バイトずつU+FFFD（置換文字）に置き換えてしまう。レスポンスサイズが小さいテスト環境では再現しにくく、本番の実データでのみ低確率で発生するため気づきにくい。

## 正しい実装

```js
function postJson(hostname, path, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: "POST", headers }, (res) => {
      // チャンクをBufferのまま集め、レスポンス完了後に一度だけUTF-8デコードする
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const data = Buffer.concat(chunks).toString("utf-8");
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (error) {
          reject(new Error(`invalid JSON response: ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.end(JSON.stringify(bodyObj));
  });
}
```

`Buffer.concat(chunks)`で全チャンクを結合してから`toString("utf-8")`を1回だけ呼ぶことで、チャンク境界とマルチバイト文字境界が一致しない場合でも正しくデコードできる。

## 気づき方

- レスポンス本文に日本語等のマルチバイト文字を含むAPIで、ペイロードがある程度の大きさ（数百バイト〜）になると再現しやすい
- 発生箇所はランダムではなく、たまたまチャンク境界に当たった特定の文字位置に固定される（同じ入力なら毎回同じ箇所が化ける）
- 疑わしい場合は、実際にBufferを意図的に分割して`toString("utf-8")`する再現テストが有効（チャンク結合前と結合後の挙動差を確認できる）

## 適用範囲

`https.request`/`http.request`を生で使い、レスポンスボディを文字列として扱うすべてのコードが対象（リクエストボディ側は`Buffer.byteLength`で正しく長さを計算していれば問題にならない）。`fetch`（Node.js 18+の標準実装）・axios・node-fetch等を使う場合、内部で同様の処理を正しく行っているためこの罠には当たらない。
