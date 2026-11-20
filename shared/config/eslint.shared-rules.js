// ESLintの共有ルール（flat config用、dev-standards#1537）。
// プラグインに依存しない、ESLint本体のルールだけを含む。参照側にプラグインの追加は要らない。
//
// 使い方（参照側のeslint.config.js）:
//   import { createSharedRules } from './eslint.shared-rules.js'; // symlink
//   export default defineConfig([ ..., createSharedRules(), ... ]);
//
// 既定の重要度はwarnである。既存コードに違反がある参照側が、段階的にerrorへ上げられる。
// 上限は、引数で上書きできる。fetchを直接呼んでよいファイル（api層・dev-standards由来のsymlink等）は、
// 参照側のflat configで、別の設定オブジェクトにignoresを付けて、この規則を'off'にする。理由はコメントで残す。
export function createSharedRules({
  level = 'warn',
  maxLines = 400,
  maxLinesPerFunction = 80,
  complexity = 15,
} = {}) {
  return {
    name: 'dev-standards/shared-rules',
    rules: {
      // alert()は、閉じるまでJavaScriptの実行を止める。通知は、画面内の表示かトーストにする
      'no-alert': level,
      // APIの呼び出しは、api層の関数に集約する。画面・hookからのfetch直接呼び出しを防ぐ
      'no-restricted-globals': [
        level,
        { name: 'fetch', message: 'APIは、api層の関数経由で呼び出してください（dev-standards#1537）' },
      ],
      // 肥大化の検知。空行・コメントは数えない
      'max-lines': [level, { max: maxLines, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [level, { max: maxLinesPerFunction, skipBlankLines: true, skipComments: true }],
      complexity: [level, complexity],
    },
  };
}
