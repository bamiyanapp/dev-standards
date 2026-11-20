"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { check, findCdnLines, isTarget } = require("./check-cdn-fonts.js");

function tmpTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cdn-fonts-"));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

test("findCdnLines: fonts.googleapis.comとfonts.gstatic.comの行を返す（1始まり）", () => {
  const text = ['<link rel="preconnect" href="https://fonts.gstatic.com">', "<p>x</p>", '<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c">'].join("\n");
  assert.deepEqual(findCdnLines(text), [1, 3]);
});

test("findCdnLines: 許可の目印が、同じ行・直前の行にあれば、除く", () => {
  const text = ["/* dev-standards-allow-cdn-fonts: 検証用 */", "@import url(https://fonts.googleapis.com/x);", "@import url(https://fonts.gstatic.com/y); /* dev-standards-allow-cdn-fonts */", "body {}", "@import url(https://fonts.gstatic.com/z);"].join("\n");
  assert.deepEqual(findCdnLines(text), [5]);
});

test("findCdnLines: 無関係な文章は、検知しない", () => {
  assert.deepEqual(findCdnLines("@import '@fontsource/m-plus-rounded-1c/400.css';\nfonts.example.com"), []);
});

test("isTarget: HTML・CSS・JS/TSが対象。テスト・画像・Markdownは対象外", () => {
  for (const f of ["index.html", "a.css", "b.tsx", "c.js", "d.vue"]) assert.equal(isTarget(f), true, f);
  for (const f of ["a.test.tsx", "b.spec.ts", "c.md", "d.png", "e.json"]) assert.equal(isTarget(f), false, f);
});

test("check: ディレクトリを走査し、違反のファイルと行を返す。node_modules・dist・e2e・dev-standardsは見ない", () => {
  const root = tmpTree({
    "index.html": '<link href="https://fonts.googleapis.com/css2">\n',
    "src/style.css": "body{}\n",
    "src/app.test.ts": "https://fonts.googleapis.com\n",
    "e2e/helpers.ts": '"fonts.googleapis.com"\n',
    "node_modules/x/a.js": "fonts.gstatic.com\n",
    "dist/b.html": "fonts.gstatic.com\n",
    "dev-standards/shared/ui/c.css": "fonts.googleapis.com\n",
  });
  const { violations, scanned } = check([root]);
  assert.deepEqual(violations.map((v) => [path.relative(root, v.file), v.line]), [["index.html", 1]]);
  assert.equal(scanned, 2);
});

test("check: 存在しないパスは、無視する", () => {
  assert.deepEqual(check(["/nonexistent-dir-for-test"]), { violations: [], scanned: 0 });
});
