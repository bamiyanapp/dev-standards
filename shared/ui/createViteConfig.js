// Vite + React + TypeScriptアプリの、vite.configの共通部分を返すヘルパー（dev-standards#1376・#1534）。
// 各アプリが手書きしていた、dev-standardsの共有物を使うために必須の設定をまとめる。
// 参照側は、baseなどの固有の値だけを渡す。
//
// viteやvitestをこのファイル内でimportしない。symlink経由で共有すると、importの解決が
// 実体（dev-standards配下）基準になり、参照側のnode_modulesを見つけられないため。
// 設定オブジェクトだけを返す。defineConfig・プラグイン・configDefaultsは、参照側が渡す
// （createVersionJsonPlugin.jsなど、shared/uiの他のヘルパーと同じ方針）。
//
// 使い方（vite.config.ts）:
//   import { defineConfig } from 'vite'
//   import { configDefaults } from 'vitest/config'
//   import react from '@vitejs/plugin-react'
//   import createViteConfig from '../../dev-standards/shared/ui/createViteConfig.js'
//
//   export default defineConfig(createViteConfig({
//     base: '/education/',
//     plugins: [react()],
//     vitestExclude: configDefaults.exclude,
//   }))
//
// 引数:
//   base: ビルド成果物の配置パス（必須）
//   plugins: Viteのプラグイン（既定: なし）
//   vitestExclude: vitestが既定で除外するパス（configDefaults.exclude）。ここへ`e2e/**`を足す
//   setupFiles: vitestのsetupFiles（既定: ./src/setupTests.ts）
//   coverageExclude: カバレッジから除外するパス（任意）。symlink共有のコンポーネントは、
//     preserveSymlinksによりsrc配下のパスとして集計されるため、必要なら参照側で指定する
//   overrides: 上書き・追加する設定。オブジェクトは再帰的に合成し、配列は置き換える

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeConfig(base, overrides) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = isPlainObject(value) && isPlainObject(base[key]) ? mergeConfig(base[key], value) : value;
  }
  return merged;
}

export default function createViteConfig({
  base,
  plugins = [],
  vitestExclude = [],
  setupFiles = "./src/setupTests.ts",
  coverageExclude,
  overrides = {},
}) {
  if (typeof base !== "string" || base === "") throw new Error("baseは必須です");
  const test = {
    environment: "jsdom",
    setupFiles,
    // e2e/配下はPlaywright（npm run test:e2e）専用のテストで、vitestの既定のincludeパターン
    // （**/*.spec.js等）に一致してしまうため明示的に除外する（examination#414、PR #428で実際に
    // vitestがe2e/top.spec.jsを拾い、「Playwright Test did not expect test() to be called here」で失敗した）
    exclude: [...vitestExclude, "e2e/**"],
  };
  if (coverageExclude) test.coverage = { exclude: coverageExclude };
  const config = {
    plugins,
    // dev-standards submoduleからsymlinkで共有しているコンポーネント（examination#159〜#163等）が
    // importするnpmパッケージ（qrcode.react等）を、symlinkの実体（dev-standards配下）ではなく、
    // このアプリ自身のnode_modulesから解決させるために必要。既定では、Vite・Node.jsはsymlinkの
    // 実体パス基準でnode_modulesを探索するため、dev-standards側にインストールされていない
    // パッケージの解決に失敗する
    resolve: { preserveSymlinks: true },
    base,
    build: {
      // E2Eカバレッジ収集（monocart-reporter）が、ビルド後のバンドルファイル単位ではなく、
      // 実際のsrc/*.tsxファイル単位まで遡って集計できるようにする
      // （docs/e2e-coverage-pattern.md、examination#450）
      sourcemap: true,
    },
    test,
  };
  return mergeConfig(config, overrides);
}
