"use strict";

// actionlintの結果から、既知の誤検知を取り除く（issue #1581）。
// npmパッケージ`actionlint`（WASM版、最新は2.0.6）は、GitHub Actionsの`vars`コンテキスト
// （リポジトリ変数・Organization変数。2023年に追加）が入る前のactionlintから作られている。
// そのため、`${{ vars.X }}`を、「undefined variable "vars"」と誤って指摘する。
// 新しいWASM版が出るまでの間、この指摘だけを取り除く。他の指摘は、そのまま残す。
// 新しい版へ上がって、誤検知が出なくなれば、このファイルは、不要になる（削除してよい）。

const VARS_FALSE_POSITIVE = /^undefined variable "vars"\./;

function isVarsFalsePositive(result) {
  return result.kind === "expression" && VARS_FALSE_POSITIVE.test(String(result.message));
}

function filterKnownFalsePositives(results) {
  return results.filter((result) => !isVarsFalsePositive(result));
}

module.exports = { filterKnownFalsePositives, isVarsFalsePositive };
