"use strict";

// issue #1240。dependency-*-info系スクリプト群が、npm registry等へfetchし
// `!response.ok`で例外化するだけの`defaultFetchJson`を、ほぼ同一のコードで
// 8ファイルに重複定義していた。挙動変更時に全箇所を同時改修する必要があり
// 修正漏れのリスクがあったため、共通モジュールへ切り出す。
//
// 各呼び出し元のエラーメッセージ文言・404特別扱いの有無は元の実装ごとに
// 異なっていたため、挙動を変えないようオプションで指定可能にしている。

const NPM_REGISTRY_BASE = "https://registry.npmjs.org";

// formatError: (url, response) => string。既定は各dependency-*-info.jsの
// npm registry向け実装が共通して使っていた文言に合わせる
// notFoundReturnsNull: true の場合、404を例外ではなく null として返す
// （dependency-scorecard-info.jsのみが必要とする挙動。プロジェクト未評価は
// エラーではないため）
function createFetchJson({
  formatError = (url, response) => `request to ${url} failed: ${response.status} ${response.statusText}`,
  notFoundReturnsNull = false,
} = {}) {
  return async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (notFoundReturnsNull && response.status === 404) return null;
    if (!response.ok) {
      throw new Error(formatError(url, response));
    }
    return response.json();
  };
}

module.exports = { createFetchJson, NPM_REGISTRY_BASE };
