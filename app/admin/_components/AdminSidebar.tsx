"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { NAV_GROUPS } from "@/app/admin/_nav";

// ── Types ────────────────────────────────────────────────────────────────────

/** Identitas user pindah ke UserMenu di topbar — sidebar hanya perlu unit
 *  untuk subjudul logo. */
interface AdminSidebarProps {
  userUnit: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Item aktif = blok navy penuh. Item lain tetap tinta penuh + bobot 500 —
 *  bobot 400 di 14px membuat teks terlihat buram di layar biasa. */
const ITEM_BASE =
  "group flex items-center gap-2.5 rounded-xl text-sm font-medium transition-colors";
const ITEM_ON = "bg-navy-600 text-white font-semibold shadow-sm";
/** Hover putih, bukan navy-50: di atas bidang sidebar yang bertinta, navy-50
 *  nyaris tak terbaca — putih memberi kenaikan terang yang jelas. */
const ITEM_OFF = "text-ink hover:bg-white hover:text-navy-600";

/** Stroke 2px (bawaan lucide) terlalu berat di samping teks 14px/500 —
 *  1,75 menyeimbangkan bobot ikon dengan bobot huruf. */
const ICON_STROKE = 1.75;

/** Ikon selangkah lebih ringan dari labelnya supaya teks yang memimpin,
 *  bukan rel ikon yang jadi pita gelap. Saat aktif ikut putih. */
const iconCls = (active: boolean) =>
  `shrink-0 ${active ? "" : "text-ink-soft group-hover:text-navy-600"}`;

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminSidebar({ userUnit }: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Grup yang terbuka — default semua terbuka kecuali Tools
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    analitik: true,
    monitoring: true,
    operasional: true,
    manajemen: true,
    tools: false,
  });

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <aside
      className={`shrink-0 bg-sidebar h-screen sticky top-0 flex flex-col transition-all duration-300 border-r border-sidebar-line ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo — tingginya DIIKAT ke var yang sama dengan topbar supaya garis
          bawah keduanya menyambung jadi satu garis lurus. Jangan diganti padding
          lagi: begitu keduanya dihitung terpisah, tingginya pasti melenceng. */}
      <div className="h-[var(--topbar-h)] shrink-0 px-3 flex items-center justify-between gap-2 border-b border-sidebar-line">
        <div className="flex items-center gap-2.5 overflow-hidden">
          {/* Lencana-S dipakai polos tanpa kotak: bentuk heksagonnya sudah
              bertinta navy sendiri, ditumpuk di atas kotak navy-600 keduanya
              saling menelan. Ukuran 40px mengimbangi ~18% ruang kosong di
              kiri-kanan isi PNG-nya. */}
          <Image
            src="/smarbg.png"
            alt=""
            width={40}
            height={40}
            className="w-10 h-10 shrink-0 object-contain"
            priority
          />
          {!collapsed && (
            <div className="whitespace-nowrap min-w-0">
              <p className="font-display font-extrabold text-[13px] leading-tight text-ink tracking-tight">
                SMART Mataram
              </p>
              <p className="text-[11px] text-ink-muted truncate">
                {userUnit ? `PLN ULP ${userUnit}` : "PLN UP3 Mataram"}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Lebarkan sidebar" : "Ringkas sidebar"}
          className="w-6 h-6 grid place-items-center rounded-lg text-ink-muted hover:text-ink hover:bg-white transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-3">
        {NAV_GROUPS.map((group, gi) => {
          const isOpen = openGroups[group.key] ?? true;
          const hasActive = group.items.some((it) => pathname === it.href);

          if (collapsed) {
            return (
              <div key={group.key} className="space-y-1">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={label}
                      className={`${ITEM_BASE} justify-center h-10 ${active ? ITEM_ON : ITEM_OFF}`}
                    >
                      <Icon size={18} strokeWidth={ICON_STROKE} className={iconCls(active)} />
                    </Link>
                  );
                })}
                <div className="mx-2 border-t border-sidebar-line" />
              </div>
            );
          }

          return (
            <div key={group.key} className={gi > 0 ? "pt-3 border-t border-sidebar-line" : ""}>
              {/* Label bagian — kecil tapi tegas: kontras dinaikkan, bukan sekadar bold */}
              <button
                onClick={() => toggleGroup(group.key)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.09em] transition-colors ${
                  hasActive ? "text-navy-600" : "text-ink hover:text-navy-600"
                }`}
              >
                <span>{group.label}</span>
                <ChevronDown
                  size={13}
                  className={`shrink-0 text-ink-soft transition-transform duration-200 ${
                    isOpen ? "rotate-0" : "-rotate-90"
                  }`}
                />
              </button>

              {isOpen && (
                <div className="mt-1 space-y-0.5">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`${ITEM_BASE} px-2.5 py-2 ${active ? ITEM_ON : ITEM_OFF}`}
                      >
                        <Icon size={16} strokeWidth={ICON_STROKE} className={iconCls(active)} />
                        <span className="truncate">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
