"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canSeeAllUnits, UNITS, type CurrentUser } from "@/lib/roles";
import type { Peristiwa } from "@/lib/prediksiGangguan/peristiwa";
import type { BarisTemuan } from "@/lib/prediksiGangguan/temuan";
import type { Kalibrasi, Rapor } from "@/app/api/prediksi-lokasi/route";

export type BarisGangguan = Peristiwa & { temuan: BarisTemuan | null };
export type SaringTemuan = "SEMUA" | "BELUM" | "SUDAH";

interface Jawaban { peristiwa: BarisGangguan[]; kalibrasi: Kalibrasi[]; rapor: Rapor; bolehIsi: boolean; error?: string }

const akhirBulan = (t: number, b: number) => new Date(t, b, 0).getDate();
const dua = (n: number) => String(n).padStart(2, "0");

/** Daftar gangguan (sheet + WA) per periode, dengan lokasi temuannya. Bawaan bulan berjalan. */
export function usePrediksiLokasi(user: CurrentUser) {
  const sekarang = new Date();
  const tahunIni = sekarang.getFullYear();
  const bolehSemua = canSeeAllUnits(user.role);
  const [ulp, gantiUlp] = useState(bolehSemua ? "SEMUA" : user.unit ?? "");
  const [tahun, gantiTahun] = useState(tahunIni);
  const [bulan, gantiBulan] = useState(sekarang.getMonth() + 1);
  const [saring, setSaring] = useState<SaringTemuan>("SEMUA");
  const [cari, setCari] = useState("");
  const [data, setData] = useState<Jawaban | null>(null);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const daftarUlp = useMemo(() => (bolehSemua ? ["SEMUA", ...UNITS.map((u) => u.value)] : [user.unit ?? ""]), [bolehSemua, user.unit]);
  const daftarTahun = useMemo(() => [tahunIni, tahunIni - 1, tahunIni - 2, tahunIni - 3, tahunIni - 4], [tahunIni]);

  const mulai = () => { setLoading(true); setGalat(null); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setTahun = (t: number) => { mulai(); gantiTahun(t); };
  const setBulan = (b: number) => { mulai(); gantiBulan(b); };
  const muatUlang = useCallback(() => { mulai(); setNonce((n) => n + 1); }, []);

  useEffect(() => {
    const ctl = new AbortController();
    const dari = `${tahun}-${dua(bulan || 1)}-01`;
    const sampai = `${tahun}-${dua(bulan || 12)}-${dua(akhirBulan(tahun, bulan || 12))}`;
    fetch(`/api/prediksi-lokasi?dari=${dari}&sampai=${sampai}&ulp=${encodeURIComponent(ulp)}`, { signal: ctl.signal })
      .then(async (r) => {
        const j = (await r.json()) as Jawaban;
        if (!r.ok || j.error) throw new Error(j.error ?? `server menjawab ${r.status}`);
        setData(j);
      })
      .catch((e: Error) => { if (e.name !== "AbortError") setGalat(e.message); })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
  }, [ulp, tahun, bulan, nonce]);

  const semua = useMemo(() => data?.peristiwa ?? [], [data]);
  const hitung = useMemo(() => ({
    SEMUA: semua.length,
    BELUM: semua.filter((p) => !p.temuan).length,
    SUDAH: semua.filter((p) => p.temuan).length,
  }), [semua]);
  const baris = useMemo(() => {
    const q = cari.trim().toUpperCase();
    return semua.filter((p) =>
      (saring === "SEMUA" || (saring === "SUDAH") === !!p.temuan) &&
      (!q || `${p.penyulang} ${p.keypoint ?? ""} ${p.temuan?.tiang_kode ?? ""}`.toUpperCase().includes(q)));
  }, [semua, saring, cari]);

  /** Tambal satu baris setelah lokasi temuan disimpan/dihapus, lalu segarkan diam-diam:
   *  kalibrasi & rapor ikut berubah oleh temuan baru. */
  const tambalTemuan = useCallback((kunci: string, temuan: BarisTemuan | null) => {
    setData((d) => d && { ...d, peristiwa: d.peristiwa.map((p) => (p.kunci === kunci ? { ...p, temuan } : p)) });
    setNonce((n) => n + 1);
  }, []);

  return {
    ulp, setUlp, daftarUlp, tahun, setTahun, bulan, setBulan, daftarTahun, saring, setSaring, cari, setCari,
    semua, baris, hitung, loading, galat, muatUlang, tambalTemuan,
    kalibrasi: data?.kalibrasi ?? [], rapor: data?.rapor ?? null, bolehIsi: data?.bolehIsi ?? false,
  };
}
