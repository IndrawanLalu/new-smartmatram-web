"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { canSeeAllUnits, UNITS, type CurrentUser } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Inspeksi Gardu Tier 1/2 — daftar kunjungan, detail temuan, dan pemeriksaan
 * admin (scripts/inspeksi-gardu.sql). Diisi dari HP; web memeriksa.
 *
 * Data per ULP + bulan diambil dari server (paginasi penuh, urutan tgl+id
 * unik); tier, status, dan cari disaring di peramban.
 */

export type TierGardu = "1" | "2";
export type StatusTampil = "Menunggu persetujuan" | "Dikembalikan" | "Diverifikasi" | "Dibatalkan";
export const STATUS_TAMPIL: StatusTampil[] = ["Menunggu persetujuan", "Dikembalikan", "Diverifikasi", "Dibatalkan"];
const STATUS_DB: Record<string, StatusTampil> = {
  Selesai: "Menunggu persetujuan",
  Dikembalikan: "Dikembalikan",
  Diverifikasi: "Diverifikasi",
  Dibatalkan: "Dibatalkan",
};

export interface BarisInspeksiGardu {
  id: string;
  garduKode: string;
  garduNama: string | null;
  ulp: string;
  penyulang: string | null;
  tier: TierGardu;
  tgl: string;
  lat: number | null;
  lng: number | null;
  jarakM: number | null;
  fotoGardu: string | null;
  adaTemuan: boolean;
  jumlahTemuan: number;
  prioritas: "Urgent" | "Rawan" | "Biasa" | null;
  statusDb: string;
  status: StatusTampil;
  petugas: string | null;
  catatan: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  dikembalikanAlasan: string | null;
  batalAlasan: string | null;
  woNama: string | null;
  tertahan: boolean;
}

export interface TemuanGardu {
  id: string;
  kategori: string;
  kategoriLabel: string;
  uraian: string;
  prioritas: "Urgent" | "Rawan" | "Biasa";
  foto: string[];
  suhu: number | null;
  suhuPembanding: number | null;
  statusTl: "Terbuka" | "Selesai";
  selesaiOleh: string | null;
  selesaiCatatan: string | null;
}

export interface KategoriIgardu {
  kode: string;
  label: string;
  itemKode: string;
  urutan: number;
  aktif: boolean;
}

const angka = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const teks = (v: unknown) => (v === null || v === undefined ? null : String(v));
const dua = (n: number) => String(n).padStart(2, "0");

/** Batas bulan WITA sebagai timestamptz. bulan 0 = setahun. */
const rentang = (tahun: number, bulan: number) => {
  const awal = bulan === 0 ? `${tahun}-01-01` : `${tahun}-${dua(bulan)}-01`;
  const akhir = bulan === 0 ? `${tahun + 1}-01-01` : bulan === 12 ? `${tahun + 1}-01-01` : `${tahun}-${dua(bulan + 1)}-01`;
  return { awal: `${awal}T00:00:00+08:00`, akhir: `${akhir}T00:00:00+08:00` };
};

const petaBaris = (r: Record<string, unknown>): BarisInspeksiGardu => {
  const statusDb = (r.status as string) ?? "Selesai";
  return {
    id: r.id as string,
    garduKode: (r.gardu_kode as string) ?? "",
    garduNama: teks(r.gardu_nama),
    ulp: (r.ulp as string) ?? "",
    penyulang: teks(r.penyulang),
    tier: r.tier === "2" ? "2" : "1",
    tgl: (r.tgl as string) ?? "",
    lat: angka(r.lat),
    lng: angka(r.lng),
    jarakM: angka(r.jarak_m),
    fotoGardu: teks(r.foto_gardu_url),
    adaTemuan: !!r.ada_temuan,
    jumlahTemuan: Number(r.jumlah_temuan ?? 0),
    prioritas: (r.prioritas_tertinggi as BarisInspeksiGardu["prioritas"]) ?? null,
    statusDb,
    status: STATUS_DB[statusDb] ?? "Menunggu persetujuan",
    petugas: teks(r.petugas_nama),
    catatan: teks(r.catatan),
    verifiedBy: teks(r.verified_by),
    verifiedAt: teks(r.verified_at),
    dikembalikanAlasan: teks(r.dikembalikan_alasan),
    batalAlasan: teks(r.batal_alasan),
    woNama: teks(r.wo_nama),
    tertahan: !!r.tertahan,
  };
};

