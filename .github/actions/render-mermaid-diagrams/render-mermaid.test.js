"use strict";

// render-mermaid.jsはトップレベルで`const { execFileSync } = require("child_process")`
// と分割代入しており、後からchildProcess.execFileSyncをモックしても既に取り出した
// ローカル参照には反映されない（生きたバインディングではないため）。そのため、
// render-mermaid.jsを最初にrequireする前にモックを仕込む必要がある
// （Node.jsのrequireキャッシュにより、以降の同一プロセス内requireは全てこの
// モック適用後の状態を見る）。1回だけmock.method()した薄いディスパッチャーとし、
// テストごとの挙動はimplを差し替えることで切り替える（mock.method()の多重適用は
// 復元順序が絡み挙動が不安定になるため避ける）。

const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

let impl = () => Buffer.from("");
mock.method(childProcess, "execFileSync", (...args) => impl(...args));

const { renderBlock, RENDER_TIMEOUT_MS } = require("./render-mermaid.js");

function withTempOutputPath(run) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "render-mermaid-test-"));
  try {
    run(path.join(outputDir, "example.png"));
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

test("renderBlock invokes mmdc with a bounded timeout (bamiyanapp/dev-standards#223)", () => {
  const calls = [];
  impl = (...args) => {
    calls.push(args);
    return Buffer.from("");
  };

  withTempOutputPath((outputImagePath) => {
    renderBlock("graph TD\n  A --> B", outputImagePath, __dirname);

    assert.equal(calls.length, 1);
    const [, , options] = calls[0];
    assert.equal(options.timeout, RENDER_TIMEOUT_MS);
    assert.ok(RENDER_TIMEOUT_MS > 0, "timeout must be a positive, finite value (not undefined/unbounded)");
  });
});

test("renderBlock cleans up the temporary .mmd file even when mmdc fails", () => {
  impl = () => {
    throw new Error("ETIMEDOUT (simulated)");
  };

  withTempOutputPath((outputImagePath) => {
    const tmpMmdPath = `${outputImagePath}.mmd`;
    assert.throws(() => renderBlock("graph TD\n  A --> B", outputImagePath, __dirname), /ETIMEDOUT/);
    assert.equal(fs.existsSync(tmpMmdPath), false);
  });
});
