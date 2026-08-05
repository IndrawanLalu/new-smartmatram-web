"use client";

import { usePathname } from "next/navigation";
import { DISPLAY } from "@/app/admin/_ui";
import { findNavItem } from "@/app/admin/_nav";

/**
 * Judul halaman di sisi kiri topbar.
 *
 * Halaman tidak lagi perlu memasang blok header sendiri — itu memakan tinggi
 * yang mahal di layar laptop, padahal sisi kiri topbar selama ini kosong.
 * Namanya diambil dari `_nav.ts`, sumber yang sama dengan sidebar, jadi label
 * di rel navigasi dan di judul tidak mungkin berbeda.
 */
export default function PageTitle() {
  const pathname = usePathname();
  const item = findNavItem(pathname);
  if (!item) return null;

  const Icon = item.icon;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon size={16} strokeWidth={1.75} className="text-navy-600 shrink-0" />
      <h1 className={`${DISPLAY} text-[15px] font-bold text-ink truncate`}>{item.label}</h1>
    </div>
  );
}
