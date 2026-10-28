"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ToastType = "info" | "success" | "error" | "warn";
type Toast = { id: number; msg: string; type: ToastType; out?: boolean };
let toastId = 0;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((msg: string, type: ToastType = "info", ms = 3800) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, out: true } : x))), ms);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms + 320);
  }, []);

  const toastView = (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}${t.out ? " out" : ""}`} role={t.type === "error" ? "alert" : "status"}>
          {t.msg}
        </div>
      ))}
    </div>
  );
  return { toast, toastView };
}

type Ask = { msg: string; title?: string; okText?: string; danger?: boolean; resolve: (ok: boolean) => void };

export function useConfirm() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!ask || !d) return;
    d.showModal();
    // On a destructive question, start on «إلغاء» so Enter doesn't confirm by accident.
    d.querySelector<HTMLButtonElement>(ask.danger ? "[data-cancel]" : "[data-ok]")?.focus();
  }, [ask]);

  const confirm = useCallback(
    (msg: string, opts: Omit<Ask, "msg" | "resolve"> = {}) =>
      new Promise<boolean>((resolve) => setAsk({ msg, ...opts, resolve })),
    [],
  );

  const answer = (ok: boolean) => {
    ref.current?.close();
    ask?.resolve(ok);
    setAsk(null);
  };

  const confirmView = (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        answer(false);
      }}
    >
      {ask && (
        <>
          <div className="dlg-body">
            <h3>{ask.title ?? "تأكيد"}</h3>
            <p>{ask.msg}</p>
          </div>
          <div className="dlg-actions">
            <button type="button" data-ok className={`btn ${ask.danger ? "btn-danger" : "btn-primary"}`} onClick={() => answer(true)}>
              {ask.okText ?? "تأكيد"}
            </button>
            <button type="button" data-cancel className="btn btn-outline" onClick={() => answer(false)}>
              إلغاء
            </button>
          </div>
        </>
      )}
    </dialog>
  );
  return { confirm, confirmView };
}
