"use strict";

// commitlint.config.cjs・stylelint.config.cjs・textlint.config.cjsと同様、参照側リポジトリへ
// symlinkでそのまま配布する共有dependency-cruiser設定（sync-manifest.json参照）。プロダクト
// 固有のカスタマイズは想定しない（issue #523）。
//
// 検知対象は以下の2種類。
// - 循環依存: モジュール間の循環importはロジックの見通しを悪化させる
// - frontend/backend越境import: npm workspacesモノレポ（frontend/・backend/が同一
//   リポジトリ）では、GitHub側の機構だけではfrontendからbackend内部モジュール
//   （AWS SDK等）への相対importを物理的に禁止できない。AI駆動開発では人間が常時
//   全体構造を目視でウォッチする「無意識の歯止め」が働きにくく、層違反がレビューを
//   すり抜けて蓄積しやすいため、機械的に検知する
//
// frontend/backendの単一パッケージ構成（workspacesを使わないプロダクト）では、
// 越境importルールはそもそも該当パスが存在せず該当しない（誤検知しない）。
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "モジュール間の循環依存はロジックの見通しを悪化させ、リファクタリング時の副作用を予測しにくくする",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-frontend-to-backend",
      severity: "error",
      comment:
        "frontend/とbackend/は独立したデプロイ単位（別々のホスティング先へ配布される）であり、" +
        "frontend側からbackend内部モジュール（AWS SDK等）への直接importを禁止する",
      from: { path: "^frontend" },
      to: { path: "^backend" },
    },
    {
      name: "no-backend-to-frontend",
      severity: "error",
      comment: "同上の逆方向。backend側からfrontend内部モジュールへの直接importを禁止する",
      from: { path: "^backend" },
      to: { path: "^frontend" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // e2eディレクトリはPlaywright専用でPlaywright自身が管轄しビルド成果物ではないため対象外。
    // dist・coverageはビルド・テストの生成物であり解析対象外
    exclude: { path: "(^|/)(e2e|dist|coverage)(/|$)" },
    tsPreCompilationDeps: true,
  },
};
