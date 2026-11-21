"use strict";

// 再利用ワークフローの契約（docs/generated/reusable-workflow-contract.json）で、呼び出し側への
// 要求（permissions・必須入力・必須secret）が増えたPRに、破壊的変更の印があるかを検査する（issue #1545）。
// 要求が増えると、許可していない既存の参照側が、startup_failureになる（#1334）。
// 印があれば、semantic-releaseがメジャーバージョンを上げ、参照側のRenovateは、メジャー更新として
// 扱える（dependency-risk-summaryがHighと判定し、自動マージされない）。
//
// 印は、PRタイトルの`!`（例: `feat(ci)!: ...`）とする。mergeジョブはsquash mergeし、PRタイトルが
// mainの唯一のコミットの件名になるため、確実にsemantic-releaseの入力に届く。
// 本文の`BREAKING CHANGE:`フッターは、squash mergeのコミット本文に入るかが、リポジトリ設定に
// 依存するため、判定に使わない。
//
// 使い方（PRのCIで）: BASE_SHA=<baseのSHA> PR_TITLE=<PRタイトル> node check-contract-breaking.js
// 契約ファイルが無いリポジトリ（参照側）では、何もしない

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { findAddedRequirements, CONTRACT_PATH } = require("./reusable-contract.js");

// Conventional Commitsの破壊的変更の印: `type!:` または `type(scope)!:`
function hasBreakingMarker(title) {
  return /^[A-Za-z]+(\([^)]*\))?!:/.test(String(title).trim());
}

// added: findAddedRequirementsの結果。戻り値: { ok, message }
function evaluate({ added, prTitle }) {
  if (added.length === 0) return { ok: true, message: "呼び出し側への要求は、増えていません。" };
  if (hasBreakingMarker(prTitle)) {
    return { ok: true, message: `呼び出し側への要求が増えていますが、PRタイトルに破壊的変更の印（!）があります。\n${added.map((a) => `  - ${a}`).join("\n")}` };
  }
  return {
    ok: false,
    message: [
      "呼び出し側への要求（permissions・必須入力・必須secret）が増えました。許可していない既存の参照側は、startup_failureになります（dev-standards#1334）。",
      "破壊的変更として、PRタイトルに`!`を付けてください。例: `feat(ci)!: ...`。メジャーバージョンが上がり、参照側は、メジャー更新として扱えます。",
      "増えた要求:",
      ...added.map((a) => `  - ${a}`),
    ].join("\n"),
  };
}

function readBaseContract(baseSha, repoRoot) {
  try {
    return JSON.parse(execFileSync("git", ["show", `${baseSha}:${CONTRACT_PATH}`], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    // baseに契約ファイルが無い（初めて追加するPR）。比較元が無いため、増加とは見なさない
    return null;
  }
}

function main(env = process.env, repoRoot = process.cwd()) {
  const contractFile = path.join(repoRoot, CONTRACT_PATH);
  if (!fs.existsSync(contractFile)) {
    console.log("契約ファイルが無いリポジトリのため、検査しません。");
    return 0;
  }
  if (!env.BASE_SHA) {
    console.log("::warning::BASE_SHAが無いため、検査をスキップします。");
    return 0;
  }
  const base = readBaseContract(env.BASE_SHA, repoRoot);
  if (!base) {
    console.log("baseに契約ファイルが無いため、検査をスキップします。");
    return 0;
  }
  const head = JSON.parse(fs.readFileSync(contractFile, "utf8"));
  const result = evaluate({ added: findAddedRequirements(base, head), prTitle: env.PR_TITLE || "" });
  if (result.ok) {
    console.log(result.message);
    return 0;
  }
  console.error(`::error::${result.message.split("\n")[0]}`);
  console.error(result.message);
  return 1;
}

if (require.main === module) process.exit(main());

module.exports = { hasBreakingMarker, evaluate, main };
