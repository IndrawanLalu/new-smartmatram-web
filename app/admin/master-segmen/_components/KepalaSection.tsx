import { TriangleAlert } from "lucide-react";
import type { KelompokPenyulang, KelompokSection } from "../_lib/kelompokSection";

/**
 * Baris kepala tampilan Per section (X4): satu untuk penyulang, satu per
 * section — sekaligus rekap section-nya. Panjang & tiang section diambil dari
 * hasil susun section (seluruh pohon tiangnya), bukan jumlah segmen yang
 * tampil; jadi tiang yang belum masuk segmen tetap terhitung dan ditunjukkan.
 */

const KOLOM = 7;

export function KepalaPenyulang({ p }: { p: KelompokPenyulang }) {
  const segmen = p.bagian.reduce((n, b) => n + b.baris.length, 0);
  const section = p.bagian.filter((b) => b.rekap).length;
  return (
    <tr className="bg-[#E0F2F1] border-b border-line">
      <td colSpan={KOLOM} className="px-3 py-2 text-[#00695C]">
        <span className="font-semibold">{p.penyulang}</span>
        <span className="ml-2 text-xs">
          {p.ulp} · {section} section · {segmen} segmen
        </span>
      </td>
    </tr>
  );
}

export function KepalaSectionBaris({ k }: { k: KelompokSection }) {
  const belumInspeksi = k.baris.filter((b) => !b.terakhir_inspeksi).length;
  if (!k.rekap) {
    return (
      <tr className="border-b border-line bg-slate-50">
        <td colSpan={KOLOM} className="px-3 py-1.5 pl-6 text-xs text-ink-soft">
          <span className="font-semibold text-ink-muted">Belum dititik</span>
          <span className="ml-2">
            {k.baris.length} segmen belum punya tiang, jadi belum masuk section mana pun
          </span>
        </td>
      </tr>
    );
  }
  const r = k.rekap;
  return (
    <tr className="border-b border-line bg-surface">
      <td colSpan={KOLOM} className="px-3 py-1.5 pl-6 text-xs text-ink-soft">
        <span className="font-semibold text-ink">{r.nama}</span>
        <span className="ml-2 tabular-nums">
          {k.baris.length} segmen · {r.panjang_km.toFixed(2)} km · {r.jumlah_tiang} tiang
        </span>
        {r.tiang_tanpa_segmen > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
            <TriangleAlert size={11} /> {r.tiang_tanpa_segmen} tiang belum masuk segmen
          </span>
        )}
        {belumInspeksi > 0 && <span className="ml-2 text-amber-700">{belumInspeksi} belum pernah diinspeksi</span>}
        {k.baris.length === 0 && <span className="ml-2 text-ink-muted">belum ada segmen</span>}
      </td>
    </tr>
  );
}
