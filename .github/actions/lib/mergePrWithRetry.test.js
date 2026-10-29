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

test("mergePrWithRetry: expectedHeadSha指定時はpulls.mergeへshaを渡す", async () => {
  let receivedInput;
  const github = {
    rest: {
      pulls: {
        merge: async (input) => {
          receivedInput = input;
          return { data: { sha: "abc123" } };
        },
      },
    },
  };
  await mergePrWithRetry({ github, context, pullNumber: 1, expectedHeadSha: "expected-sha" });
  assert.equal(receivedInput.sha, "expected-sha");
});

test("mergePrWithRetry: expectedHeadSha不一致（409）はリトライせずnullを返す", async () => {
  let calls = 0;
  const github = {
    rest: {
      pulls: {
        merge: async () => {
          calls++;
          const error = new Error("Head branch was modified. Review and try the merge again.");
          error.status = 409;
          throw error;
        },
      },
    },
  };
  const result = await mergePrWithRetry({
    github,
    context,
    pullNumber: 1,
    expectedHeadSha: "expected-sha",
    sleep: async () => {
      throw new Error("sleep should not be called when skipping on 409");
    },
  });
  assert.equal(result, null);
  assert.equal(calls, 1);
});

test("mergePrWithRetry: expectedHeadSha未指定の409は通常のエラーとしてリトライする", async () => {
  let calls = 0;
  const github = {
    rest: {
      pulls: {
        merge: async () => {
          calls++;
          const error = new Error("some other conflict");
          error.status = 409;
          if (calls < 2) throw error;
          return { data: { sha: "recovered-sha" } };
        },
      },
    },
  };
  const sha = await mergePrWithRetry({ github, context, pullNumber: 1, sleep: async () => {} });
  assert.equal(sha, "recovered-sha");
  assert.equal(calls, 2);
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
