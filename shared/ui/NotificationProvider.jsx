import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// alert()の代わりに使う、トースト通知のProviderとhook。alert()はJavaScriptの実行を止め、
// PWA（standalone表示）では見た目も馴染まない。参照側が個別に実装すると、自動消去・
// 重複抑止・アクセシビリティの挙動がばらつくため、共通で配布する。
//
// notify({ type, message })で表示する。typeは"error"・"success"・"info"。
//   - success・info: 4秒で自動的に消える
//   - error: 利用者が閉じるまで残す（画面を見ていない場面で自動消去されると気づけないため）
//   - 同じ文言が既に出ている場合は重ねて出さない（リトライのたびに積み重なるのを防ぐ）
//   - 同時に表示するのは最大3件。超えたら古いものから消す
//   - アクセシビリティ: errorはrole="alert"、それ以外はrole="status"
//
// 「画面の主要な内容が取得できなかった」場合は、トーストではなく、画面内のエラー表示と
// 再試行ボタンを出す（docs/shared-ui-components.md参照）。
//
// props:
//   containerClassName / itemClassName / closeLabel: 見た目・文言の上書き（既定はBootstrap 5.3）

const NotificationContext = createContext(null);

export const AUTO_DISMISS_MS = 4000;
export const MAX_VISIBLE = 3;

const TYPE_CLASS = { error: "alert-danger", success: "alert-success", info: "alert-info" };

export function NotificationProvider({
  children,
  containerClassName = "position-fixed bottom-0 start-50 translate-middle-x mb-3 d-flex flex-column gap-2",
  itemClassName = "alert shadow mb-0 d-flex align-items-center gap-2",
  closeLabel = "閉じる",
}) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    ({ type = "info", message }) => {
      setItems((current) => {
        if (current.some((item) => item.message === message)) return current;
        const id = nextId.current++;
        if (type !== "error") timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
        const next = [...current, { id, type, message }];
        while (next.length > MAX_VISIBLE) {
          const [oldest] = next.splice(0, 1);
          clearTimeout(timers.current.get(oldest.id));
          timers.current.delete(oldest.id);
        }
        return next;
      });
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className={containerClassName} style={{ zIndex: 1090 }}>
        {items.map((item) => (
          <div key={item.id} className={`${itemClassName} ${TYPE_CLASS[item.type] || TYPE_CLASS.info}`} role={item.type === "error" ? "alert" : "status"}>
            <span>{item.message}</span>
            <button type="button" className="btn-close" aria-label={closeLabel} onClick={() => dismiss(item.id)} />
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotify() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifyはNotificationProviderの内側で使ってください");
  return context.notify;
}
