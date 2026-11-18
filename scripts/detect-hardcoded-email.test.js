"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detect, parseAllowlist, isAllowed } = require("./detect-hardcoded-email.js");

const diff = (lines, file = ".github/workflows/cd.yml", start = 10) =>
  [`+++ b/${file}`, `@@ -0,0 +${start},${lines.length} @@`, ...lines.map((l) => `+${l}`)].join("\n");

test("追加行の実在らしきアドレスを検知し、値は伏せて返す", () => {
  const found = detect(diff(["email: ${{ vars.NOTIFY || 'taro.yamada@gmail.com' }}"]));
  assert.deepEqual(found, [{ file: ".github/workflows/cd.yml", line: 10, masked: "t***@gmail.com" }]);
  assert.ok(!JSON.stringify(found).includes("taro.yamada"));
});

test("行番号は複数行・複数hunkで正しく進む", () => {
  const text = ["+++ b/a.yml", "@@ -0,0 +5,2 @@", "+ok", "+x: a@gmail.com", "@@ -9,0 +20,1 @@", "+y: b@gmail.com"].join("\n");
  assert.deepEqual(detect(text).map((f) => f.line), [6, 20]);
});

test("文書用・bot用のアドレスは検知しない", () => {
  const lines = ["a@example.com", "b@sub.example.org", "noreply@anthropic.com", "123+x@users.noreply.github.com", "no-reply@corp.co.jp", "img@2x.png"];
  assert.deepEqual(detect(diff(lines)), []);
});

test("削除行・コンテキスト行・ヘッダ行は対象外", () => {
  const text = ["--- a/x.yml", "+++ b/x.yml", "@@ -1,1 +1,1 @@", "-old@gmail.com", " ctx@gmail.com"].join("\n");
  assert.deepEqual(detect(text), []);
});

test("許可リスト（完全一致・@ドメイン）で除外できる", () => {
  const allow = parseAllowlist("# コメント\nteam@corp.co.jp\n@internal.example.co.jp\n");
  assert.ok(isAllowed("TEAM@corp.co.jp", allow));
  assert.ok(isAllowed("x@internal.example.co.jp", allow));
  assert.ok(!isAllowed("other@corp.co.jp", allow));
  assert.deepEqual(detect(diff(["a: team@corp.co.jp"]), allow), []);
});

test("1行に複数あれば、それぞれ検知する", () => {
  assert.equal(detect(diff(["a@gmail.com, b@gmail.com"])).length, 2);
});

test("uses:のバージョン指定（@v2.149.1等）は、メールアドレスとして検知しない（#1491）", () => {
  const lines = [
    "uses: bamiyanapp/dev-standards/.github/workflows/reusable-ci.yml@v2.149.1",
    "uses: actions/checkout@v6",
    "uses: some/action@v1.2.3",
    "self_ref: v2.149.1",
  ];
  assert.deepEqual(detect(diff(lines)), []);
});

test("バージョン指定の誤検知を除いても、通常のアドレスは従来どおり検知する（#1491）", () => {
  const found = detect(diff(["a: taro@gmail.com", "b: hanako@mail.example.co.jp.", "c: x@corp.io"]));
  assert.deepEqual(found.map((f) => f.masked), ["t***@gmail.com", "h***@mail.example.co.jp", "x***@corp.io"]);
});
