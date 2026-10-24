"use strict";

const fs = require("node:fs");
const semver = require("semver");

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
// issue #1188。「最新パッチより古い」ことは「既知の脆弱性を持つ」ことの確実な
// 証明ではない（最新パッチが脆弱性修正を含まないメンテナンスリリースの場合も
// 検知してしまう、いわば保守的な判定）。そこで、Node.js security working groupが
// 公開する機械可読な脆弱性データベース（SECURITY_WG_VULN_DB_URL）を照会し、
// 現在のバージョンが実際にどのCVEの影響を受けるか（vulnerable範囲に該当し、
// かつpatched範囲には該当しない＝未パッチ）を判定結果に含める。vulnerable/patched
// はいずれもnpm semver range記法のため、自前実装ではなくsemverパッケージ
// （satisfies()）に委ねる
//
// 既知の限界: この判定はSECURITY_WG_VULN_DB_URL自体の更新ラグに依存する
// （Node.js公式のセキュリティリリース発表直後は反映されていない可能性がある）。
// 該当するCVEが0件という結果も「安全である」ことの証明ではなく「現時点で
// security-wgのデータベースに未登録」という意味である
const SECURITY_WG_VULN_DB_URL = "https://raw.githubusercontent.com/nodejs/security-wg/main/vuln/core/index.json";

// vulnDatabase: SECURITY_WG_VULN_DB_URLのレスポンス（キーが連番文字列のオブジェクト）。
// versionが対象（vulnerable範囲に該当）かつ未パッチ（patched範囲に該当しない）の
// エントリのみを返す。vulnerable/patchedのいずれかがsemverとして解釈できない
// エントリ（記法の揺れ等）は安全側に倒して対象外とする（誤って「脆弱」と
// 誤検知しないことを優先する。見逃しよりも誤検知の方が人間の確認コストが高いため）
function findUnpatchedVulnerabilities(version, vulnDatabase) {
  const entries = Object.values(vulnDatabase ?? {});
  return entries
    .filter((entry) => {
      if (!entry?.vulnerable) return false;
      if (!semver.validRange(entry.vulnerable)) return false;
      if (!semver.satisfies(version, entry.vulnerable)) return false;
      if (entry.patched && semver.validRange(entry.patched) && semver.satisfies(version, entry.patched)) return false;
      return true;
    })
    .map((entry) => ({ cve: entry.cve ?? [], severity: entry.severity ?? null, overview: entry.overview ?? null }));
}

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
  const vulnDatabase = await fetchJson(SECURITY_WG_VULN_DB_URL, { fetchJsonImpl });

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
        vulnerabilities: findUnpatchedVulnerabilities(current.raw, vulnDatabase),
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
  findUnpatchedVulnerabilities,
  scanRuntimeVersions,
};
