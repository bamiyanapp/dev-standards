import { useEffect, useState } from "react";

// Service Worker導入後、PWAとしてホーム画面に追加した状態では新しいバージョンに
// 切り替わったことに気づきにくく、キャッシュされた古い画面が表示され続けている
// ように見えてしまい、ホーム画面からの削除・再追加が必要になりがちだった。
// ページ読み込み時点で既にService Workerの制御下にあった場合のみ（＝初回
// インストールではなく既存バージョンからの切り替わりの場合のみ）controllerchange
// イベントを「更新」とみなし、再読み込みを促すバナーを表示する。入力中のフォーム等を
// 妨げないよう、自動的な強制リロードはしない。詳細な経緯・キャッシュ戦略の全体像は
// docs/service-worker-update-pattern.mdを参照。
//
// クラス名はBootstrap 5.3向け（docs/standard-tech-stack.mdの標準構成、issue #289）。
// daisyUI構成のプロダクト（examination等）はこのファイルをsymlink共有せず、個別コピーで
// daisyUIのクラス名に置き換えて管理する（docs/service-worker-update-pattern.md参照）
export default function UpdateNotifier() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);

    function handleControllerChange() {
      if (hadControllerAtLoad) {
        setUpdateAvailable(true);
      }
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="position-fixed bottom-0 start-50 translate-middle-x mb-3" style={{ zIndex: 1080 }}>
      <div className="alert alert-info d-flex align-items-center gap-2 shadow mb-0" role="alert">
        <span>新しいバージョンがあります</span>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>
          更新する
        </button>
      </div>
    </div>
  );
}
