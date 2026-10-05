"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TriangleAlert, X } from "lucide-react";
import { EYEBROW } from "@/app/admin/_ui";
import { fotoKecil } from "@/lib/fotoKecil";
import { muatFotoTambahanJtr } from "@/lib/fotoTambahan";
import type { Temuan } from "../_hooks/useApprovalJtr";

/**
 * Temuan satu inspeksi JTR di modal persetujuan, dengan foto buktinya.
 * Foto dibuka besar DI DALAM modal (permintaan user 1 Okt 2026) — bukan tab
 * baru: admin memutuskan sambil membandingkan, dan berpindah tab memutus itu.
 */
export default function DaftarTemuanJtr({ temuan }: { temuan: Temuan[] }) {
  const [besar, setBesar] = useState<{ t: Temuan; url: string } | null>(null);
  // Foto tambahan (paling banyak 2) — tidak dibawa view temuan, dicari dari tiangnya.
  const [tambahan, setTambahan] = useState<Map<string, string[]>>(new Map());
  useEffect(() => {
    let batal = false;
    void muatFotoTambahanJtr(temuan.filter((t) => t.foto_url).map((t) => t.tiang_id)).then((m) => !batal && setTambahan(m));
    return () => {
      batal = true;
    };
  }, [temuan]);

  // Esc menutup FOTO saja, bukan modal di belakangnya: ditangkap lebih dulu
  // (fase capture) dan tidak diteruskan ke pendengar Esc milik ModalShell.
  useEffect(() => {
    if (!besar) return;
    const tutup = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setBesar(null);
    };
    window.addEventListener("keydown", tutup, true);
    return () => window.removeEventListener("keydown", tutup, true);
  }, [besar]);

  if (temuan.length === 0) return null;

  return (
    <div>
      <p className={EYEBROW}>Temuan pada inspeksi ini</p>
      <ul className="mt-2 grid sm:grid-cols-2 gap-1.5">
        {temuan.map((t, i) => (
          <li key={`${t.tiang_kode}-${t.temuan}-${i}`} className="flex items-center gap-2 text-sm rounded-lg border border-line px-3 py-1.5">
            <TriangleAlert size={14} className={`shrink-0 ${t.urgensi === "Tinggi" ? "text-red-600" : "text-attention"}`} />
            <span className="font-semibold text-ink">{t.tiang_kode}</span>
            <span className="text-ink-soft truncate flex-1">{t.temuan}</span>
            {[t.foto_url, ...(t.foto_url ? (tambahan.get(t.foto_url) ?? []) : [])]
              .filter((u): u is string => !!u)
              .map((url, n) => (
                <button key={url} onClick={() => setBesar({ t, url })} className="shrink-0" title={n === 0 ? "Lihat foto" : `Lihat foto ${n + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fotoKecil(url, 120)}
                    alt={`Foto temuan ${t.tiang_kode}${n ? ` (${n + 1})` : ""}`}
                    width={48}
                    height={36}
                    loading="lazy"
                    decoding="async"
                    className="w-12 h-9 object-cover rounded border border-line hover:opacity-80"
                  />
                </button>
              ))}
          </li>
        ))}
      </ul>

      {/* Lewat portal ke <body>: di dalam modal, `fixed` bisa terkurung
          bingkai modal. Klik dihentikan di sini — kejadian React tetap
          merambat ke induk portal, dan latar ModalShell akan ikut menutup. */}
      {besar && createPortal(
        <div
          className="fixed inset-0 z-[2100] bg-black/85 flex flex-col items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            setBesar(null);
          }}
          role="dialog"
          aria-label={`Foto temuan ${besar.t.tiang_kode}`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setBesar(null);
            }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Tutup foto"
          >
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={besar.url}
            alt={`Foto temuan ${besar.t.tiang_kode}`}
            className="max-h-[85vh] max-w-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="mt-3 text-sm text-white">
            <b>{besar.t.tiang_kode}</b> — {besar.t.temuan}
          </p>
        </div>,
        document.body,
      )}
    </div>
  );
}
