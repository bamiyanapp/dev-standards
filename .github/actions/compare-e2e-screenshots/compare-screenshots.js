"use strict";

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
// pixelmatchはESM専用パッケージ（"type": "module"）のため、CJSのrequire()経由では
// 実体が.defaultに入る（Node.jsのCJS/ESM相互運用の仕様）
const pixelmatch = require("pixelmatch").default;

// アンチエイリアシング等の微差をノイズとして無視するための許容誤差（pixelmatchのthreshold、
// 0〜1で大きいほど寛容）。フォントレンダリングの僅かな揺れで誤検知しないよう、
// pixelmatchの既定値（0.1）より少し緩めにする
const PIXELMATCH_THRESHOLD = 0.15;

// newBuffer/baselineBuffer（いずれもPNGファイルのBuffer）をピクセル単位で比較し、
// "changed"（差分あり、または寸法自体が異なる）か"unchanged"（完全一致）を返す。
// fs等の副作用を持たない純粋関数にして単体テスト可能にする
function compareImages(newBuffer, baselineBuffer) {
  const newPng = PNG.sync.read(newBuffer);
  const basePng = PNG.sync.read(baselineBuffer);
  if (newPng.width !== basePng.width || newPng.height !== basePng.height) {
    return "changed";
  }
  const diffPixelCount = pixelmatch(
    newPng.data,
    basePng.data,
    null,
    newPng.width,
    newPng.height,
    { threshold: PIXELMATCH_THRESHOLD }
  );
  return diffPixelCount > 0 ? "changed" : "unchanged";
}

// screenshotDir配下の各PNGについて、baselineDir内の同名PNGと比較した結果
// （{name: "new"|"changed"|"unchanged"}）を返す。baselineDir自体が存在しない
// （初回実行等でベースラインが無い）場合は全件"new"として扱う
function compareAll(screenshotDir, baselineDir) {
  const results = {};
  if (!fs.existsSync(screenshotDir)) {
    return results;
  }
  const pngFiles = fs.readdirSync(screenshotDir).filter((f) => f.endsWith(".png"));

  for (const png of pngFiles) {
    const name = png.slice(0, -".png".length);
    const baselinePath = path.join(baselineDir, png);
    if (!fs.existsSync(baselinePath)) {
      results[name] = "new";
      continue;
    }
    try {
      const newBuffer = fs.readFileSync(path.join(screenshotDir, png));
      const baselineBuffer = fs.readFileSync(baselinePath);
      results[name] = compareImages(newBuffer, baselineBuffer);
    } catch (error) {
      console.error(`Failed to compare screenshot "${name}":`, error.message);
      // 比較自体に失敗した場合（画像破損等）は、差分を誤って見落とさないよう安全側のchangedとする
      results[name] = "changed";
    }
  }
  return results;
}

function run() {
  const screenshotDir = process.env.SCREENSHOT_DIR;
  const baselineDir = process.env.BASELINE_DIR;
  const outputFile = process.env.OUTPUT_FILE;

  const results = compareAll(screenshotDir, baselineDir);
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
}

if (require.main === module) {
  run();
}

module.exports = { compareImages, compareAll };
