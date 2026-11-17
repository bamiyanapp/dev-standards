"use strict";

// 調査用の一時workflow（ファイル名が`tmp-`で始まるもの）が、一定日数を超えて残っていないかを
// 確認する（issue #1403）。sandbox-unreachable-investigation Skillは、調査の完了後に一時workflowを
// 削除するPRを別途出すと定めているが、忘れても何も検知されない。
// 本番のログやデータを取得するworkflowが、workflow_dispatchでいつでも実行できる状態で残るのは危険である。
//
// - 接頭辞の有無だけで判定する。恒常的に使う手動実行workflowを、誤って警告しない
// - 警告にとどめ、終了コードは常に0（調査が長引くことは正当にある）
// - 追加された日は、gitの履歴（追加されたコミットの日付）から求める。履歴が浅い（shallow clone）と、
//   実際より新しく見えるため、警告が出ないだけで、誤って警告することはない
//
// 使い方: node check-tmp-workflows.js   （リポジトリのルートで実行。TMP_WORKFLOW_MAX_DAYSで日数を変更、既定14）

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PREFIX = "tmp-";
const DAY_MS = 24 * 60 * 60 * 1000;

// files: [{ file, addedAt（Date|null）, header（先頭の非空行）}]。戻り値: [{ file, ageDays, reason }]
function evaluate(files, now, maxDays) {
  const findings = [];
  for (const { file, addedAt, header } of files) {
    if (!/^\s*#/.test(header || "")) {
      findings.push({ file, reason: "冒頭に、目的・対応するissue・作成日を書いたコメントがありません" });
    }
    if (addedAt) {
      const ageDays = Math.floor((now - addedAt) / DAY_MS);
      if (ageDays > maxDays) findings.push({ file, ageDays, reason: `追加から${ageDays}日が過ぎています（${maxDays}日を超えると警告）。調査が完了していれば、削除するPRを出してください` });
    }
  }
  return findings;
}

function addedDate(file) {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--follow", "--format=%aI", "--", file], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    return out.length > 0 ? new Date(out[out.length - 1]) : null;
  } catch {
    return null;
  }
}

function main() {
  const dir = ".github/workflows";
  if (!fs.existsSync(dir)) return;
  const maxDays = Number(process.env.TMP_WORKFLOW_MAX_DAYS || "14");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && /\.ya?ml$/.test(f))
    .map((f) => {
      const file = path.posix.join(dir, f);
      const header = fs.readFileSync(file, "utf8").split("\n").find((l) => l.trim() !== "") || "";
      return { file, addedAt: addedDate(file), header };
    });
  if (files.length === 0) {
    console.log("一時workflow（tmp-*）は残っていません。");
    return;
  }
  const findings = evaluate(files, new Date(), maxDays);
  console.log(`一時workflow（tmp-*）: ${files.length}件`);
  for (const f of findings) console.log(`::warning file=${f.file}::${f.reason}`);
  if (findings.length === 0) console.log("期限内で、コメントも付いています。");
}

if (require.main === module) main();

module.exports = { evaluate };
