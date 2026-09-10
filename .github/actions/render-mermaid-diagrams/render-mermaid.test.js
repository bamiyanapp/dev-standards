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

const {
  renderBlock,
  RENDER_TIMEOUT_MS,
  IMAGE_SCALE,
  HORIZONTAL_MARGIN_PX,
  VERTICAL_MARGIN_PX,
} = require("./render-mermaid.js");

function withTempOutputPath(run) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "render-mermaid-test-"));
  try {
    run(path.join(outputDir, "example.png"));
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

test("renderBlock invokes mmdc with a bounded timeout and a scale factor for higher resolution (bamiyanapp/dev-standards#223, #388)", () => {
  const calls = [];
  impl = (...args) => {
    calls.push(args);
    return Buffer.from("");
  };

  withTempOutputPath((outputImagePath) => {
    renderBlock("graph TD\n  A --> B", outputImagePath, __dirname);

    assert.equal(calls.length, 2, "mmdc、続けてconvert（余白追加）の2回呼ばれるはず");
    const [mmdcBinary, mmdcArgs, mmdcOptions] = calls[0];
    assert.match(mmdcBinary, /mmdc$/);
    assert.equal(mmdcArgs[mmdcArgs.indexOf("-o") + 1], `${outputImagePath}.raw.png`);
    assert.equal(mmdcArgs[mmdcArgs.indexOf("-s") + 1], String(IMAGE_SCALE));
    assert.equal(mmdcOptions.timeout, RENDER_TIMEOUT_MS);
    assert.ok(RENDER_TIMEOUT_MS > 0, "timeout must be a positive, finite value (not undefined/unbounded)");
  });
});

test("renderBlock adds a white margin via ImageMagick so GitHub mobile's image viewer chrome doesn't cover the diagram (bamiyanapp/dev-standards#388)", () => {
  const calls = [];
  impl = (...args) => {
    calls.push(args);
    return Buffer.from("");
  };

  withTempOutputPath((outputImagePath) => {
    renderBlock("graph TD\n  A --> B", outputImagePath, __dirname);

    const [convertBinary, convertArgs, convertOptions] = calls[1];
    assert.equal(convertBinary, "convert");
    assert.equal(convertArgs[0], `${outputImagePath}.raw.png`);
    assert.equal(convertArgs.at(-1), outputImagePath);
    assert.ok(convertArgs.includes("-border"));
    assert.equal(convertArgs[convertArgs.indexOf("-border") + 1], `${HORIZONTAL_MARGIN_PX}x${VERTICAL_MARGIN_PX}`);
    assert.equal(convertOptions.timeout, RENDER_TIMEOUT_MS);
  });
});

test("renderBlock cleans up the intermediate raw PNG even when the ImageMagick border step fails", () => {
  let callCount = 0;
  impl = (...args) => {
    callCount += 1;
    if (callCount === 1) {
      // mmdc呼び出し: 実際にはPuppeteerがPNGファイルを書き出すため、その挙動を模して
      // 中間ファイル（.raw.png）を実際に作成しておく
      const [, mmdcArgs] = args;
      fs.writeFileSync(mmdcArgs[mmdcArgs.indexOf("-o") + 1], "");
      return Buffer.from("");
    }
    throw new Error("convert failed (simulated)");
  };

  withTempOutputPath((outputImagePath) => {
    const tmpRawPngPath = `${outputImagePath}.raw.png`;
    assert.throws(() => renderBlock("graph TD\n  A --> B", outputImagePath, __dirname), /convert failed/);
    assert.equal(fs.existsSync(tmpRawPngPath), false);
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
