"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { findCdnTags } = require("./check-cdn-libs.js");

test("CDNのscript・linkを、行番号・URL・SRIの有無つきで拾う", () => {
  const html = [
    "<html><head>",
    '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">',
    '<script src="https://unpkg.com/react@18/umd/react.production.min.js" integrity="sha384-x" crossorigin></script>',
    "</head></html>",
  ].join("\n");
  const found = findCdnTags(html);
  assert.equal(found.length, 2);
  assert.deepEqual([found[0].line, found[0].url, found[0].hasIntegrity], [2, "//cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css", false]);
  assert.deepEqual([found[1].line, found[1].hasIntegrity], [3, true]);
});

test("複数行にまたがるタグや、プロトコル相対のURLも拾う", () => {
  const html = '<script\n  async\n  src="//cdnjs.cloudflare.com/ajax/libs/x/1.0/x.js"\n></script>';
  const found = findCdnTags(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 1);
});

test("自分のドメイン・相対パス・CDNでないホストは拾わない", () => {
  const html = [
    '<script src="/assets/app.js"></script>',
    '<script src="https://example.com/app.js"></script>',
    '<link rel="stylesheet" href="./local.css">',
    '<a href="https://cdn.jsdelivr.net/">リンクだけ</a>',
  ].join("\n");
  assert.deepEqual(findCdnTags(html), []);
});

test("許可の目印（同じ行・直前の行）がある場合は、拾わない", () => {
  const html = [
    '<script src="https://unpkg.com/a.js"></script> <!-- dev-standards-allow-cdn: 理由 -->',
    "<!-- dev-standards-allow-cdn: 外部ウィジェットのため -->",
    '<script src="https://unpkg.com/b.js"></script>',
    '<script src="https://unpkg.com/c.js"></script>',
  ].join("\n");
  const found = findCdnTags(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 4);
});

test("Google FontsのCDNは、この検査の対象にしない（check-cdn-fontsが見る）", () => {
  assert.deepEqual(findCdnTags('<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet">'), []);
});
