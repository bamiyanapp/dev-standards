"use strict";

const fs = require("fs");
const path = require("path");

// 他ドキュメントへの参照がバックティックのコード書式のままで、Markdownリンクに
// なっていないケースを検知する独自ルール（issue #786）。
// docs/ai-driven-app-curriculum.mdで同種の問題が2度発生した（issue #780・#784）。
//
// スコープを意図的に絞る。対象は以下の、参照先が一意に決まるケースのみとする。
//   1. "docs/<name>.md" 形式（リポジトリルートからの相対パスとして明確）
//   2. 同一ディレクトリ（docs/配下）内での裸の "<name>.md"（siblingファイル）
// CLAUDE.md・README.mdは意図的に対象外とする。dev-standards自身のドキュメント内で
// 「CLAUDE.md」と書かれる場合、実際には参照側（consumer）リポジトリ自身のCLAUDE.md
// を指すことが多く、機械的にdev-standards自身のCLAUDE.mdへリンクさせると意味的に
// 誤りになるため。
const EXCLUDED_BASENAMES = new Set(["CLAUDE.md", "README.md"]);

function resolveCandidate(filePath, text) {
  const baseDir = path.dirname(filePath);
  const candidates = [path.resolve(baseDir, text)];
  if (text.startsWith("docs/")) {
    // リポジトリルート基準（textlintの実行時カレントディレクトリ、通常は
    // リポジトリルート）での解釈も試す。README.md等、docs/配下以外から
    // "docs/xxx.md" と書かれるケースに対応する
    candidates.push(path.resolve(process.cwd(), text));
  }
  return candidates.find((candidate) => fs.existsSync(candidate));
}

module.exports = function (context) {
  const { Syntax, RuleError, report, getSource, getFilePath } = context;

  return {
    [Syntax.Document](node) {
      const filePath = getFilePath();
      if (!filePath) return;

      // Linkノードの子孫にあるCodeノードは既にリンク済みのため対象外にする
      const linkedCodeNodes = new Set();
      function markLinked(n) {
        if (!n) return;
        if (n.type === Syntax.Code) linkedCodeNodes.add(n);
        if (Array.isArray(n.children)) n.children.forEach(markLinked);
      }
      function collectLinks(n) {
        if (!n) return;
        if (n.type === Syntax.Link) markLinked(n);
        if (Array.isArray(n.children)) n.children.forEach(collectLinks);
      }
      collectLinks(node);

      function checkCode(n) {
        if (!n) return;
        if (n.type === Syntax.Code && !linkedCodeNodes.has(n)) {
          const text = getSource(n).replace(/^`|`$/g, "");
          const basename = path.basename(text);
          const looksLikeDocPath =
            /^[\w./-]+\.md$/.test(text) && !EXCLUDED_BASENAMES.has(basename);
          if (looksLikeDocPath) {
            const candidate = resolveCandidate(filePath, text);
            if (candidate) {
              report(
                n,
                new RuleError(
                  `"${text}" は実在するドキュメントを指していますが、Markdownリンクになっていません。` +
                    "[`" +
                    text +
                    "`](" +
                    text +
                    ") の形式でリンクにしてください。",
                ),
              );
            }
          }
        }
        if (Array.isArray(n.children)) n.children.forEach(checkCode);
      }
      checkCode(node);
    },
  };
};
