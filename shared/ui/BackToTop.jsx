// 独立ビルドの複数ページで構成されたサイトにおいて、各ページ（トップページ以外）に
// 他ページへ戻る手段を提供する。トップページのパスとラベルはpropsで受け取る
export default function BackToTop({ href = "/", label = "← トップに戻る" }) {
  return (
    <div className="container pt-3" style={{ maxWidth: "42rem" }}>
      <a href={href} className="link-secondary link-underline-opacity-0 link-underline-opacity-100-hover small">
        {label}
      </a>
    </div>
  );
}
