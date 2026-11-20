// getSymlinkCoverageExcludes.jsの型定義。vite.config.tsは、tsc -bの型チェック対象のため必要
// （型定義が無いと、importがTS7016になる。dev-standards#1375）。
export interface GetSymlinkCoverageExcludesOptions {
  /** sync-manifest.local.jsonのパス */
  manifestPath: string;
  /** アプリのディレクトリ（リポジトリのルートからの相対）。省略時は、manifestのtarget全体 */
  appDir?: string;
  /** 除外する共有物のsourceの接頭辞（既定: shared/ui/・shared/pwa/・shared/sfx/） */
  sourcePrefixes?: string[];
}

export default function getSymlinkCoverageExcludes(options: GetSymlinkCoverageExcludesOptions): string[];
