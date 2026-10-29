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
// maxAttempts: リトライ上限（既定5回）
// sleep: リトライ間隔の待機に使う関数（テスト用に差し替え可能。既定はsetTimeout）
// 戻り値: マージ後に生成されたコミットのSHA。expectedHeadSha不一致でスキップした場合はnull
async function mergePrWithRetry({
  github,
  context,
  pullNumber,
  expectedHeadSha,
  maxAttempts = 5,
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
