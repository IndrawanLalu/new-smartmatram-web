"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type Tone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: Tone;
  text: string;
}

export interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
}

const TONE: Record<Tone, { icon: typeof Info; cls: string; bar: string }> = {
  success: { icon: CheckCircle2, cls: "text-green-600", bar: "bg-green-500" },
  error:   { icon: AlertCircle,  cls: "text-red-600",   bar: "bg-red-500" },
  info:    { icon: Info,         cls: "text-[#00897B]", bar: "bg-[#00897B]" },
};

const DURATION: Record<Tone, number> = { success: 3200, info: 3800, error: 6000 };

const ToastContext = createContext<ToastApi | null>(null);

/** Notifikasi ringan pojok kanan bawah. Dipasang sekali di AdminLayout. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: Tone, text: string) => {
      const id = ++seq.current;
      setItems((prev) => [...prev.slice(-3), { id, tone, text }]);
      setTimeout(() => dismiss(id), DURATION[tone]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t) => push("success", t),
      error: (t) => push("error", t),
      info: (t) => push("info", t),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        // Di atas modal (2000): sebagian pesan justru lahir dari tindakan di dalam
        // modal, dan pesan yang tertimbun sama saja dengan tidak ada.
        className="fixed bottom-5 right-5 z-[2100] flex flex-col gap-2 w-[min(22rem,calc(100vw-2.5rem))]"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => {
          const cfg = TONE[t.tone];
          const Icon = cfg.icon;
          return (
            <div
              key={t.id}
              className="animate-slide-up flex items-start gap-2.5 rounded-xl border border-[#E2E8F0] bg-white/95 backdrop-blur px-3.5 py-3 shadow-lg shadow-black/10 overflow-hidden relative"
            >
              <span className={`absolute left-0 inset-y-0 w-1 ${cfg.bar}`} />
              <Icon size={17} className={`${cfg.cls} shrink-0 mt-0.5`} />
              <p className="flex-1 text-[13px] leading-snug text-[#1B2631]">{t.text}</p>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Tutup notifikasi"
                className="text-gray-400 hover:text-gray-600 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Notifikasi hasil aksi.
 *
 * @example
 * const toast = useToast();
 * toast.error("Gagal menyimpan — perubahan dikembalikan.");
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam AdminLayout");
  return ctx;
}
