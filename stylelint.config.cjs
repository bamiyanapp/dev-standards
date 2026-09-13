"use strict";

// commitlint.config.cjsと同様、参照側リポジトリへsymlinkでそのまま配布する共有stylelint設定
// （sync-manifest.json参照）。プロダクト固有のカスタマイズは想定しておらず、
// stylelint-config-standardをベースにそのまま使う（issue #429）。
module.exports = {
  extends: "stylelint-config-standard",
};