export function useInspeksiGardu(user: CurrentUser) {
  const bolehSemua = canSeeAllUnits(user.role);
  const sekarang = new Date();
  const tahunIni = sekarang.getFullYear();

  const [semua, setSemua] = useState<BarisInspeksiGardu[]>([]);
  const [kategori, setKategori] = useState<KategoriIgardu[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  // Akun ULP tanpa unit tercatat tidak boleh jatuh ke "semua ULP".
  const [ulp, gantiUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? "-").toUpperCase());
  const [bulan, gantiBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, gantiTahun] = useState(tahunIni);
  const [tier, setTier] = useState<"SEMUA" | TierGardu>("SEMUA");
  const [status, setStatus] = useState<"SEMUA" | StatusTampil>("SEMUA");
  const [cari, setCari] = useState("");
  const [nonce, setNonce] = useState(0);

  const daftarUlp = useMemo(
    () => (bolehSemua ? ["SEMUA", ...UNITS.map((u) => u.value)] : [ulp]),
    [bolehSemua, ulp],
  );
  const daftarTahun = useMemo(() => [tahunIni, tahunIni - 1], [tahunIni]);

  const mulai = () => { setLoading(true); setGalat(null); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setBulan = (b: number) => { mulai(); gantiBulan(b); };
  const setTahun = (t: number) => { mulai(); gantiTahun(t); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };

  const tarik = useCallback(async () => {
    const { awal, akhir } = rentang(tahun, bulan);
    const [dat, ref] = await Promise.all([
      fetchAllRows<Record<string, unknown>>(() => {
        const q = supabaseBrowser.from("inspeksi_gardu_daftar").select("*").gte("tgl", awal).lt("tgl", akhir);
        return (ulp === "SEMUA" ? q : q.eq("ulp", ulp)).order("tgl", { ascending: false }).order("id");
      }).then(
        (data) => ({ data, error: null as string | null }),
        (e: Error) => ({ data: [] as Record<string, unknown>[], error: e.message }),
      ),
      supabaseBrowser.from("igardu_ref").select("kode,label,item_kode,urutan,aktif").order("urutan").order("kode"),
    ]);
    return { dat, ref };
  }, [ulp, bulan, tahun]);

  useEffect(() => {
    let hidup = true;
    tarik().then(({ dat, ref }) => {
      if (!hidup) return;
      setGalat(dat.error ?? ref.error?.message ?? null);
      setSemua(dat.data.map(petaBaris));
      setKategori((ref.data ?? []).map((r) => ({
        kode: r.kode as string,
        label: r.label as string,
        itemKode: r.item_kode as string,
        urutan: Number(r.urutan ?? 100),
        aktif: !!r.aktif,
      })));
      setLoading(false);
    });
    return () => { hidup = false; };
  }, [tarik, nonce]);

  /** Tersaring tier + cari, BELUM status — dasar hitungan chip status. */
  const dasarChip = useMemo(() => {
    const k = cari.trim().toUpperCase();
    return semua.filter(
      (b) =>
        (tier === "SEMUA" || b.tier === tier) &&
        (!k || [b.garduKode, b.garduNama ?? "", b.penyulang ?? "", b.petugas ?? ""].some((v) => v.toUpperCase().includes(k))),
    );
  }, [semua, tier, cari]);
  const baris = useMemo(() => dasarChip.filter((b) => status === "SEMUA" || b.status === status), [dasarChip, status]);
  const hitung = useMemo(() => {
    const h = Object.fromEntries(STATUS_TAMPIL.map((s) => [s, 0])) as Record<StatusTampil, number>;
    for (const b of dasarChip) h[b.status] += 1;
    return h;
  }, [dasarChip]);

  /** Ambil ulang SATU baris lalu tambal di tempat. */
  const segarkanSatu = async (id: string) => {
    const { data } = await supabaseBrowser.from("inspeksi_gardu_daftar").select("*").eq("id", id).maybeSingle();
    if (data) setSemua((p) => p.map((x) => (x.id === id ? petaBaris(data) : x)));
  };

  // Stabil (useCallback): dipakai sebagai dependensi efek di modal detail —
  // fungsi baru tiap render akan memuat ulang temuan tanpa henti.
  const temuanDari = useCallback(async (id: string): Promise<TemuanGardu[]> => {
    const { data, error } = await supabaseBrowser
      .from("inspeksi_gardu_temuan")
      .select("id,kategori,uraian,prioritas,foto_url,suhu,suhu_pembanding,status_tl,selesai_oleh,selesai_catatan")
      .eq("inspeksi_id", id)
      .order("urutan");
    if (error) throw new Error(error.message);
    const label = new Map(kategori.map((k) => [k.kode, k.label]));
    return (data ?? []).map((r) => ({
      id: r.id as string,
      kategori: r.kategori as string,
      kategoriLabel: label.get(r.kategori as string) ?? (r.kategori as string),
      uraian: r.uraian as string,
      prioritas: r.prioritas as TemuanGardu["prioritas"],
      foto: (r.foto_url as string[] | null) ?? [],
      suhu: angka(r.suhu),
      suhuPembanding: angka(r.suhu_pembanding),
      statusTl: r.status_tl === "Selesai" ? "Selesai" : "Terbuka",
      selesaiOleh: teks(r.selesai_oleh),
      selesaiCatatan: teks(r.selesai_catatan),
    }));
  }, [kategori]);

  const rpc = async (nama: string, arg: Record<string, unknown>, id: string) => {
    const { error } = await supabaseBrowser.rpc(nama, arg);
    if (error) throw new Error(error.message);
    await segarkanSatu(id);
  };
  const verifikasi = (id: string, oleh: string) => rpc("verifikasi_inspeksi_gardu", { p_id: id, p_oleh: oleh }, id);
  const kembalikan = (id: string, alasan: string, oleh: string) =>
    rpc("kembalikan_inspeksi_gardu", { p_id: id, p_alasan: alasan, p_oleh: oleh }, id);
  const batalkan = (id: string, alasan: string, oleh: string) =>
    rpc("batalkan_inspeksi_gardu", { p_id: id, p_alasan: alasan, p_oleh: oleh }, id);
  const selesaikanTemuan = async (temuanId: string, catatan: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("selesaikan_temuan_igardu", { p_temuan_id: temuanId, p_catatan: catatan, p_oleh: oleh });
    if (error) throw new Error(error.message);
  };

  const simpanKategori = async (k: KategoriIgardu, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("simpan_igardu_ref", {
      p_kode: k.kode, p_label: k.label, p_item_kode: k.itemKode, p_urutan: k.urutan, p_aktif: k.aktif, p_oleh: oleh,
    });
    if (error) throw new Error(error.message);
    setKategori((p) => [...p.filter((x) => x.kode !== k.kode), k].sort((a, b) => a.urutan - b.urutan || a.kode.localeCompare(b.kode)));
  };

  return {
    semua, baris, hitung, kategori, loading, galat,
    ulp, setUlp, daftarUlp, bulan, setBulan, tahun, setTahun, daftarTahun,
    tier, setTier, status, setStatus, cari, setCari,
    muat, temuanDari, verifikasi, kembalikan, batalkan, selesaikanTemuan, simpanKategori,
  };
}
