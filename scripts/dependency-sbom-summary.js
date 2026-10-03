"use strict";

const fs = require("node:fs");

// issue #648（OSS依存更新の自動安全判定基盤 Phase 3）SBOM生成・SBOMによる依存資産管理。
// SBOM本体の生成自体は`@cyclonedx/cyclonedx-npm`（`--package-lock-only`オプションで
// node_modulesの実インストール無しにpackage-lock.jsonのみから生成できる。CIステップ側で
// npxから直接呼び出す想定）に委ね、このモジュールは生成済みのCycloneDX SBOM（JSON）を
// 読み取り、Risk Summaryコメントへ載せる短い要約を作る役割のみを持つ
//
// 「SBOMによる依存資産管理」について: SBOM自体はワークフローのartifact（CI側で
// actions/upload-artifactにより添付する想定）としてPRごとに保存・ダウンロード可能な
// 状態にする。これによりSBOMは「生成されるがどこにも残らない」状態を避け、
// 過去のある時点の依存構成を後から確認できる状態にする。恒久的な検索可能DBの構築
// （「監査証跡の台帳化」、#645「8-7」、Phase 4スコープ）までは行わない

// ライセンスが特定できていないコンポーネント（licenses配列が空、または
// license.id/license.nameのいずれも無いエントリ）を「ライセンス不明」として
// 抽出する。ライセンスポリシー違反の判定（#645「1. 自動安全判定」のLicense行）
// 自体はこのモジュールのスコープ外だが、「判定できないものがある」こと自体は
// 人間が気づけるようにしておく。
//
// 件数だけでなくパッケージ名・バージョンまでPRコメント内に直接列挙する
// （issue #716）。SBOM本体のartifact（zip）をスマホで開いて確認するのは
// 現実的ではなく（CLAUDE.md「開発環境の制約（スマホオンリー）」）、
// 件数のみでは「参照しづらい」という指摘を受けたため
function findUnknownLicenseComponents(components) {
  return components
    .filter((c) => {
      const licenses = c.licenses ?? [];
      if (licenses.length === 0) return true;
      return licenses.every((l) => !l.license?.id && !l.license?.name);
    })
    .map((c) => ({ name: c.name ?? "?", version: c.version ?? null }));
}

function summarizeSbom(sbomJson) {
  const components = sbomJson?.components ?? [];
  const unknownLicenseComponents = findUnknownLicenseComponents(components);
  return {
    bomFormat: sbomJson?.bomFormat ?? null,
    specVersion: sbomJson?.specVersion ?? null,
    componentCount: components.length,
    unknownLicenseComponents,
  };
}

// summarizeSbomの結果をRisk Summaryコメントへ追記するMarkdown断片へ整形する。
// SBOM本体（全コンポーネント一覧等）はコメントへ埋め込まず、ワークフローの
// artifactを参照する前提（CLAUDE.md「開発環境の制約（スマホオンリー）」）だが、
// ライセンス不明のコンポーネントだけは<details>で折りたたんでコメント内に直接
// 列挙する（issue #716、artifactのダウンロードを必須にしない）
function renderSbomSection(summary) {
  let body = "### SBOM\n\n";
  body += `${summary.bomFormat ?? "SBOM"}（${summary.specVersion ?? "?"}）: ${summary.componentCount}件のコンポーネント。\n\n`;
  if (summary.unknownLicenseComponents.length > 0) {
    body += `<details><summary>ライセンス不明のコンポーネント（${summary.unknownLicenseComponents.length}件）</summary>\n\n`;
    body += "| パッケージ | バージョン |\n|---|---|\n";
    for (const c of summary.unknownLicenseComponents) {
      body += `| ${c.name} | ${c.version ?? "?"} |\n`;
    }
    body += "\n</details>\n\n";
  }
  body += "SBOM本体（全コンポーネント一覧等）はこのワークフロー実行のArtifactを参照してください。\n";
  return body;
}

function main() {
  const [, , sbomPath] = process.argv;
  if (!sbomPath) {
    console.error("Usage: node dependency-sbom-summary.js <sbom.json>");
    process.exitCode = 1;
    return;
  }
  const sbomJson = JSON.parse(fs.readFileSync(sbomPath, "utf-8"));
  console.log(renderSbomSection(summarizeSbom(sbomJson)));
}

if (require.main === module) {
  main();
}

module.exports = {
  findUnknownLicenseComponents,
  summarizeSbom,
  renderSbomSection,
};
