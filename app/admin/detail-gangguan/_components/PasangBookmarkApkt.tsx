"use client";

import { useState } from "react";
import { Bookmark, Copy, Check } from "lucide-react";
import { EYEBROW } from "@/app/admin/_ui";
import { APKT_BOOKMARKLET } from "./apktBookmarklet";

// React 19 memblokir href "javascript:" lewat props → dipasang langsung ke DOM.
const pasangHref = (el: HTMLAnchorElement | null) => el?.setAttribute("href", APKT_BOOKMARKLET);

export default function PasangBookmarkApkt() {
  const [tersalin, setTersalin] = useState(false);

  async function salinKode() {
    try {
      await navigator.clipboard.writeText(APKT_BOOKMARKLET);
      setTersalin(true);
    } catch { /* abaikan */ }
  }

  return (
    <div className="pt-3 border-t border-line space-y-2">
      <p className={EYEBROW}>Bookmark pengisi APKT (pasang sekali)</p>
      <div className="flex flex-wrap items-center gap-2">
        <a ref={pasangHref} onClick={(e) => e.preventDefault()} draggable
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-dashed border-navy-300 bg-navy-50 text-navy-700 text-xs font-semibold cursor-grab">
          <Bookmark size={13} /> Isi APKT dari Smart
        </a>
        <span className="text-xs text-ink-soft">← seret ke bilah bookmark browser</span>
        <button onClick={salinKode} className="ml-auto inline-flex items-center gap-1 text-xs text-ink-soft hover:text-navy-600">
          {tersalin ? <Check size={12} /> : <Copy size={12} />} {tersalin ? "Kode tersalin" : "Salin kode (pasang manual)"}
        </button>
      </div>
      <ol className="text-xs text-ink-soft list-decimal pl-4 space-y-0.5">
        <li>Di modal Koreksi, klik <b>Salin untuk APKT</b>.</li>
        <li>Di APKT halaman koreksi, klik bookmark → No Laporan terisi di kotak cari &amp; dicari.</li>
        <li>Setelah data laporan tampil, klik bookmark lagi → kolom waktu terisi (Nyala Sementara dilewati bila di APKT kosong).</li>
        <li>Periksa, lalu tekan Simpan di APKT.</li>
      </ol>
    </div>
  );
}
