import { Component } from "react";

// レンダリング中の未捕捉例外でReactがツリー全体をアンマウントし、画面が真っ白なまま
// 操作不能になる事象への対策（karuta issue #1106由来）。アプリ全体を本コンポーネントで
// 包んでおくと、例外発生時に真っ白画面の代わりに再読み込みボタン付きのフォールバック
// 画面を表示できる。フォールバックのマークアップはBootstrap 5.3のユーティリティ
// クラス（`docs/standard-tech-stack.md`の標準構成）を前提にしている。
//
// `reportUrl`（任意）を指定すると、捕捉した例外情報（message・stack・componentStack・
// 発生ページのURL）をfire-and-forget（`.catch()`で送信失敗を握りつぶす。送信失敗が
// フォールバック画面の表示を妨げてはならないため）でPOSTする。開発環境がスマートフォン
// オンリー等でブラウザのコンソール出力を事後に確認できない場合、送信先で
// `shared/lambda/clientErrorReporting.js`を使ってサーバーサイドのログへ残すことを想定
// している（`docs/client-error-reporting-pattern.md`参照）。`reportUrl`未指定時は
// console.errorとフォールバック画面表示のみ行う。
//
// プレイ内容・入力内容等の個人情報・利用状況の詳細は本コンポーネントが呼び出し側から
// 収集することは無い（収集するのはJavaScriptの例外情報のみ）
//
// `fallbackUrl`（任意）を指定すると、例外検知時に`window.location.reload()`の
// 代わりに自動的にそのURLへ遷移する（karuta issue #1328由来）。A/Bテスト等で
// 複数バリアントを配信している環境で、現在表示中のバリアントに問題がある場合に
// 別バリアントへ明示的に退避させたいケースを想定している。本コンポーネント自体は
// どのバリアント機構にも依存せず、遷移先URLの文字列を受け取るだけの汎用的な
// インターフェースとする。未指定時は従来通り`window.location.reload()`のみを行う
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundaryが例外を捕捉しました:", error, errorInfo);

    if (this.props.reportUrl) {
      fetch(this.props.reportUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: error?.message,
          stack: error?.stack,
          componentStack: errorInfo?.componentStack,
          url: window.location.href,
        }),
      }).catch(() => {
        // 送信自体が失敗しても、フォールバック画面の表示（recover手段の提供）を
        // 妨げてはならないため何もしない
      });
    }

    // 「リロードで戻る」という手動操作をユーザーに求めるのではなく、問題のある
    // バリアントから自動的に離脱させる（karuta issue #1328）。フォールバック画面
    // 自体は描画されるが、通常はこの遷移がそれより先に完了する
    if (this.props.fallbackUrl) {
      window.location.href = this.props.fallbackUrl;
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="d-flex flex-column justify-content-center align-items-center text-center vh-100 p-4">
          <p className="fw-bold mb-3">エラーが発生しました</p>
          <p className="text-muted mb-4">
            画面を再読み込みしてください。繰り返し発生する場合はご報告ください。
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (this.props.fallbackUrl) {
                window.location.href = this.props.fallbackUrl;
              } else {
                window.location.reload();
              }
            }}
          >
            再読み込み
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
