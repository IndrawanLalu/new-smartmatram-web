"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { pratinjauNama, terapkanNama, type BarisNama, type PermintaanNama } from "@/lib/jtmNama";

/**
 * Pratinjau nama tiang JTM sebelum diterapkan — dipakai ketiga pintu (Generate
 * ulang penyulang, Ganti nama hilir ikut, Jadikan jalur utama).
 *
 * Tidak ada yang tertulis sampai Terapkan ditekan. Server menolak kalau jumlah
 * tiang berubah sejak pratinjau (ada titik baru dari lapangan); pratinjau lalu
 * dimuat ulang di sini, supaya admin selalu menerapkan apa yang dilihatnya.
 */

const PER_HALAMAN = 50;

interface Props {
  judul: string;
  subjudul?: string;
  permintaan: PermintaanNama;
  keterangan?: React.ReactNode;
  /** Tombol tambahan di kaki modal, mis. "Hanya tiang ini". */
  aksiLain?: React.ReactNode;
  /** Kalimat bila tak satu nama pun berubah (bawaan: sudah sesuai aturan). */
  kosong?: string;
  oleh: string;
  onTutup: () => void;
  onSelesai: () => void;
}

const jenisCatatan = (c: string | null) =>
  !c ? null : c.startsWith("bentrok") ? "bentrok" : c.startsWith("dianggap") ? "cabang" : "pindah";

const WARNA_CATATAN = {
  bentrok: "text-red-700",
  cabang: "text-amber-700",
  pindah: "text-navy-700",
} as const;

