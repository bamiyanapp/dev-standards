"use strict";

// PR差分で追加された行に、実在のメールアドレスらしき文字列が含まれていないかを検知する
// （issue #1364）。通知先のメールアドレスを`${{ vars.X || '実アドレス' }}`の形で
// フォールバックとして直書きする事例があり、gitleaksでは検知できないため。
// 検知対象は追加行（`+`で始まる行）のみで、既存の履歴は対象にしない。
//
// 使い方: git diff --unified=0 <base>...<head> | node scripts/detect-hardcoded-email.js [許可リストのファイル]
// 許可リストのファイル（任意）は、1行に1つ、完全一致のアドレスまたは`@ドメイン`形式を書く。
// 検知があれば、ファイル名・行番号・マスクしたアドレスを標準出力へ出し、終了コード1で終わる。
// アドレスそのものは出力しない（ログへ個人情報を残さないため）。

const fs = require("node:fs");

// 最後のラベル（TLD）は英字2文字以上にする。`reusable-ci.yml@v2.149.1`のような
// workflowのバージョン指定（最後のラベルが数字）を、メールアドレスと誤検知しないため（#1491）
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![A-Za-z0-9-])/g;

// 文書用・bot用など、実在の個人を指さないアドレス・ドメイン
const BUILTIN_ALLOWED_DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "example.jp",
  "users.noreply.github.com",
  "noreply.github.com",
  "anthropic.com",
  "localhost",
];
const BUILTIN_ALLOWED_LOCALS = ["noreply", "no-reply", "donotreply"];

function parseAllowlist(text) {
  const entries = { addresses: new Set(), domains: new Set() };
  for (const raw of (text || "").split("\n")) {
    const line = raw.trim().toLowerCase();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("@")) entries.domains.add(line.slice(1));
    else entries.addresses.add(line);
  }
  return entries;
}

function isAllowed(address, allow) {
  const lower = address.toLowerCase();
  const at = lower.lastIndexOf("@");
  const local = lower.slice(0, at);
  const domain = lower.slice(at + 1);
  if (allow.addresses.has(lower) || allow.domains.has(domain)) return true;
  if (BUILTIN_ALLOWED_LOCALS.includes(local)) return true;
  // 画像ファイル名の「@2x.png」等は、ローカル部が空か、ドメインが拡張子になるため除く
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(domain)) return true;
  return BUILTIN_ALLOWED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function mask(address) {
  const at = address.lastIndexOf("@");
  return `${address[0]}***${address.slice(at)}`;
}

// unifiedDiff: `git diff --unified=0`の出力。戻り値: [{ file, line, masked }]
function detect(unifiedDiff, allow = parseAllowlist("")) {
  const findings = [];
  let file = null;
  let line = 0;
  for (const text of unifiedDiff.split("\n")) {
    if (text.startsWith("+++ ")) {
      file = text.slice(4).replace(/^b\//, "");
      continue;
    }
    if (text.startsWith("--- ")) continue;
    const hunk = text.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (!text.startsWith("+")) continue;
    for (const address of text.slice(1).match(EMAIL) || []) {
      if (!isAllowed(address, allow)) findings.push({ file, line, masked: mask(address) });
    }
    line++;
  }
  return findings;
}

function main() {
  const allowFile = process.argv[2];
  const allow = parseAllowlist(allowFile && fs.existsSync(allowFile) ? fs.readFileSync(allowFile, "utf8") : "");
  const findings = detect(fs.readFileSync(0, "utf8"), allow);
  if (findings.length === 0) {
    console.log("メールアドレスの直書きは検知されませんでした。");
    return;
  }
  console.log(`メールアドレスらしき文字列が${findings.length}件、追加行に含まれています。`);
  for (const f of findings) console.log(`- ${f.file}:${f.line} ${f.masked}`);
  console.log("値をRepository Variable・Secretへ移し、未設定時は明示的に失敗させてください。");
  console.log("意図的に残す場合は、許可リスト（.email-allowlist）へ追記してください。");
  process.exit(1);
}

if (require.main === module) main();

module.exports = { detect, parseAllowlist, isAllowed };
