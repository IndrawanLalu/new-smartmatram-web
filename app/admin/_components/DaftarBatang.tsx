import type { LucideIcon } from "lucide-react";
import { CARD, PANEL_HEAD } from "@/app/admin/_ui";

/**
 * Rincian per kelompok (ULP, kategori, regu) sebagai batang horizontal —
 * dipakai tab Dashboard modul Kinerja Pelayanan Teknik.
 *
 * HTML biasa, bukan pustaka grafik: empat-enam baris tidak butuh sumbu, dan
 * angka ditulis di ujung batang sehingga warna tidak pernah jadi satu-satunya
 * pembawa informasi. Bagian "menunggu" digambar sebagai segmen amber di dalam
 * batang yang sama, dengan angkanya ditulis juga.
 */

export interface ItemBatang {
  label: string;
  jumlah: number;
  /** Bagian dari `jumlah` yang masih menunggu keputusan admin (opsional). */
  menunggu?: number;
}

interface Props {
  judul: string;
  ikon: LucideIcon;
  item: ItemBatang[];
  satuan: string;
  kosong?: string;
}

export default function DaftarBatang({ judul, ikon: Ikon, item, satuan, kosong = "Belum ada data" }: Props) {
  const maks = Math.max(1, ...item.map((i) => i.jumlah));
  const adaMenunggu = item.some((i) => (i.menunggu ?? 0) > 0);

  return (
    <div className={`${CARD} flex flex-col h-full`}>
      <div className={PANEL_HEAD}>
        <Ikon size={14} className="text-white/80" />
        <span className="text-white font-semibold text-xs">{judul}</span>
      </div>
      <div className="p-4 flex flex-col gap-3">
        {item.length === 0 ? (
          <p className="text-xs text-ink-muted">{kosong}</p>
        ) : (
          item.map((i) => (
            <div key={i.label}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold text-ink truncate">{i.label}</span>
                <span className="text-ink-soft tabular-nums shrink-0">
                  {i.jumlah.toLocaleString("id-ID")} {satuan}
                  {(i.menunggu ?? 0) > 0 && <span className="text-amber-700"> · {i.menunggu} menunggu</span>}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-surface overflow-hidden flex">
                <div className="h-full bg-navy-500" style={{ width: `${((i.jumlah - (i.menunggu ?? 0)) / maks) * 100}%` }} />
                <div className="h-full bg-amber-400" style={{ width: `${((i.menunggu ?? 0) / maks) * 100}%` }} />
              </div>
            </div>
          ))
        )}
        {adaMenunggu && (
          <div className="flex items-center gap-3 text-[10px] text-ink-muted pt-1">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-navy-500" /> diverifikasi</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> menunggu</span>
          </div>
        )}
      </div>
    </div>
  );
}
