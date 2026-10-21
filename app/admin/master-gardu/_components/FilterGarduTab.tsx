"use client";

import { useMemo, useState } from "react";
import { Download, ListFilter, Loader2 } from "lucide-react";
import { BTN_GHOST, CARD } from "@/app/admin/_ui";
import { useAcuanKondisi } from "../_hooks/useKondisiHargardu";
import { useFilterGardu } from "../_hooks/useFilterGardu";
import { kunciKondisi as kunciHar } from "../_lib/kondisiGardu";
import { cocok, judulKondisi, kondisiTerisi, nilaiTampil, uraianKondisi, type Kondisi } from "../_lib/filterGardu";
import { buatBerkasEksporMaster, type BarisEksporMaster } from "../_lib/garduMaster";
import SusunKondisi from "./SusunKondisi";
import TabelFilterGardu from "./TabelFilterGardu";

interface Props {
  ulp: string;
}

/**
 * Tab Filter gardu: susun beberapa kondisi sekaligus (mis. jenis cut out
 * keramik DAN jenis arrester keramik), lihat gardunya beserta koordinat dan
 * nilai yang disaring, lalu unduh Excel format master + kolom kondisi.
 */
export default function FilterGarduTab({ ulp }: Props) {
  const [kondisi, setKondisi] = useState<Kondisi[]>([]);
  const acuan = useAcuanKondisi(true, true);
  const { gardu, har, nilaiHar, memuat, memuatItem, galat } = useFilterGardu(ulp, kondisi, true);
  const [mengunduh, setMengunduh] = useState(false);

  const namaItem = (kode: string) => acuan.item.find((i) => i.kode === kode)?.nama ?? kode;
  const aktif = useMemo(() => kondisi.filter(kondisiTerisi), [kondisi]);

  const hasil = useMemo(
    () => (aktif.length ? gardu.filter((g) => aktif.every((k) => cocok(g, kunciHar(g.kode, g.ulp), k, nilaiHar))) : []),
    [gardu, aktif, nilaiHar],
  );

  async function unduh() {
    setMengunduh(true);
    try {
      const teks = (g: (typeof hasil)[number], k: Kondisi) => nilaiTampil(g, kunciHar(g.kode, g.ulp), k, nilaiHar).map((p) => p.teks).join(", ");
      const rows: BarisEksporMaster[] = hasil.map((g) => ({
        kode: g.kode, ulp: g.ulp, daya: g.kva_master, nama: g.nama, alamat: g.alamat, feeder: g.penyulang,
        merk: g.merk, status: g.status, kode_amg: g.kode_amg, lat: g.lat, lng: g.lng,
        tgl_ukur_terakhir: g.event_date, persen_beban: g.persen_beban,
        ekstra: [har.get(kunciHar(g.kode, g.ulp))?.tgl?.slice(0, 10) ?? "", ...aktif.map((k) => teks(g, k))],
      }));
      const labelOpsi = (item: string, kode: string) =>
        acuan.item.find((i) => i.kode === item)?.opsi.find((o) => o.kode === kode)?.label ?? kode;
      const blob = await buatBerkasEksporMaster(rows, {
        kolom: ["HAR_TERAKHIR", ...aktif.map((k) => judulKondisi(k, namaItem).toUpperCase())],
        kriteria: [
          ["ULP", ulp || "Semua ULP"],
          ["Diunduh", new Date().toLocaleString("id-ID")],
          ["Jumlah gardu", String(hasil.length)],
          ["Aturan", "Semua kondisi harus terpenuhi; pilihan di dalam satu kondisi = salah satu"],
          ...aktif.map((k): [string, string] => [judulKondisi(k, namaItem), uraianKondisi(k, labelOpsi)]),
        ],
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `filter-gardu-${(ulp || "semua-ulp").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setMengunduh(false);
    }
  }

  const sibuk = memuat || memuatItem || acuan.memuat;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-center gap-2">
          <ListFilter size={15} className="text-accent-deep" />
          <span className="text-sm font-semibold text-ink">Kondisi</span>
          {sibuk && <Loader2 size={13} className="animate-spin text-ink-muted" />}
          {kondisi.length > 0 && (
            <button onClick={() => setKondisi([])} className="ml-auto text-xs text-ink-soft hover:text-red-600">Hapus semua</button>
          )}
        </div>
        <SusunKondisi kondisi={kondisi} onUbah={setKondisi} item={acuan.item} gardu={gardu} />
        <p className="text-[11px] text-ink-muted leading-relaxed">
          Gardu harus memenuhi <b>semua</b> kondisi. Di dalam satu kondisi cukup <b>salah satu</b> pilihan; untuk item per
          fasa/jurusan cukup satu bagian yang cocok. Kondisi pemeliharaan diambil dari pemeliharaan <b>terverifikasi
          terakhir</b> — gardu yang belum pernah dipelihara hanya muncul lewat <b>Belum diperiksa</b>.
        </p>
      </div>

      {(galat || acuan.galat) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{galat ?? acuan.galat}</div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-ink-soft">
          {aktif.length ? `${hasil.length.toLocaleString("id-ID")} dari ${gardu.length.toLocaleString("id-ID")} gardu` : "Belum ada kondisi"}
        </span>
        <button onClick={unduh} disabled={mengunduh || sibuk || !hasil.length} className={`${BTN_GHOST} ml-auto`}>
          {mengunduh ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Unduh Excel
        </button>
      </div>

      <TabelFilterGardu
        hasil={hasil} kondisi={aktif} har={har} nilaiHar={nilaiHar} namaItem={namaItem}
        memuat={sibuk} adaKondisi={aktif.length > 0}
      />
    </div>
  );
}
