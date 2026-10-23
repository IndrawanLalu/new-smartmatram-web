"use client";

import { Loader2, Scissors, TriangleAlert, X } from "lucide-react";
import { km } from "@/app/admin/jtm/_lib/tampilan";
import { WARNA_POTONGAN, type PecahSegmen } from "../_hooks/usePecahSegmen";
import { GARIS, INPUT, JUDUL_BAGIAN, PANEL } from "../_ui";

/**
 * Panel Pecah segmen (X3): titik potong diklik di peta, nama tiap potongan
 * diketik di sini. Potongan pertama tetap segmen lama — riwayat inspeksi &
 * WO-nya tidak berpindah.
 */
export default function PanelPecah({ p, onSelesai }: { p: PecahSegmen; onSelesai: () => void }) {
  const h = p.hasil;
  const usulBaru = h ? h.usul_potong.filter((x) => !p.potong.includes(x)).length : 0;
  const bisa = !!h && h.galat.length === 0 && !p.memuat && !p.menyimpan;

  const terapkan = async () => {
    if (await p.terapkan()) onSelesai();
  };

  return (
    <aside
      className="absolute z-[1100] top-14 right-3 w-[340px] max-w-[calc(100%-1.5rem)] max-h-[calc(100%-4.25rem)] overflow-y-auto rounded-xl border shadow-2xl p-3 space-y-3 text-[#e2e8f0]"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <div className="flex items-start gap-2">
        <Scissors size={16} className="mt-1 text-[#4DB6AC] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className={JUDUL_BAGIAN}>Pecah segmen</p>
          <p className="text-sm font-semibold break-words">{p.segmen?.nama}</p>
        </div>
        <button onClick={p.batal} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5" aria-label="Tutup">
          <X size={16} />
        </button>
      </div>

      <p className="text-xs text-gray-400">
        Klik tiang di peta untuk memotong di sana; klik lagi untuk membatalkan. Tiang potong menjadi ujung potongan
        sebelumnya sekaligus pangkal potongan sesudahnya.
      </p>
      {usulBaru > 0 && (
        <button
          onClick={p.pakaiUsulan}
          className="w-full rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200 hover:bg-amber-400/20"
        >
          Potong di keypoint yang dilewati ({usulBaru})
        </button>
      )}

      {!h ? (
        <p className="text-xs text-gray-400 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Menghitung…</p>
      ) : (
        <ul className="space-y-2">
          {h.bagian.map((b, i) => (
            <li key={b.akar_id} className="rounded-lg border p-2 space-y-1.5" style={{ borderColor: GARIS }}>
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: WARNA_POTONGAN[i % WARNA_POTONGAN.length] }} />
                <span className="flex-1 min-w-0 truncate">
                  {b.asal ? "Segmen lama" : `Mulai ${b.akar_kode}`} · {b.jumlah_tiang} tiang · {km(b.panjang_km, 3)}
                  {b.section.length > 0 && ` · ${b.section.join(" + ")}`}
                </span>
                {!b.asal && (
                  <button onClick={() => p.lepas(b.akar_id)} className="text-gray-500 hover:text-white" aria-label="Batalkan potongan">
                    <X size={13} />
                  </button>
                )}
              </div>
              <input
                className={INPUT}
                value={p.nama[b.asal ? "asal" : b.akar_id] ?? b.nama_usul}
                onChange={(e) => p.aturNama(b.asal ? "asal" : b.akar_id, e.target.value)}
                placeholder={b.nama_usul}
              />
            </li>
          ))}
        </ul>
      )}

      {h && h.galat.length > 0 && (
        <ul className="space-y-1 text-[11px] text-amber-300">
          {h.galat.map((g) => (
            <li key={g} className="flex gap-1.5"><TriangleAlert size={12} className="mt-0.5 shrink-0" /> {g}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <button onClick={p.batal} className="flex-1 rounded-lg border px-3 py-2 text-xs text-gray-300 hover:bg-white/5" style={{ borderColor: GARIS }}>
          Batal
        </button>
        <button
          onClick={() => void terapkan()}
          disabled={!bisa}
          className="flex-1 rounded-lg bg-linear-to-r from-[#004D40] to-[#00897B] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {p.menyimpan ? "Menyimpan…" : p.memuat ? "Memeriksa…" : "Terapkan"}
        </button>
      </div>
    </aside>
  );
}
