"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { hariIniWita } from "../_lib/realisasiHarian";
import {
  NAMA_MODUL_TINDAKAN, SUMBER_JTM2_TITIK, susunMatriks,
  type BarisLm, type ItemLm, type Kategori, type Laporan, type Tindakan,
} from "../_lib/lm4dx";

/**
 * Data halaman Realisasi Harian LM: daftar baris (`lm4dx_baris`) per laporan
 * (4DX / Penurunan Susut), kategori Pemeliharaan Jaringan, dan
 * `realisasi_rentang` sebulan — hanya yang SUDAH DISETUJUI (5 Nov 2026; dulu
 * Copy to LM 4DX di Rekap Kinerja ikut menghitung yang belum disetujui).
 * Kode kategori tiap catatan Pemeliharaan Jaringan dibaca lewat `sumber_id`.
 */

const POTONG = 200;

/** Id inspeksi JTM yang Tier 1 + drone (jtm-tier1-drone.sql). */
async function ambilDrone(id: string[]) {
  const ada = new Set<string>();
  for (let i = 0; i < id.length; i += POTONG) {
    const { data, error } = await supabaseBrowser
      .from("inspeksi_jtm")
      .select("id")
      .in("id", id.slice(i, i + POTONG))
      .eq("drone", true);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) ada.add(String(r.id));
  }
  return ada;
}

async function ambilKodeKategori(id: string[]) {
  const peta = new Map<string, string>();
  for (let i = 0; i < id.length; i += POTONG) {
    const { data, error } = await supabaseBrowser
      .from("pemeliharaan_jaringan_daftar")
      .select("id,kategori")
      .in("id", id.slice(i, i + POTONG));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (r.kategori) peta.set(String(r.id), r.kategori);
  }
  return peta;
}

/** Jumlah tiang yang dinilai per inspeksi JTM. */
async function ambilJumlahTitik(id: string[]) {
  const n = new Map<string, number>();
  for (let i = 0; i < id.length; i += POTONG) {
    const rows = await fetchAllRows<{ inspeksi_id: string }>(() =>
      supabaseBrowser
        .from("inspeksi_jtm_titik")
        .select("id,inspeksi_id")
        .in("inspeksi_id", id.slice(i, i + POTONG))
        .order("id"),
    );
    for (const r of rows) n.set(String(r.inspeksi_id), (n.get(String(r.inspeksi_id)) ?? 0) + 1);
  }
  return n;
}

/** Modul tindakan ↔ sumber di realisasi_rentang. */
const MODUL_SUMBER: Record<string, Tindakan["modul"]> = {
  pemeliharaan_gardu: "hargardu",
  penyeimbangan_gardu: "penyeimbangan",
};
type PetaTindakan = Map<string, Record<string, { jumlah: number; foto: string }>>;

/** Tindakan yang dicentang regu, per `modul|sumber_id`. */
async function ambilTindakan(kunci: { modul: string; id: string }[]): Promise<PetaTindakan> {
  const peta: PetaTindakan = new Map();
  for (const modul of new Set(kunci.map((k) => k.modul))) {
    const id = kunci.filter((k) => k.modul === modul).map((k) => k.id);
    for (let i = 0; i < id.length; i += POTONG) {
      const rows = await fetchAllRows<{ sumber_id: string; tindakan_kode: string; jumlah: number; foto_url: string }>(() =>
        supabaseBrowser
          .from("pekerjaan_tindakan")
          .select("sumber_id,tindakan_kode,jumlah,foto_url")
          .eq("modul", modul)
          .in("sumber_id", id.slice(i, i + POTONG))
          .order("sumber_id")
          .order("tindakan_kode"),
      );
      for (const r of rows) {
        const k = `${modul}|${r.sumber_id}`;
        peta.set(k, { ...(peta.get(k) ?? {}), [r.tindakan_kode]: { jumlah: r.jumlah, foto: r.foto_url } });
      }
    }
  }
  return peta;
}

