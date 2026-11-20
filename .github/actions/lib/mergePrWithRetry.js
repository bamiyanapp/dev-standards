"use strict";

// dev-standards#1242: merge-pr/action.yml・commit-via-pr/action.ymlが、
// squash mergeのリトライ（最大5回・3秒刻みバックオフ）とブランチ削除
// （422・"Reference does not exist"は無視）というほぼ同一のロジックを
// 個別に実装していたため共通化する。

// pull_number: squash mergeするPR番号
// expectedHeadSha: このマージを承認したCI実行がテストしたコミットのSHA（任意）。
//   指定した場合、GitHubの`pulls.merge()`へ`sha`として渡す。マージ実行までの間に
//   別のpushでPRのHEADが変わっていた場合（issue #1256）、GitHubは409を返す。
//   この場合はテストされていないコミットをマージしてしまうことを防ぐため、
//   リトライせず即座にスキップする（戻り値はnull）。新しいHEADに対しては
//   別のCI実行が改めて判定するため、ここでエラーにする必要はない
// onRequiredChecksPending: 必須チェックが未完了で、リトライ上限まで405（Repository rule violations）が
//   続いたときの扱い（issue #1500）。"throw"（既定）は、これまでどおり例外を投げる。
//   "skip"は、失敗にせず、警告とJob Summaryを出してnullを返す。PRは残り、参照側のCIの自動マージが、
//   チェックの通過後にマージする。数分かかるチェックの完了を、この処理では待てないため
// maxAttempts: リトライ上限（既定5回）
// sleep: リトライ間隔の待機に使う関数（テスト用に差し替え可能。既定はsetTimeout）
// 戻り値: マージ後に生成されたコミットのSHA。expectedHeadSha不一致でスキップした場合はnull
// 必須チェックが未完了・未通過で、ルール違反（405）になったか。権限不足（403）・競合などは含まない
function isRequiredChecksPending(error) {
  return error.status === 405 && /required status check|status checks? (are|is|have)|rule violations/i.test(error.message ?? "");
}

// 待たずに終えたことを、警告とJob Summaryに出す（PRが残るため、人が気づけるようにする）
function reportPendingChecks(pullNumber, error) {
  const note = `PR #${pullNumber} は、必須チェックの完了待ちのため、この処理ではマージしませんでした。チェックの通過後に、参照側のCIの自動マージが、マージします（自動マージが無いリポジトリでは、手動でマージしてください）。`;
  console.log(`::warning::${note}`);
  console.log(`(詳細: ${error.message})`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    require("node:fs").appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n> ⚠ ${note}\n`);
  }
}

async function mergePrWithRetry({
  github,
  context,
  pullNumber,
  expectedHeadSha,
  maxAttempts = 5,
  onRequiredChecksPending = "throw",
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data } = await github.rest.pulls.merge({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: pullNumber,
        merge_method: "squash",
        ...(expectedHeadSha ? { sha: expectedHeadSha } : {}),
      });
      console.log(`Successfully merged PR #${pullNumber} as ${data.sha}`);
      return data.sha;
    } catch (error) {
      if (expectedHeadSha && error.status === 409) {
        console.log(
          `PR #${pullNumber}'s head no longer matches the tested commit (${expectedHeadSha}). Skipping merge: ${error.message}`,
        );
        return null;
      }
      if (attempt === maxAttempts) {
        if (onRequiredChecksPending === "skip" && isRequiredChecksPending(error)) {
          reportPendingChecks(pullNumber, error);
          return null;
        }
        console.error(`Failed to merge PR #${pullNumber}:`, error.message);
        throw error;
      }
      console.log(`Merge attempt ${attempt} failed (${error.message}), retrying...`);
      await sleep(attempt * 3000);
    }
  }
}

// branchName: 削除対象のブランチ名（`heads/`は付けない）。既に削除済み・
// 存在しない場合（422・"Reference does not exist"）は無視する
async function deleteBranchIgnoringNotFound({ github, context, branchName }) {
  try {
    await github.rest.git.deleteRef({
      owner: context.repo.owner,
      repo: context.repo.repo,
      ref: `heads/${branchName}`,
    });
    console.log(`Successfully deleted branch: ${branchName}`);
  } catch (error) {
    if (error.status === 422 || error.message.includes("Reference does not exist")) {
      console.log(`Branch ${branchName} already deleted or not found.`);
    } else {
      console.error(`Failed to delete branch ${branchName}:`, error.message);
    }
  }
}

module.exports = { mergePrWithRetry, deleteBranchIgnoringNotFound };
