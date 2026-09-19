"use strict";

// Markdownドキュメントが大きくなりすぎた場合に分割を促す独自ルール（issue #537）。
// コード側のESLint max-linesルール（issue #530）と同じ狙いだが、textlintに
// ファイル全体の行数を検知するルールが無いため独自に実装した。
// コードフェンス（```mermaid等の図・コードブロック）・テーブル行は、性質上まとまった
// 行数を要する一方、分割によって可読性が上がるものではないため、行数カウントから除外する。
module.exports = function (context, options = {}) {
  const { Syntax, RuleError, report, getSource } = context;
  const max = options.max || 200;

  return {
    [Syntax.Document](node) {
      const text = getSource(node);
      const totalLines = text.split("\n").length;

      // CodeBlock（コードフェンス）・Table（GFMテーブル）が占める行番号を除外集合へ登録する。
      // 子ノードへは再帰しない（コードフェンス・テーブル内部の行は丸ごと除外するため）。
      const excludedLines = new Set();
      function collectExcludedLines(n) {
        if (!n || !n.loc) return;
        if (n.type === Syntax.CodeBlock || n.type === Syntax.Table) {
          for (let line = n.loc.start.line; line <= n.loc.end.line; line++) {
            excludedLines.add(line);
          }
          return;
        }
        if (Array.isArray(n.children)) {
          n.children.forEach(collectExcludedLines);
        }
      }
      collectExcludedLines(node);

      const lines = text.split("\n");
      let effectiveLines = 0;
      for (let i = 0; i < totalLines; i++) {
        const lineNumber = i + 1;
        if (excludedLines.has(lineNumber)) continue;
        if (lines[i].trim() === "") continue;
        effectiveLines++;
      }

      if (effectiveLines > max) {
        report(
          node,
          new RuleError(
            `ファイルの実効行数（コードフェンス・テーブル・空行を除く）が${effectiveLines}行あり、上限の${max}行を超えています。ファイルの分割を検討してください。`,
          ),
        );
      }
    },
  };
};
