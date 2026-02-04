import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

function toastId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((toast) => {
    const id = toastId();
    const duration = Number.isFinite(toast.duration) ? toast.duration : 4000;
    setToasts((prev) => [
      ...prev,
      {
        id,
        title: toast.title || "",
        description: toast.description || "",
        variant: toast.variant || "info",
      },
    ]);
    if (duration > 0) {
      window.setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, [removeToast]);

  const value = useMemo(() => ({ addToast, removeToast }), [addToast, removeToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3">
        {toasts.map((toast) => {
          const tone =
            toast.variant === "success"
              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
              : toast.variant === "error"
              ? "border-rose-500/70 bg-rose-500/10 text-rose-100"
              : toast.variant === "warning"
              ? "border-amber-500/70 bg-amber-500/10 text-amber-100"
              : "border-zinc-700 bg-zinc-900/80 text-zinc-100";

          return (
            <div
              key={toast.id}
              className={`w-[320px] rounded-xl border px-4 py-3 shadow-xl backdrop-blur ${tone}`}
            >
              {toast.title && (
                <div className="text-sm font-semibold leading-snug">{toast.title}</div>
              )}
              {toast.description && (
                <div className="text-xs text-zinc-200/80 mt-1 leading-snug">
                  {toast.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
