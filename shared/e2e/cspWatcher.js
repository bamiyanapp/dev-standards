// CSP違反（Content-Security-Policy違反）を、E2Eの実行中に集める部品（dev-standards#1407 段階2）。
// 開発環境がスマートフォンのみで、ブラウザの開発者ツールで違反を目視できないため、自動検知を必須とする。
// cspFixture.jsが、この部品を使って、違反が1件でもあればテストを失敗させる。
// @playwright/testに依存しない（単体テストできるようにするため）。

// ページ内で実行する。securitypolicyviolationイベントを、Node側の関数（reportName）へ渡す。
// exposeFunctionの関数は、ページ遷移をまたいで残るため、遷移後の違反も拾える
function pageScript(reportName) {
  document.addEventListener('securitypolicyviolation', (event) => {
    window[reportName]({
      directive: event.violatedDirective,
      blocked: event.blockedURI,
      source: event.sourceFile,
      line: event.lineNumber,
      disposition: event.disposition,
    });
  });
}

const REPORT_NAME = '__reportCspViolation';

/**
 * pageへ、CSP違反の監視を仕込む。戻り値のviolationsへ、違反が溜まる。
 * ページを開く前（page.goto の前）に呼ぶこと。
 * 既定では、Report-Onlyの違反（disposition: 'report'）も、集める（本番へ強制する前に、違反を見つけるため）
 */
export async function watchCspViolations(page, { includeReportOnly = true } = {}) {
  const violations = [];
  await page.exposeFunction(REPORT_NAME, (violation) => {
    if (includeReportOnly || violation.disposition !== 'report') violations.push(violation);
  });
  await page.addInitScript(pageScript, REPORT_NAME);
  return violations;
}

/** 違反の一覧を、テストの失敗メッセージ用の文字列にする。違反が無ければ空文字 */
export function formatCspViolations(violations) {
  if (violations.length === 0) return '';
  const lines = violations.map((v) => `- ${v.directive}: ${v.blocked || '(inline)'}${v.source ? ` （${v.source}${v.line ? `:${v.line}` : ''}）` : ''}`);
  return `CSP違反が${violations.length}件ありました。\n${lines.join('\n')}\nCSPを緩める前に、違反しているスクリプト・通信先が必要かを確認してください（docs/security-headers-pattern.md）。`;
}
