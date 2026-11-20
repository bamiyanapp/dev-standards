import { useEffect, useRef, useState } from "react";

// 元に戻せない操作（削除・共有リンクの無効化・メンバーの除外等）の実行前に挟む確認ダイアログ。
// window.confirmは、ボタン文言を変えられず、何が起きるかを伝えにくいため使わない。
// ネイティブの<dialog>とshowModal()を使う。フォーカスの閉じ込めとEscキーでのキャンセルは
// ブラウザに任せる（iOS Safari 15.4以降で利用可）。
//
// props:
//   open: 表示するか
//   title: 見出し
//   message: 何が起きるか・元に戻せないことを書く
//   confirmLabel: 実行ボタンの文言。「OK」ではなく動詞にする（例: 「削除する」）
//   cancelLabel: キャンセルボタンの文言（既定: キャンセル）
//   onConfirm: 実行時に呼ぶ。Promiseを返す間は実行ボタンを無効にする（二重送信の防止）
//   onCancel: キャンセル・Escキー・背景クリックで呼ぶ
//   className / confirmClassName / cancelClassName: 見た目の上書き（既定はBootstrap 5.3）
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "実行する",
  cancelLabel = "キャンセル",
  onConfirm,
  onCancel,
  className = "rounded border p-3",
  confirmClassName = "btn btn-danger btn-sm",
  cancelClassName = "btn btn-secondary btn-sm",
}) {
  const ref = useRef(null);
  const cancelRef = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    // 初期フォーカスをキャンセル側に置く（誤タップでの実行を避ける）
    if (open) cancelRef.current?.focus();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // 背景（::backdrop）のクリックは、dialog要素自身へのクリックとして届く。
  // JSXのonClickで受けると、参照側のa11y lint（jsx-a11yのclick-events-have-key-events・
  // no-noninteractive-element-interactions）が違反とする。キーボードの操作は、ネイティブの
  // <dialog>のEscキー（onCancel）で足りる。プラグイン名が参照側で異なる（jsx-a11y・jsx-a11y-x）
  // ため、eslint-disableではなく、addEventListenerで受ける（dev-standards#1490）
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    const handleBackdropClick = (event) => {
      if (event.target === dialog && !busy) onCancel?.();
    };
    dialog.addEventListener("click", handleBackdropClick);
    return () => dialog.removeEventListener("click", handleBackdropClick);
  }, [busy, onCancel]);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby="confirm-dialog-title"
      onCancel={(event) => {
        // Escキーでブラウザが閉じる前に、呼び出し側の状態（open）へ反映させる
        event.preventDefault();
        if (!busy) onCancel?.();
      }}
    >
      {open && (
        <>
          <h2 id="confirm-dialog-title" className="h5">
            {title}
          </h2>
          <p>{message}</p>
          <div className="d-flex justify-content-end gap-2">
            <button type="button" ref={cancelRef} className={cancelClassName} onClick={() => onCancel?.()} disabled={busy}>
              {cancelLabel}
            </button>
            <button type="button" className={confirmClassName} onClick={handleConfirm} disabled={busy}>
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
