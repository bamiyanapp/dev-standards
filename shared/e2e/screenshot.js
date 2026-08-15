import fs from 'node:fs';
import path from 'node:path';

// スクリーンショットの保存先（bamiyanapp/karuta#568）。testInfo.attach()による
// Playwright HTMLレポートへの添付だけでは、特にスマホ版GitHubアプリから
// アーティファクトzipをダウンロード・展開する手段が事実上無く閲覧しづらいため、
// CI側（reusable-ci.yml）がこのディレクトリのPNGを別ブランチへ公開し、Job Summary・
// PRコメントへraw.githubusercontent.comのURLとして埋め込めるようにする。
//
// process.cwd()基準（import.meta.urlベースの__dirnameではない）なのは、この
// ファイル自体をsymlinkで参照側リポジトリへ共有する構成（bamiyanapp/dev-standards#209）
// のため。ESMのimport.meta.urlはsymlink越しでもこのファイルの実体パス
// （dev-standards/shared/e2e/screenshot.js）に解決されてしまい、__dirnameベースでは
// 参照側リポジトリの<frontend_dir>/e2e-screenshotsを指せない。Playwrightの
// テスト実行は常に<frontend_dir>をカレントディレクトリとして行われるため、
// process.cwd()基準であればsymlink越しでも正しく解決できる。
export const SCREENSHOT_DIR = path.resolve(process.cwd(), 'e2e-screenshots');

// ページのスクリーンショットを撮影し、(1) 既存のPlaywright HTMLレポートへの
// 添付、(2) CI側が公開できるようSCREENSHOT_DIRへのファイル書き出し、の両方を行う。
// nameはファイル名（URLの一部になるためASCII安全な識別子を渡すこと）、
// captionはPRコメント・Job Summaryの見出しに使われる説明文（bamiyanapp/karuta#601）。
// captionを省略した場合はCI側（dev-standards）がnameをそのまま見出しとして使う。
// fullPage: falseを指定すると、エントリの増加でページが際限なく長くなっていく
// 画面（更新履歴画面等）でビューポート内（画面上部）だけを撮影できる
// （bamiyanapp/karuta#795）。
export async function captureScreenshot(page, testInfo, name, caption, { fullPage = true } = {}) {
  const body = await page.screenshot({ fullPage });
  await testInfo.attach(name, { body, contentType: 'image/png' });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, `${name}.png`), body);
  if (caption) {
    fs.writeFileSync(path.join(SCREENSHOT_DIR, `${name}.caption.txt`), caption, 'utf-8');
  }
  // bamiyanapp/karuta#628: PRの変更と無関係なスクリーンショットをCI側
  // （reusable-ci.yml）で折りたたむため、どのスペックファイルが撮影したかを
  // 記録する。testInfo.fileはPlaywrightが自動的に持つ絶対パスなのでスペック側の
  // 追加対応は不要。CI側はこれとspec-source-map.jsonの宣言、PRの変更ファイル
  // 一覧を突き合わせて関連の有無を判定する
  fs.writeFileSync(path.join(SCREENSHOT_DIR, `${name}.spec.txt`), path.basename(testInfo.file), 'utf-8');
  // bamiyanapp/karuta#651: スペックファイル単位のグループ化では、同じファイル内の
  // 複数の無関係なシナリオが一括りにされ折りたたみ単位として粗いため、テストケース名
  // （testInfo.title）も記録する。CI側はこれがあればスペックファイル単位ではなく
  // テストケース単位でグループ化する
  fs.writeFileSync(path.join(SCREENSHOT_DIR, `${name}.title.txt`), testInfo.title, 'utf-8');
}
