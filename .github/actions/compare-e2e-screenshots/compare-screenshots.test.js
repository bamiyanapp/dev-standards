"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PNG } = require("pngjs");
const { compareImages, compareAll } = require("./compare-screenshots.js");

function makePngBuffer(width, height, [r, g, b]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

test("compareImages: returns unchanged for pixel-identical images", () => {
  const a = makePngBuffer(8, 8, [255, 0, 0]);
  const b = makePngBuffer(8, 8, [255, 0, 0]);
  assert.equal(compareImages(a, b), "unchanged");
});

test("compareImages: returns changed when pixel colors differ", () => {
  const a = makePngBuffer(8, 8, [255, 0, 0]);
  const b = makePngBuffer(8, 8, [0, 255, 0]);
  assert.equal(compareImages(a, b), "changed");
});

test("compareImages: returns changed when the image dimensions differ", () => {
  const a = makePngBuffer(8, 8, [255, 0, 0]);
  const b = makePngBuffer(16, 16, [255, 0, 0]);
  assert.equal(compareImages(a, b), "changed");
});

test("compareAll: marks a screenshot as new when no same-named baseline exists", () => {
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "screenshots-"));
  const baselineDir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-"));
  fs.writeFileSync(path.join(screenshotDir, "top-page.png"), makePngBuffer(4, 4, [1, 2, 3]));

  const results = compareAll(screenshotDir, baselineDir);
  assert.deepEqual(results, { "top-page": "new" });
});

test("compareAll: marks a screenshot as unchanged when it matches the baseline exactly", () => {
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "screenshots-"));
  const baselineDir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-"));
  const buffer = makePngBuffer(4, 4, [10, 20, 30]);
  fs.writeFileSync(path.join(screenshotDir, "top-page.png"), buffer);
  fs.writeFileSync(path.join(baselineDir, "top-page.png"), buffer);

  const results = compareAll(screenshotDir, baselineDir);
  assert.deepEqual(results, { "top-page": "unchanged" });
});

test("compareAll: marks a screenshot as changed when it differs from the baseline", () => {
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "screenshots-"));
  const baselineDir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-"));
  fs.writeFileSync(path.join(screenshotDir, "top-page.png"), makePngBuffer(4, 4, [10, 20, 30]));
  fs.writeFileSync(path.join(baselineDir, "top-page.png"), makePngBuffer(4, 4, [200, 200, 200]));

  const results = compareAll(screenshotDir, baselineDir);
  assert.deepEqual(results, { "top-page": "changed" });
});

test("compareAll: treats a corrupted baseline file as changed instead of throwing", () => {
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "screenshots-"));
  const baselineDir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-"));
  fs.writeFileSync(path.join(screenshotDir, "top-page.png"), makePngBuffer(4, 4, [10, 20, 30]));
  fs.writeFileSync(path.join(baselineDir, "top-page.png"), Buffer.from("not a png"));

  const results = compareAll(screenshotDir, baselineDir);
  assert.deepEqual(results, { "top-page": "changed" });
});

test("compareAll: returns an empty result when the screenshot directory does not exist", () => {
  const baselineDir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-"));
  const results = compareAll(path.join(os.tmpdir(), "does-not-exist-" + Date.now()), baselineDir);
  assert.deepEqual(results, {});
});
