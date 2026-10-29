"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mergePrWithRetry, deleteBranchIgnoringNotFound } = require("./mergePrWithRetry.js");

const context = { repo: { owner: "bamiyanapp", repo: "dev-standards" } };

test("mergePrWithRetry: 成功時はマージコミットのSHAを返す", async () => {
  const github = { rest: { pulls: { merge: async () => ({ data: { sha: "abc123" } }) } } };
  const sha = await mergePrWithRetry({ github, context, pullNumber: 1 });
  assert.equal(sha, "abc123");
});

test("mergePrWithRetry: 失敗しても最大試行回数までリトライして成功する", async () => {
  let calls = 0;
  const github = {
    rest: {
      pulls: {
        merge: async () => {
          calls++;
          if (calls < 3) throw new Error("not mergeable yet");
          return { data: { sha: "retried-sha" } };
        },
      },
    },
  };
  const sha = await mergePrWithRetry({ github, context, pullNumber: 1, maxAttempts: 5, sleep: async () => {} });
  assert.equal(sha, "retried-sha");
  assert.equal(calls, 3);
});

test("mergePrWithRetry: 最大試行回数に達すると例外を投げる", async () => {
  const github = { rest: { pulls: { merge: async () => { throw new Error("permanently blocked"); } } } };
  await assert.rejects(
    () => mergePrWithRetry({ github, context, pullNumber: 1, maxAttempts: 2, sleep: async () => {} }),
    (error) => error.message === "permanently blocked",
  );
});

test("deleteBranchIgnoringNotFound: 成功時は例外を投げない", async () => {
  const github = { rest: { git: { deleteRef: async () => {} } } };
  await assert.doesNotReject(() => deleteBranchIgnoringNotFound({ github, context, branchName: "foo" }));
});

test("deleteBranchIgnoringNotFound: 422は無視する", async () => {
  const github = {
    rest: {
      git: {
        deleteRef: async () => {
          const error = new Error("Validation Failed");
          error.status = 422;
          throw error;
        },
      },
    },
  };
  await assert.doesNotReject(() => deleteBranchIgnoringNotFound({ github, context, branchName: "foo" }));
});

test("deleteBranchIgnoringNotFound: Reference does not existは無視する", async () => {
  const github = {
    rest: {
      git: {
        deleteRef: async () => {
          throw new Error("Reference does not exist");
        },
      },
    },
  };
  await assert.doesNotReject(() => deleteBranchIgnoringNotFound({ github, context, branchName: "foo" }));
});

test("deleteBranchIgnoringNotFound: 他のエラーは無視せず握りつぶして返る（呼び出し元を止めない）", async () => {
  const github = {
    rest: {
      git: {
        deleteRef: async () => {
          throw new Error("rate limited");
        },
      },
    },
  };
  await assert.doesNotReject(() => deleteBranchIgnoringNotFound({ github, context, branchName: "foo" }));
});
