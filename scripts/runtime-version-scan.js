"use strict";

const fs = require("node:fs");

// issue #1881のフォローアップ。CVE-2026-111497（Node.js組み込みBrotliデコーダの
// 範囲外書き込み）の調査で、AWS Lambda等のマネージドランタイムが実際にどの
// Node.jsパッチバージョンで動いているかを確認する手段が参照側リポジトリに
// 無いことが分かった。既存のdependency-risk-summary・dependency-full-scanは
// いずれもnpmパッケージ（package-lock.json）専用であり、Node.js本体・AWS管理の
// ランタイム自体はスコープ外である。
//
// 本スクリプトは、呼び出し元が指定するエンドポイント群（例: karutaの
// backend/handler.jsの/get-versionのような、稼働中プロセスの`process.version`を
// 返すエンドポイント）へ問い合わせ、Node.js公式のリリース一覧
// （https://nodejs.org/dist/index.json）における同一メジャー系列の最新バージョンと
// 比較する。エンドポイント側のレスポンス形式は`{ "nodeVersion": "v22.23.4" }`
// （先頭の"v"有無はどちらでも許容）を期待する。
//
// 既知の限界: 「最新パッチより古い」ことは「既知の脆弱性を持つ」ことの確実な
// 証明ではない（最新パッチが脆弱性修正を含まないメンテナンスリリースの場合も
// 検知してしまう、いわば保守的な判定）。一方で「最新パッチと一致している」ことは
// 「既知の脆弱性が無い」ことの証明にもならない（本スクリプト自体はCVE内容の
// 照合を行わない）。既存のdependency-staleness-info.js（放置検知）と同種の、
// 「古さ」という弱い信号のみを扱う設計である。正確な脆弱性有無の判定は、人間が
// Node.js公式のセキュリティリリースアナウンス（nodejs.org/en/blog/vulnerability/）
// を確認する必要がある。

function parseVersion(raw) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(raw ?? "").trim());
  if (!match) return null;
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), raw: String(raw).trim() };
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

// Node.js公式のリリース一覧から、指定したメジャー系列内の最新バージョンを返す。
// index.jsonは新しいリリースが先頭に来る降順でソートされているため、該当
// メジャー系列の最初の要素が最新パッチとなる
function latestVersionForMajor(releases, major) {
  for (const release of releases) {
    const version = parseVersion(release.version);
    if (version && version.major === major) return version;
  }
  return null;
}

// fetchJsonImpl: テスト用に差し替え可能なHTTP呼び出し実装（既定はグローバルfetch）
async function fetchJson(url, { fetchJsonImpl } = {}) {
  if (fetchJsonImpl) return fetchJsonImpl(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// endpoints: [{ name, url }] 形式。name はIssue本文での表示用ラベル（例: "canary"）
// 戻り値: 最新パッチより古いエンドポイントのみの配列
// { name, url, currentVersion, latestVersion, major }
async function scanRuntimeVersions(endpoints, { fetchJsonImpl } = {}) {
  const releases = await fetchJson("https://nodejs.org/dist/index.json", { fetchJsonImpl });

  const outdated = [];
  for (const endpoint of endpoints) {
    // issue #1170。HTTPエラー・ネットワーク到達不可等でfetchJson自体が例外を
    // 投げるケースをcatchしていなかった。canary/stableの一方が起動直後・
    // デプロイ中等で一時的に不安定な状況は普通に起こりうるため、1エンドポイントの
    // 到達失敗が他の正常なエンドポイントの結果まで失わせてしまうことを防ぐ
    let body;
    try {
      body = await fetchJson(endpoint.url, { fetchJsonImpl });
    } catch (error) {
      outdated.push({ name: endpoint.name, url: endpoint.url, error: `エンドポイントへの到達に失敗した: ${error.message}` });
      continue;
    }
    const current = parseVersion(body?.nodeVersion);
    if (!current) {
      outdated.push({ name: endpoint.name, url: endpoint.url, error: "nodeVersionを取得できなかった（レスポンス形式不正、または欠落）" });
      continue;
    }
    const latest = latestVersionForMajor(releases, current.major);
    if (!latest) continue; // 公式リリース一覧に同一メジャー系列が見つからない場合はスキップ（EOL等）
    if (compareVersions(current, latest) < 0) {
      outdated.push({
        name: endpoint.name,
        url: endpoint.url,
        currentVersion: current.raw,
        latestVersion: latest.raw,
        major: current.major,
      });
    }
  }
  return outdated;
}

function main() {
  const [, , endpointsJsonPath] = process.argv;
  if (!endpointsJsonPath) {
    console.error('Usage: node runtime-version-scan.js <endpoints.json>  # [{ "name": "...", "url": "..." }, ...]');
    process.exitCode = 1;
    return;
  }

  const endpoints = JSON.parse(fs.readFileSync(endpointsJsonPath, "utf-8"));
  scanRuntimeVersions(endpoints)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_outdated=${result.length > 0}\n`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  parseVersion,
  compareVersions,
  latestVersionForMajor,
  scanRuntimeVersions,
};
