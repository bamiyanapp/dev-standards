// textareaを入力内容に応じて高さ可変にする（examination#165）。一度高さをautoへ
// 戻してからscrollHeightを測ることで、入力により行数が減った場合にも正しく縮む。
// refコールバック（マウント時・編集フォームを開いた直後など、既存の複数行の内容が
// 最初から入っている場合）としても、onInputハンドラ（入力のたびの再計算）としても
// 同じ関数をそのまま使える。呼び出し側は`resize-none overflow-hidden`のtextareaへ
// `ref={resizeTextareaToFitContent}` `onInput={(e) => resizeTextareaToFitContent(e.target)}`
// を指定する
export default function resizeTextareaToFitContent(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
