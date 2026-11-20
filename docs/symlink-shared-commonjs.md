# symlink共有のCommonJSを、`--preserve-symlinks`環境で使うときの注意

`shared/lambda`のファイルは、CommonJS（`module.exports`）で書かれている。
参照側は、`sync-manifest.local.json`で、これをsymlinkして取り込む。
参照側が`"type": "module"`で、`NODE_OPTIONS=--preserve-symlinks`を使うと、名前付きimportができなくなる（[#1297](https://github.com/bamiyanapp/dev-standards/issues/1297)）。

## 起きること

- 参照側のESMから、symlinkした`.js`を、`import { a } from "./x.js"`で読む
- `--preserve-symlinks`があると、Node.jsは、symlinkの場所を基準にモジュール種別を決める
- 場所の近くの`package.json`が`"type": "module"`のため、CommonJSのexportを検出できない
- 結果は、`import { a }`が失敗する。`--preserve-symlinks`なしなら、読める

## 対処（標準）

名前付きimportを使う参照側は、その実行だけ、`NODE_OPTIONS`を空にする。

```js
// playwright.config.js の webServer（Camp-Stockの例）
webServer: { command: "npm run dev", env: { NODE_OPTIONS: "" } }
```

- `--preserve-symlinks`が必要なのは、ESMのsymlink先から`node_modules`を探すときである（[`e2e-coverage-pattern.md`](e2e-coverage-pattern.md)）
- 必要な処理にだけ付ける。サーバーのように、不要な処理では、空にする
- 影響を受けるのは、「`type: module`の参照側で、`--preserve-symlinks`を使い、共有のCommonJSを名前付きimportする」場合だけである

## 採らなかった案（2026-11-20に、実機で確認）

- **共有ファイルの実体を`.cjs`にする**: 全組み合わせで読める。ただし、全参照側の`sync-manifest.local.json`を直す破壊的変更になる。直すまで、`standards-check`が失敗する。他の参照側が同じ条件になったら、再検討する
- **互換用に、1行の`.js`（`module.exports = require("./x.cjs")`）を残す**: `--preserve-symlinks`で壊れる
  - `./x.cjs`が、symlinkの場所を基準に解決される
  - 参照側にその`.cjs`が無いため、失敗する
  - 今動いている参照側を壊すため、採れない
- **ESMと`.cjs`の両方を提供する**: 二重管理になる

上の事実は、`scripts/symlink-commonjs.test.js`で再現できる。Node.jsの挙動が変わると、テストが失敗して気づける。
