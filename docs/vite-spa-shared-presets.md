# Vite + React + TypeScriptアプリの共有プリセット

Vite + React + TypeScriptアプリの設定ファイルは、全アプリで内容が同一になりやすい。写し漏れを防ぐため、次の3つを共有プリセットとして配布する（[#1376](https://github.com/bamiyanapp/dev-standards/issues/1376)）。構成の全体像は[`client-only-vite-spa-pattern.md`](client-only-vite-spa-pattern.md)を参照する。

| 設定 | 共有物 | 使い方 |
|---|---|---|
| tsconfig | `shared/config/tsconfig.app.base.json`・`tsconfig.node.base.json` | `extends`で継承する |
| vite.config | `shared/ui/createViteConfig.js`（型定義`.d.ts`つき） | 関数を呼んで、設定を作る |
| oxlint | `shared/config/oxlintrc.base.json` | `extends`で継承する |

いずれも、symlinkではなく、dev-standardsのsubmoduleの位置を相対パスで指す。以降の例は、アプリが`app/<名前>/`にあり、`dev-standards`がリポジトリ直下にある場合である。

## tsconfig

アプリ本体用の`tsconfig.app.json`と、`vite.config.ts`用の`tsconfig.node.json`が、それぞれベースを継承する。

```json
// tsconfig.app.json
{
  "extends": "../../dev-standards/shared/config/tsconfig.app.base.json",
  "compilerOptions": { "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo" },
  "include": ["src"]
}
```

`tsconfig.node.json`も同じ形で、`tsconfig.node.base.json`を継承し、`include`を`["vite.config.ts"]`にする。`tsconfig.json`（`references`のみ）は、各アプリに残す。

- **symlinkにしない**: tsconfigをsymlinkにすると、相対パスの解決基準が実体の場所になり、壊れる
- **参照側に残すもの**: `include`・`files`・`exclude`・`tsBuildInfoFile`は、継承元の場所を基準に解決される。`references`は継承されない。いずれもアプリ側に書く
- **`allowJs`**: ベースに含まれる。symlink共有された`.jsx`のimport解決に必要である

## vite.config

`createViteConfig`は、共有物を使うために必須の設定を返す。

返す設定は、次のとおりである。

- `resolve.preserveSymlinks`
- `build.sourcemap`
- vitestの`environment`・`setupFiles`・`exclude`（`e2e/**`）

アプリ側は、`base`などの固有の値だけを渡す。

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import createViteConfig from '../../dev-standards/shared/ui/createViteConfig.js'

export default defineConfig(
  createViteConfig({
    base: '/education/',
    plugins: [react()],
    vitestExclude: configDefaults.exclude,
  }),
)
```

- **vite・vitestをヘルパー内でimportしない**: symlink共有では、参照側の`node_modules`を解決できない。そのため、`defineConfig`・プラグイン・`configDefaults`は、アプリ側で渡す
- **型定義が必要**: `vite.config.ts`は`tsc -b`の型検査の対象である。型定義の無い`.js`をimportすると、`TS7016`で`npm run build`が失敗する。`createViteConfig.d.ts`が、同じ場所に同梱されている
- **カバレッジの除外**: symlink共有のコンポーネントは、`preserveSymlinks`により、`src`配下のパスとして集計される。除外が必要なら、`coverageExclude`を渡す
- **上書き**: `overrides`で、設定を追加・上書きできる。オブジェクトは再帰的に合成し、配列は置き換える

## oxlint

```json
// .oxlintrc.json
{ "extends": ["../../dev-standards/shared/config/oxlintrc.base.json"] }
```

oxlintの`extends`は、相対パスの別ファイルを解決する（oxlint 1.94.0で確認）。ルールの上書き・追加は、アプリの`.oxlintrc.json`に書く。

- **labelと入力欄の関連付け**: `jsx-a11y/label-has-associated-control`を含む。`htmlFor`の指定と、入力欄を`<label>`で内包する書き方は、違反にならない。既存コードに違反が出るため、`warn`で始める。是正してから、`error`へ上げる
- **他のa11yの警告**: `jsx-a11y`プラグインを有効にすると、他の既定の規則も、警告として出る。lintは失敗しない

## setupTestsは共有しない

vitestの`setupFiles`は、symlinkで共有できない。実体のパスが、参照側のルートの外にあり、参照側の`node_modules`（`@testing-library/react`等）を解決できないためである。`toBeInTheDocument`などの型も、参照側から解決できる位置のimportでないと効かない。

各アプリの`src/setupTests.ts`に、次の内容を書く。

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
```

`createViteConfig`の既定の`setupFiles`は、`./src/setupTests.ts`である。
