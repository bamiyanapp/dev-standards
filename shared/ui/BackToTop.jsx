// 独立ビルドの複数ページで構成されたサイトにおいて、各ページ（トップページ以外）に
// 他ページへ戻る手段を提供する。トップページのパスとラベルはpropsで受け取る
export default function BackToTop({ href = "/", label = "← トップに戻る" }) {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-3">
      <a href={href} className="link link-hover text-sm text-base-content/70 hover:text-base-content">
        {label}
      </a>
    </div>
  );
}
