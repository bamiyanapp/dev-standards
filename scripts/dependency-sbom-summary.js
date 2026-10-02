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
// 件数を数える。ライセンスポリシー違反の判定（#645「1. 自動安全判定」のLicense行）
// 自体はこのモジュールのスコープ外だが、「判定できないものがある」こと自体は
// 人間が気づけるようにしておく
function countUnknownLicense(components) {
  return components.filter((c) => {
    const licenses = c.licenses ?? [];
    if (licenses.length === 0) return true;
    return licenses.every((l) => !l.license?.id && !l.license?.name);
  }).length;
}

function summarizeSbom(sbomJson) {
  const components = sbomJson?.components ?? [];
  return {
    bomFormat: sbomJson?.bomFormat ?? null,
    specVersion: sbomJson?.specVersion ?? null,
    componentCount: components.length,
    unknownLicenseCount: countUnknownLicense(components),
  };
}

// summarizeSbomの結果をRisk Summaryコメントへ追記するMarkdown断片へ整形する。
// SBOM本体はコメントへ埋め込まない（件数のみ）。詳細はワークフローのartifactを
// 参照する前提（CLAUDE.md「開発環境の制約（スマホオンリー）」、PRコメント内で
// 完結する簡潔な形式を優先する方針に合わせる）
function renderSbomSection(summary) {
  let body = "### SBOM\n\n";
  body += `${summary.bomFormat ?? "SBOM"}（${summary.specVersion ?? "?"}）: ${summary.componentCount}件のコンポーネント。`;
  if (summary.unknownLicenseCount > 0) {
    body += `ライセンス不明のコンポーネントが${summary.unknownLicenseCount}件あります。`;
  }
  body += "詳細はこのワークフロー実行のArtifactを参照してください。\n";
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
  countUnknownLicense,
  summarizeSbom,
  renderSbomSection,
};
