"use strict";

// notify-cd-failure複合actionの本体（issue #1452）。actions/github-scriptから呼ぶ。
// テストできるよう、github・context・coreを引数で受け取る（`.github/actions/*/*.test.js`）。
//
// 固定タイトルの未解決issueがあれば、失敗したrunの情報をコメントする。無ければ起票する。
// 実行毎に新規issueを積み重ねない。PRは、同名でもissueとして扱わない。

function buildBody(context) {
  const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const sha = context.sha.slice(0, 7);
  return `CDが失敗しました。\n\n- run: ${runUrl}\n- コミット: ${sha}\n- ブランチ: ${context.ref}\n\n失敗したジョブのログを確認してください。`;
}

// 戻り値: コメントまたは起票したissue番号（文字列）。出力`issue_number`にも設定する
async function syncIssue({ github, context, core, title, labels }) {
  const { owner, repo } = context.repo;
  const body = buildBody(context);
  const open = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: "open" });
  const existing = open.find((issue) => !issue.pull_request && issue.title === title);

  let issueNumber;
  if (existing) {
    await github.rest.issues.createComment({ owner, repo, issue_number: existing.number, body });
    issueNumber = String(existing.number);
  } else {
    const created = await github.rest.issues.create({ owner, repo, title, body, labels });
    issueNumber = String(created.data.number);
  }
  core.setOutput("issue_number", issueNumber);
  return issueNumber;
}

module.exports = { buildBody, syncIssue };
