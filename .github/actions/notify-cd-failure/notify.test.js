"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildBody, syncIssue } = require("./notify.js");

const context = {
  serverUrl: "https://github.com",
  repo: { owner: "acme", repo: "app" },
  runId: 4242,
  sha: "0123456789abcdef",
  ref: "refs/heads/main",
};

// ghのAPIをスタブする。openは、listForRepoが返すissue・PRの一覧
function stub(open) {
  const calls = { created: [], commented: [], outputs: {} };
  const github = {
    paginate: async () => open,
    rest: {
      issues: {
        listForRepo: () => {},
        create: async (params) => {
          calls.created.push(params);
          return { data: { number: 77 } };
        },
        createComment: async (params) => {
          calls.commented.push(params);
        },
      },
    },
  };
  const core = { setOutput: (key, value) => (calls.outputs[key] = value) };
  return { github, core, calls };
}

const input = { title: "CD失敗", labels: ["bug", "priority: high"] };

test("buildBody: run・コミット（7桁）・ブランチを含む", () => {
  const body = buildBody(context);
  assert.match(body, /https:\/\/github\.com\/acme\/app\/actions\/runs\/4242/);
  assert.match(body, /コミット: 0123456\n/);
  assert.match(body, /ブランチ: refs\/heads\/main/);
});

test("同名の未解決issueが無ければ、ラベルつきで起票する", async () => {
  const { github, core, calls } = stub([{ number: 5, title: "別のissue" }]);

  const number = await syncIssue({ github, context, core, ...input });

  assert.equal(number, "77");
  assert.equal(calls.commented.length, 0);
  assert.equal(calls.created.length, 1);
  assert.deepEqual(calls.created[0].labels, ["bug", "priority: high"]);
  assert.equal(calls.created[0].title, "CD失敗");
  assert.equal(calls.outputs.issue_number, "77");
});

test("同名の未解決issueがあれば、起票せずコメントする", async () => {
  const { github, core, calls } = stub([{ number: 12, title: "CD失敗" }]);

  const number = await syncIssue({ github, context, core, ...input });

  assert.equal(number, "12");
  assert.equal(calls.created.length, 0);
  assert.equal(calls.commented.length, 1);
  assert.equal(calls.commented[0].issue_number, 12);
  assert.match(calls.commented[0].body, /runs\/4242/);
  assert.equal(calls.outputs.issue_number, "12");
});

test("同名のPRは、issueとして扱わず、起票する", async () => {
  const { github, core, calls } = stub([{ number: 9, title: "CD失敗", pull_request: {} }]);

  await syncIssue({ github, context, core, ...input });

  assert.equal(calls.commented.length, 0);
  assert.equal(calls.created.length, 1);
});

test("コメントの宛先・起票先は、実行中のリポジトリ", async () => {
  const { github, core, calls } = stub([]);

  await syncIssue({ github, context, core, ...input });

  assert.equal(calls.created[0].owner, "acme");
  assert.equal(calls.created[0].repo, "app");
});
