#!/usr/bin/env node
"use strict";

// site/apps.json（単一ソース）から、ハブページ（dist/index.html）・アプリごとの
// リダイレクトページ（dist/go/<id>/index.html）・README.mdの「参照側アプリ一覧」
// セクションを生成する（bamiyanapp/dev-standards issue #636）。
//
// README.mdとの二重管理を避けるため、レンダリング関数はCLI実行（本ファイルの
// main()）だけでなく、リポジトリルートのscripts/check-apps-sync.test.jsからも
// requireされ、「apps.jsonから今生成される内容」と「実際にコミットされている
// README.mdの内容」が一致しているかをCIで検証する。

const fs = require("fs");
const path = require("path");

const siteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(siteRoot, "..");

const README_START_MARKER = "<!-- apps-table:start -->";
const README_END_MARKER = "<!-- apps-table:end -->";

function loadApps(appsJsonPath = path.join(siteRoot, "apps.json")) {
  const data = JSON.parse(fs.readFileSync(appsJsonPath, "utf-8"));
  return data.apps;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// URLのプロトコル+ホスト部分だけを短く表示するための整形（README表・ハブページ共通）
function shortenUrl(url) {
  const { host, pathname } = new URL(url);
  return pathname === "/" ? host : `${host}${pathname}`;
}

function renderIndexHtml(apps) {
  const items = apps
    .map((app) => {
      const lock = app.loginRequired ? '<span class="lock" title="ログインが必要です">🔒</span> ' : "";
      const shortUrl = escapeHtml(shortenUrl(app.url));
      const goPath = `go/${app.id}/`;
      return `
      <li class="app-card">
        <a class="app-link" href="${escapeHtml(app.url)}">
          <span class="app-name">${lock}${escapeHtml(app.name)}</span>
          <span class="app-description">${escapeHtml(app.description)}</span>
        </a>
        <div class="app-meta">
          <span class="app-url">${shortUrl}</span>
          <span class="app-shortcut">ショートカット: <code>${escapeHtml(goPath)}</code></span>
          <a class="app-repo" href="${escapeHtml(app.repoUrl)}">GitHub</a>
        </div>
      </li>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dev-standards アプリ一覧</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif;
    max-width: 640px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    line-height: 1.6;
  }
  h1 { font-size: 1.4rem; }
  ul { list-style: none; padding: 0; margin: 1.5rem 0 0; }
  .app-card {
    border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .app-link { display: block; text-decoration: none; color: inherit; }
  .app-name { display: block; font-weight: bold; font-size: 1.1rem; }
  .app-description { display: block; font-size: 0.9rem; opacity: 0.75; margin-top: 0.15rem; }
  .app-meta {
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px dashed color-mix(in srgb, currentColor 20%, transparent);
    font-size: 0.8rem;
    opacity: 0.75;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
  }
  .app-repo { color: inherit; }
  code { font-size: 0.85em; }
  .lock { font-size: 0.9em; }
  footer { margin-top: 2rem; font-size: 0.8rem; opacity: 0.6; }
</style>
</head>
<body>
  <h1>参照側アプリ一覧</h1>
  <p>dev-standardsを参照している各アプリへのリンク集です。🔒はログインが必要なアプリです。</p>
  <ul>
${items}
  </ul>
  <footer>
    <p>このページは<code>site/apps.json</code>から自動生成されています（<a href="https://github.com/bamiyanapp/dev-standards">bamiyanapp/dev-standards</a>）。</p>
  </footer>
</body>
</html>
`;
}

function renderRedirectHtml(app) {
  const url = escapeHtml(app.url);
  const name = escapeHtml(app.name);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=${url}">
<title>${name}へ移動します</title>
<script>location.replace(${JSON.stringify(app.url)});</script>
</head>
<body>
  <p>${name}へ移動しています。自動的に移動しない場合は<a href="${url}">こちらをクリック</a>してください。</p>
</body>
</html>
`;
}

// README.md「参照側アプリ一覧」のマーカー間へ差し込む本体（表＋注記）
function renderReadmeAppsSection(apps) {
  const header = "| アプリ名 | アプリのリンク | Gitプロジェクトのリンク |\n|---|---|---|";
  const rows = apps.map((app) => {
    const lock = app.loginRequired ? "🔒 " : "";
    const nameCell = app.description ? `${app.name}（${app.description}）` : app.name;
    const linkCell = `${lock}[${shortenUrl(app.url)}](${app.url})`;
    const repoLabel = app.repoUrl.replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
    const repoCell = `[${repoLabel}](${app.repoUrl})`;
    return `| ${nameCell} | ${linkCell} | ${repoCell} |`;
  });
  const table = [header, ...rows].join("\n");

  const notes = apps
    .filter((app) => app.note)
    .map((app) => `- **${app.name}**: ${app.note}`)
    .join("\n");

  const hubNote = "ハブページ（[bamiyanapp.github.io/dev-standards](https://bamiyanapp.github.io/dev-standards/)）からも同じ一覧・各アプリへのリダイレクト用ショートカット（`/go/<id>/`）にアクセスできる。";

  return notes ? `${table}\n\n${notes}\n\n${hubNote}` : `${table}\n\n${hubNote}`;
}

function replaceReadmeSection(readmeContent, apps) {
  const startIndex = readmeContent.indexOf(README_START_MARKER);
  const endIndex = readmeContent.indexOf(README_END_MARKER);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(
      `README.mdに${README_START_MARKER}〜${README_END_MARKER}のマーカーが見つかりません`
    );
  }
  const before = readmeContent.slice(0, startIndex + README_START_MARKER.length);
  const after = readmeContent.slice(endIndex);
  const section = renderReadmeAppsSection(apps);
  return `${before}\n${section}\n${after}`;
}

function main() {
  const apps = loadApps();
  const distDir = path.join(siteRoot, "dist");

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "index.html"), renderIndexHtml(apps));

  for (const app of apps) {
    const goDir = path.join(distDir, "go", app.id);
    fs.mkdirSync(goDir, { recursive: true });
    fs.writeFileSync(path.join(goDir, "index.html"), renderRedirectHtml(app));
  }

  const readmePath = path.join(repoRoot, "README.md");
  const readmeContent = fs.readFileSync(readmePath, "utf-8");
  fs.writeFileSync(readmePath, replaceReadmeSection(readmeContent, apps));

  console.log(`site/dist/ とREADME.mdを${apps.length}件のアプリ情報で生成しました`);
}

if (require.main === module) {
  main();
}

module.exports = {
  loadApps,
  renderIndexHtml,
  renderRedirectHtml,
  renderReadmeAppsSection,
  replaceReadmeSection,
  shortenUrl,
  README_START_MARKER,
  README_END_MARKER,
};
