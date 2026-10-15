"use client";

import { useState } from "react";
import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { NAV_GROUPS, itemUntuk } from "@/app/admin/_nav";
import { IKON_STROKE } from "@/lib/ikonUi";

/**
 * Sidebar UI baru (rencana-ui-baru.md §2A): bidang navy gelap, teks putih/80
 * (8:1), judul grup putih/45 kecil kapital, item aktif pil navy terang
 * (brand-600). Isi menu tetap dari `_nav.ts` — satu sumber nama halaman.
 */

const ITEM = "group relative flex items-center gap-3 rounded-xl text-[13.5px] font-medium transition-colors";
const ITEM_ON = "bg-brand-600 text-white shadow-[0_6px_16px_-6px_rgba(47,85,176,0.8)]";
const ITEM_OFF = "text-white/80 hover:bg-white/[0.07] hover:text-white";

function TandaMuat({ ringkas }: { ringkas?: boolean }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return ringkas ? (
    <Loader2 size={12} className="absolute top-1 right-1 animate-spin text-white" aria-label="Memuat" />
  ) : (
    <Loader2 size={14} className="ml-auto shrink-0 animate-spin text-white/70" aria-label="Memuat" />
  );
}

export default function SidebarGelap({ userUnit }: { userUnit: string | null }) {
  // Alamat di bawah item menu (/admin/work-order/123) tetap menyalakan itemnya.
  const href = itemUntuk(usePathname())?.item.href;
  const [ringkas, setRingkas] = useState(false);
  const [tutup, setTutup] = useState<Record<string, boolean>>({ tools: true });

  return (
    <aside className={`shrink-0 h-screen sticky top-0 flex flex-col bg-navy-950 text-white transition-all duration-300 ${ringkas ? "w-[68px]" : "w-[248px]"}`}>
      <div className="h-[var(--topbar-h)] shrink-0 px-3.5 flex items-center justify-between gap-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <Image src="/smarbg.png" alt="" width={40} height={40} className="w-10 h-10 shrink-0 object-contain" priority />
          {!ringkas && (
            <div className="whitespace-nowrap min-w-0">
              <p className="font-display font-extrabold text-[15px] leading-tight tracking-tight">SMART Mataram</p>
              <p className="text-[10.5px] text-white/55 uppercase tracking-wide truncate">
                {userUnit ? `PLN ULP ${userUnit}` : "PLN UP3 Mataram"}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={() => setRingkas((v) => !v)}
          aria-label={ringkas ? "Lebarkan menu" : "Ringkas menu"}
          className="w-7 h-7 grid place-items-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 shrink-0"
        >
          {ringkas ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 [scrollbar-width:thin]">
        {NAV_GROUPS.map((g) => {
          const buka = !tutup[g.key];
          return (
            <div key={g.key}>
              {!ringkas && (
                <button
                  onClick={() => setTutup((t) => ({ ...t, [g.key]: buka }))}
                  className="w-full flex items-center justify-between px-3 pb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/45 hover:text-white/70"
                >
                  {g.label}
                  <ChevronDown size={13} className={`transition-transform ${buka ? "" : "-rotate-90"}`} />
                </button>
              )}
              {(buka || ringkas) && (
                <div className="space-y-0.5">
                  {g.items.map(({ href: h, label, icon: Ikon }) => {
                    const on = href === h;
                    return (
                      <Link
                        key={h}
                        href={h}
                        title={ringkas ? label : undefined}
                        className={`${ITEM} ${ringkas ? "justify-center h-10" : "px-3 py-2.5"} ${on ? ITEM_ON : ITEM_OFF}`}
                      >
                        <Ikon size={18} strokeWidth={IKON_STROKE} className={on ? "" : "text-white/60 group-hover:text-white"} />
                        {!ringkas && <span className="truncate">{label}</span>}
                        <TandaMuat ringkas={ringkas} />
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
