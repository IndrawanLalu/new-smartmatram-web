"use client";

import { Loader2, X } from "lucide-react";
import { km } from "@/app/admin/jtm/_lib/tampilan";
import type { RincianPenyulangPeta } from "../_hooks/useRincianPenyulang";
import { GARIS, JUDUL_BAGIAN, PANEL } from "../_ui";
import { Baris } from "./InfoTiang";
import { HasilInspeksi } from "./RincianSegmen";

/**
 * Kartu "Penyulang ini saja" (12 Okt 2026) — terbuka saat nama penyulang di
 * folder JTM diklik. Bentuknya sama dengan kartu segmen; isinya gabungan semua
 * segmen bertiang penyulang itu.
 */
export default function RincianPenyulang({ p, onTutup }: { p: RincianPenyulangPeta; onTutup: () => void }) {
  const m = p.master;
  return (
    <aside
      className="absolute z-[1100] top-14 right-3 w-[330px] max-w-[calc(100%-1.5rem)] max-h-[calc(100%-4.25rem)] overflow-y-auto rounded-xl border shadow-2xl p-3 space-y-3 text-[#e2e8f0]"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className={JUDUL_BAGIAN}>Penyulang ini saja</p>
          <p className="text-sm font-semibold mt-0.5 break-words">{p.kode}</p>
          <p className="text-[11px] text-gray-400">{p.ulp}</p>
        </div>
        <button onClick={onTutup} className="shrink-0 text-gray-400 hover:text-white" aria-label="Tutup">
          <X size={15} />
        </button>
      </div>

      {p.galat ? (
        <p className="text-xs text-red-300">{p.galat}</p>
      ) : p.memuat || !m ? (
        <p className="text-xs text-gray-400 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Memuat penyulang…
        </p>
      ) : (
        <>
          <div>
            <p className={JUDUL_BAGIAN}>Master penyulang</p>
            <Baris label="Segmen" nilai={`${m.segmen.toLocaleString("id-ID")} segmen bertiang`} />
            <Baris
              label="Panjang"
              nilai={
                <>
                  {km(m.panjangKm, 3)}
                  {m.bentangTanpaTitik > 0 && (
                    <span className="block text-[11px] text-amber-300">
                      {m.bentangTanpaTitik} bentang tanpa titik — panjang sebenarnya lebih dari ini
                    </span>
                  )}
                </>
              }
            />
            <Baris label="Tiang" nilai={`${m.tiang.toLocaleString("id-ID")} tiang · ${m.bentang.toLocaleString("id-ID")} bentang`} />
          </div>

          <div>
            <p className={JUDUL_BAGIAN}>Hasil inspeksi</p>
            {m.segmen > 0 && (
              <Baris label="Segmen dinilai" nilai={`${p.segmenDinilai} dari ${m.segmen} segmen`} />
            )}
            <HasilInspeksi r={p.rekap} label={p.label} kosong="Belum ada hasil inspeksi yang dikirim untuk penyulang ini." />
          </div>
        </>
      )}
    </aside>
  );
}