const akhirBulan = (bulan: string) => {
  const [y, m] = bulan.split("-").map(Number);
  return `${bulan}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

export function useLm4dx(ulpAwal: string, laporan: Laporan) {
  const [ulp, gantiUlp] = useState(ulpAwal);
  const [bulan, gantiBulan] = useState(() => hariIniWita().slice(0, 7));
  const [baris, setBaris] = useState<BarisLm[]>([]);
  const [kategori, setKategori] = useState<Kategori[]>([]);
  const [item, setItem] = useState<ItemLm[]>([]);
  const [tindakan, setTindakan] = useState<Tindakan[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    (async () => {
      try {
        const [rows, daftar, kat, tdk] = await Promise.all([
          fetchAllRows<Record<string, unknown>>(() =>
            supabaseBrowser
              .rpc("realisasi_rentang", { p_ulp: ulp, p_dari: `${bulan}-01`, p_sampai: akhirBulan(bulan) })
              .order("tgl")
              .order("sumber")
              .order("sumber_id"),
          ),
          // Daftar baris per ULP (lm-baris-per-ulp.sql); "Semua ULP" = ulp NULL.
          (ulp === "SEMUA"
            ? supabaseBrowser.from("lm4dx_baris").select("id,urutan,uraian,sumber,kelompok").eq("laporan", laporan).is("ulp", null)
            : supabaseBrowser.from("lm4dx_baris").select("id,urutan,uraian,sumber,kelompok").eq("laporan", laporan).eq("ulp", ulp)
          ).order("urutan"),
          supabaseBrowser.from("pemeliharaan_jaringan_ref").select("kode,label").order("urutan"),
          supabaseBrowser.from("tindakan_ref").select("kode,modul,nama,satuan,urutan,aktif").order("modul").order("urutan").order("kode"),
        ]);
        if (daftar.error) throw new Error(`Daftar baris LM 4DX gagal dibaca: ${daftar.error.message}`);
        if (kat.error) throw new Error(kat.error.message);
        if (tdk.error) throw new Error(`Daftar pekerjaan yang dikerjakan gagal dibaca: ${tdk.error.message}`);
        // Tegangan ujung bukan realisasi pengukuran (sama dengan Rekap Kinerja).
        const pakai = rows.filter((r) => r.bagian !== "ujung" && r.disetujui === true);
        const barisLm = daftar.data as BarisLm[];
        const idHarjtm = pakai.filter((r) => r.kunci === "harjtm" && r.sumber_id).map((r) => String(r.sumber_id));
        const idJtm = pakai.filter((r) => r.kunci === "jtm" && r.sumber_id).map((r) => String(r.sumber_id));
        // Jumlah tiang Tier 2 hanya dibaca bila ada baris yang memakainya.
        const idTier2 = barisLm.some((b) => b.sumber.includes(SUMBER_JTM2_TITIK))
          ? pakai.filter((r) => r.kunci === "jtm2" && r.sumber === "inspeksi_jtm" && r.sumber_id).map((r) => String(r.sumber_id))
          : [];
        // Tindakan hanya dibaca bila ada baris yang memakainya.
        const kunciTdk = barisLm.some((b) => b.sumber.some((x) => x.startsWith("tindakan:")))
          ? pakai.filter((r) => MODUL_SUMBER[String(r.sumber)] && r.sumber_id)
              .map((r) => ({ modul: MODUL_SUMBER[String(r.sumber)], id: String(r.sumber_id) }))
          : [];
        const [kodeKat, drone, titik, tdkPer] = await Promise.all([
          ambilKodeKategori(idHarjtm), ambilDrone(idJtm), ambilJumlahTitik(idTier2), ambilTindakan(kunciTdk),
        ]);
        if (!hidup) return;
        setItem(pakai.map((r) => ({
          tgl: r.tgl as string,
          kunci: r.kunci as string,
          km: r.km === null || r.km === undefined ? null : Number(r.km),
          kategori: r.sumber_id ? kodeKat.get(String(r.sumber_id)) ?? null : null,
          drone: drone.has(String(r.sumber_id)),
          // Baris JTM realisasi_rentang: rincian = penyulang.
          penyulang: r.kunci === "jtm" ? ((r.rincian as string | null) ?? null) : null,
          titik: titik.get(String(r.sumber_id)) ?? 0,
          tindakan: tdkPer.get(`${MODUL_SUMBER[String(r.sumber)]}|${r.sumber_id}`) ?? {},
          ulp: String(r.ulp ?? ""),
          objek: (r.objek as string | null) ?? null,
          rincian: (r.rincian as string | null) ?? null,
          petugas: (r.petugas as string | null) ?? null,
          sumberTabel: String(r.sumber ?? ""),
          sumberId: r.sumber_id ? String(r.sumber_id) : null,
          disetujui: r.disetujui === true,
        })));
        setBaris(barisLm);
        setKategori(kat.data as Kategori[]);
        setTindakan(tdk.data as Tindakan[]);
        setGalat(null);
      } catch (e) {
        if (!hidup) return;
        setItem([]);
        setGalat(e instanceof Error ? e.message : String(e));
      }
      if (hidup) setLoading(false);
    })();
    return () => { hidup = false; };
  }, [ulp, bulan, nonce, laporan]);

  const mulai = () => { setLoading(true); setGalat(null); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setBulan = (b: string) => { if (b) { mulai(); gantiBulan(b); } };

  const matriks = useMemo(() => susunMatriks(baris, item), [baris, item]);
  const namaKategori = useMemo(() => new Map(kategori.map((k) => [k.kode, k.label])), [kategori]);
  const namaTindakan = useMemo(
    () => new Map(tindakan.map((t) => [t.kode, `${NAMA_MODUL_TINDAKAN[t.modul]} · ${t.nama}`])),
    [tindakan],
  );

  return {
    ulp, setUlp, bulan, setBulan, baris, kategori, namaKategori, tindakan, namaTindakan,
    item, matriks, loading, galat, muat,
  };
}
