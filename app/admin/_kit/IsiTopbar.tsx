"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSlot } from "./SlotKerangka";

/**
 * Saringan halaman di TOPBAR (keputusan user 14 Okt 2026 — di kepala halaman
 * saringan menutupi banner). Isinya ikut berganti saat pindah halaman/tab.
 *
 * Layar < 1280 px: topbar tidak cukup lebar, jadi isinya dirender di tempat
 * komponen ini dipasang (di bawah kepala halaman). Render server memakai
 * tempat itu juga — tidak ada salah-cocok hidrasi.
 */

const MEDIA = "(min-width: 1280px)";

function langganan(fn: () => void) {
  const m = window.matchMedia(MEDIA);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
}

export default function IsiTopbar({ children }: { children: ReactNode }) {
  const { topbar } = useSlot();
  const lebar = useSyncExternalStore(langganan, () => window.matchMedia(MEDIA).matches, () => false);
  if (!lebar) return <div className="flex flex-wrap items-center gap-2">{children}</div>;
  return topbar ? createPortal(children, topbar) : null;
}
