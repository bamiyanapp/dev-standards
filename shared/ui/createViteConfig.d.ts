// createViteConfig.jsの型定義。vite.config.tsは、tsc -bの型チェック対象のため、
// 型定義が無いと、importがTS7016（暗黙のany）になる（dev-standards#1534）。
// viteの型はimportしない（symlink共有で、参照側のnode_modulesを解決できないため）。
export interface CreateViteConfigOptions {
  /** ビルド成果物の配置パス（必須） */
  base: string;
  /** Viteのプラグイン */
  plugins?: unknown[];
  /** vitestが既定で除外するパス（configDefaults.exclude）。`e2e/**`が足される */
  vitestExclude?: readonly string[];
  /** vitestのsetupFiles（既定: ./src/setupTests.ts） */
  setupFiles?: string | string[];
  /** カバレッジから除外するパス */
  coverageExclude?: string[];
  /** 上書き・追加する設定。オブジェクトは再帰的に合成し、配列は置き換える */
  overrides?: Record<string, unknown>;
}

// defineConfigへそのまま渡せるよう、戻り値は緩い型にする
export default function createViteConfig(options: CreateViteConfigOptions): Record<string, any>;
