import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

// 現在のページ（既定ではwindow.location.href）をQRコードで表示し、URLをワンタップ
// コピーできるボタン＋モーダル。スマートフォンオンリーの利用環境で、家族間・
// チーム間の画面共有にQRコードの読み取りが最も簡便であることを想定している。
//
// 利用側は依存として`qrcode.react`をpackage.jsonへ追加する必要がある
// （dev-standards側では強制できない）。
//
// label: トリガーボタン・モーダル見出しの文言
// className: トリガーボタンへ追加するクラス名（メニュー項目等、埋め込み先の見た目に合わせる）
// getUrl: 共有するURLを返す関数（既定はwindow.location.href）
export default function ShareButton({ label = "このページを共有", className = "", getUrl = () => window.location.href }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const backdropRef = useRef(null);

  // 背景のクリックで閉じる。JSXのonClickを付けると、キーボード操作の無い静的要素への
  // クリックとして、jsx-a11yの警告になる。ConfirmDialogと同じく、addEventListenerで受ける
  // （dev-standards#1490・#1541）。閉じる操作は、閉じるボタン（キーボード操作可）でも行える
  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop) return undefined;
    const close = () => setOpen(false);
    backdrop.addEventListener("click", close);
    return () => backdrop.removeEventListener("click", close);
  }, [open]);

  function openShare() {
    setCopied(false);
    setShareUrl(getUrl());
    setOpen(true);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // クリップボードAPIが使えない環境では、URLのテキスト選択・手動コピーで代替する
    }
  }

  return (
    <>
      <button type="button" onClick={openShare} className={className}>
        {label}
      </button>

      {open && (
        <>
          {/* BootstrapのモーダルのCSSに合わせた構造のため、<dialog>要素へは置き換えない
              （既定のスタイル・フォーカスの扱いが変わる）。role="dialog"は意図した指定 */}
          {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
          <div className="modal d-block show" tabIndex="-1" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h3 className="modal-title h5">{label}</h3>
                  <button type="button" className="btn-close" aria-label="閉じる" onClick={() => setOpen(false)} />
                </div>
                <div className="modal-body">
                  <div className="d-flex justify-content-center mb-3">
                    <QRCodeSVG value={shareUrl} size={200} />
                  </div>
                  <p className="bg-body-secondary rounded p-2 small text-break user-select-all mb-0">{shareUrl}</p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={handleCopy}>
                    {copied ? "コピーしました" : "URLをコピー"}
                  </button>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpen(false)}>
                    閉じる
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div ref={backdropRef} className="modal-backdrop show" />
        </>
      )}
    </>
  );
}