export default function PratinjauNamaModal({
  judul,
  subjudul,
  permintaan,
  keterangan,
  aksiLain,
  kosong = "Tidak ada nama yang berubah — penamaannya sudah sesuai aturan.",
  oleh,
  onTutup,
  onSelesai,
}: Props) {
  const toast = useToast();
  const [baris, setBaris] = useState<BarisNama[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [menerapkan, setMenerapkan] = useState(false);
  const [semua, setSemua] = useState(false);
  const [halaman, setHalaman] = useState(1);

  const muat = useCallback(async () => {
    setBaris(null);
    setGalat(null);
    try {
      setBaris(await pratinjauNama(permintaan));
    } catch (e) {
      setGalat(e instanceof Error ? e.message : String(e));
    }
  }, [permintaan]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const ringkas = useMemo(() => {
    const b = baris ?? [];
    const berubah = b.filter((r) => r.lama.toUpperCase() !== r.baru.toUpperCase());
    const hitung = (j: string) => b.filter((r) => jenisCatatan(r.catatan) === j).length;
    return {
      berubah,
      bentrok: hitung("bentrok"),
      cabang: hitung("cabang"),
      pindah: hitung("pindah"),
      terpanjang: b.reduce((t, r) => (r.baru.length > t.length ? r.baru : t), ""),
    };
  }, [baris]);

  // Urutan server = urutan penelusuran (jalur utama dulu), jadi tidak diurut ulang.
  const daftar = (baris ?? []).filter(
    (r) => semua || r.catatan || r.lama.toUpperCase() !== r.baru.toUpperCase(),
  );
  const halamanMaks = Math.max(1, Math.ceil(daftar.length / PER_HALAMAN));
  const kini = Math.min(halaman, halamanMaks);

  const terapkan = async () => {
    if (!baris) return;
    setMenerapkan(true);
    setInfo(null);
    try {
      const h = await terapkanNama(permintaan, baris.length, oleh);
      toast.success(`Nama diterapkan — ${h.berubah} tiang berubah, tercatat di audit.`);
      onSelesai();
      onTutup();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.startsWith("Jaringan berubah")) {
        setInfo(m);
        await muat();
      } else {
        setGalat(m);
      }
    } finally {
      setMenerapkan(false);
    }
  };

  const bisaTerapkan = !!baris && ringkas.berubah.length > 0 && ringkas.bentrok === 0 && !galat;

  return (
    <ModalShell
      title={judul}
      subtitle={subjudul}
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST}>
            Batal
          </button>
          {aksiLain}
          <button onClick={terapkan} disabled={!bisaTerapkan || menerapkan} className={BTN_PRIMARY}>
            {menerapkan && <Loader2 size={15} className="animate-spin" />}
            Terapkan{baris ? ` ke ${ringkas.berubah.length} tiang` : ""}
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-3">
        {keterangan}

        {info && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{info}</p>
        )}
        {galat && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {galat}
          </p>
        )}

        {!baris && !galat && (
          <div className="flex items-center justify-center py-10 gap-2 text-ink-soft text-sm">
            <Loader2 size={16} className="animate-spin" /> Menyusun nama…
          </div>
        )}

        {baris && (
          <>
            <p className="text-sm text-ink-soft">
              <b className="text-ink">{baris.length}</b> tiang ditelusuri,{" "}
              <b className="text-ink">{ringkas.berubah.length}</b> berubah nama
              {ringkas.terpanjang && (
                <>
                  {" "}· terpanjang <span className="font-mono text-ink">{ringkas.terpanjang}</span>
                </>
              )}
              .
            </p>

            {ringkas.berubah.length === 0 && ringkas.bentrok === 0 && (
              <p className="text-sm text-ink-soft bg-surface border border-line rounded-lg p-3">
                {kosong}
              </p>
            )}
            {ringkas.bentrok > 0 && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                <b>{ringkas.bentrok} nama bentrok</b> dengan tiang di luar bagian ini (baris merah). Terapkan
                dinonaktifkan — pilih nama awal lain, atau ganti dulu nama tiang yang memakainya.
              </p>
            )}
            {ringkas.cabang > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                {ringkas.cabang} tiang <b>dianggap cabang</b> karena induknya sudah punya lanjutan jalur utama.
                Kalau terbalik, batalkan lalu pakai <b>Jadikan jalur utama</b> pada tiang yang benar.
              </p>
            )}
            {ringkas.pindah > 0 && (
              <p className="text-xs text-navy-700 bg-navy-50 border border-navy-200 rounded-lg p-2.5">
                {ringkas.pindah} tiang <b>pindah induk</b> ke tiang sisipan di antaranya — garis peta ikut dibetulkan.
              </p>
            )}

            <div className="border border-line rounded-lg divide-y divide-line max-h-[45vh] overflow-y-auto">
              {daftar.slice((kini - 1) * PER_HALAMAN, kini * PER_HALAMAN).map((r) => {
                const j = jenisCatatan(r.catatan);
                return (
                  <div key={r.tiangId} className={`px-3 py-1.5 text-xs ${j === "bentrok" ? "bg-red-50" : ""}`}>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-ink-muted truncate">{r.lama || "—"}</span>
                      <ArrowRight size={12} className="text-ink-muted shrink-0" />
                      <span className="font-semibold text-ink">{r.baru}</span>
                    </div>
                    {j && <p className={`text-[11px] mt-0.5 ${WARNA_CATATAN[j]}`}>{r.catatan}</p>}
                  </div>
                );
              })}
              {daftar.length === 0 && <p className="px-3 py-6 text-center text-xs text-ink-muted">Tidak ada baris.</p>}
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="inline-flex items-center gap-1.5 text-ink-soft">
                <input type="checkbox" checked={semua} onChange={(e) => { setSemua(e.target.checked); setHalaman(1); }} />
                Tampilkan juga yang tidak berubah
              </label>
              {halamanMaks > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setHalaman(kini - 1)} disabled={kini === 1} className="font-semibold text-navy-600 disabled:text-ink-muted">
                    Sebelumnya
                  </button>
                  <span className="text-ink-muted tabular-nums">{kini}/{halamanMaks}</span>
                  <button onClick={() => setHalaman(kini + 1)} disabled={kini === halamanMaks} className="font-semibold text-navy-600 disabled:text-ink-muted">
                    Berikutnya
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
