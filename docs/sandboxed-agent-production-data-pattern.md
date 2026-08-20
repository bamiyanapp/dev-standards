# 実認証情報の無いエージェントサンドボックスから、本番データを安全に調査・修正する

Claude Code等のAIエージェントが動くサンドボックス環境には、意図的に実AWS認証情報等を持たせないことが多い（環境変数がプロキシ注入のプレースホルダーになっており、実際のAPI呼び出しは`UnrecognizedClientException`等で失敗する）。一方、GitHub Actionsのランナーはリポジトリのsecrets経由で実認証情報を持つ。この差を前提に、「調査・修正のロジックはコード化してリポジトリにコミットし、実行自体はGitHub Actions側に委ねる」運用パターンを確立する。examination（[examination#182](https://github.com/bamiyanapp/examination/issues/182)、本番DynamoDBデータの文字化け調査・修正）で確立した。

スマートフォンのみで運用する（ローカル端末でのCLI操作ができない）開発環境とも相性がよい。`workflow_dispatch`はGitHubのWeb/モバイルアプリから実行でき、結果はJob Summaryでその場から確認できる。

## 調査用ワークフロー（読み取り専用）

```yaml
name: Find mojibake in DynamoDB text data

on:
  workflow_dispatch:

jobs:
  find:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: "24"
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v6
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - name: Install dependencies
        working-directory: infra/bot-stack
        run: npm ci
      - name: Find mojibake
        working-directory: infra/bot-stack
        run: |
          {
            echo "### 文字化け（U+FFFD）調査結果"
            echo '```'
            node scripts/find-mojibake.js
            echo '```'
          } | tee -a "$GITHUB_STEP_SUMMARY"
```

`node scripts/find-mojibake.js`はテーブルを`Scan`し、全文字列フィールドにU+FFFD（置換文字）が含まれる行のテーブル名・キー・フィールド名・該当箇所を出力するだけの読み取り専用スクリプト。書き込みは一切行わない。

## 修正用ワークフロー（dry-run/apply切り替え）

修正スクリプトは`APPLY`環境変数（既定`false`）で実際の書き込みをゲートする。`apply: false`（既定）では修正前後の内容を表示するのみで、内容を目視確認してから`apply: true`を指定して再実行する2段階の運用にする。

```yaml
name: Fix mojibake (one-off)

on:
  workflow_dispatch:
    inputs:
      apply:
        description: "実際にDynamoDBへ書き込むかどうか（falseの場合は内容確認のみ）"
        type: boolean
        required: false
        default: false

jobs:
  fix:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      # ...（checkout・setup-node・configure-aws-credentials・npm ciは調査用と同様）
      - name: Fix mojibake
        working-directory: infra/bot-stack
        env:
          APPLY: ${{ inputs.apply }}
        run: |
          {
            echo "### 修正結果（apply=${{ inputs.apply }}）"
            echo '```'
            node scripts/fix-mojibake.js
            echo '```'
          } | tee -a "$GITHUB_STEP_SUMMARY"
```

```js
// scripts/fix-mojibake.js
const APPLY = process.env.APPLY === "true";

async function main() {
  const before = await getItem(/* ... */);
  const after = repair(before);

  console.log("--- 修正前 ---");
  console.log(before.summary);
  console.log("--- 修正後 ---");
  console.log(after.summary);

  if (!APPLY) {
    console.log("(dry-run: 実際の書き込みは行っていません。apply: true で再実行してください)");
    return;
  }
  await putItem(after);
  console.log("書き込みました。");
}
```

- 1回きりの対応であっても、対話的に`aws dynamodb`コマンドを叩いて終わらせるのではなく、必ずスクリプトとしてコミットする。修正の再現性（同じ手順を後日別レコードに適用する場合等）とレビュー可能性（何をどう変更するかがdiffとして残る）を両立できる
- dry-run結果は必ず修正前後の**両方**をJob Summaryへ出力する。修正後の値だけを表示すると、想定と違う変換をしていた場合に気づけない
- 対象を確実に絞り込める条件（テーブル名・パーティションキー・特定フィールド名等）が分かっている一回限りの修正では、全件走査ではなく対象を直接指定する方が安全（意図しない行への誤爆を避ける）

## 設計上の要点

- **実認証情報をサンドボックスに持たせない設計を前提とする**。エージェントに実認証情報を渡して直接操作させる方が高速に見えるが、誤操作時の影響範囲・監査ログの残しやすさの両面でこのパターンの方が安全。GitHub Actionsの実行ログ・Job Summary自体が操作の記録として残る
- 調査（読み取り専用）と修正（書き込みを伴う）は別ワークフローに分け、修正側にのみ`apply`ゲートを設ける。調査用ワークフローに誤って書き込みロジックを混在させない
- 一回限りの修正スクリプトは、対応完了後も履歴として残してよい（同種の問題が再発した際の参考実装になる）。ワークフロー名に対象Issue番号を含めておくと、後から経緯を追いやすい

## 実例

examination `.github/workflows/find-mojibake.yml`・`fix-mock-interview-summary-mojibake.yml`、`infra/bot-stack/scripts/find-mojibake.js`・`fix-mojibake.js`（[examination#182](https://github.com/bamiyanapp/examination/issues/182)）。
