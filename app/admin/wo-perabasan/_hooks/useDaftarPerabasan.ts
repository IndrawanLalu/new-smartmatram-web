"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Daftar segmen perabasan — satu baris = satu segmen dalam sebuah WO
 * (keputusan user 24 Sep 2026), diurutkan per penyulang.
 *
 * ── APA YANG DIMUAT ─────────────────────────────────────────────────────────
 * Segmen yang MASIH BERJALAN (belum dibagi, dijadwalkan, dalam proses, menunggu
 * verifikasi, dikembalikan) SELALU dimuat, berapa pun umur WO-nya — itu
 * tunggakan, dan tunggakan yang hilang karena bulan berganti tidak akan pernah
 * ditagih. Yang sudah TERTUTUP (diverifikasi, dibatalkan) disaring per periode.
 * Keduanya dipaginasi penuh (teknisaplikasi.md butir 13).
 */

export type StatusRabas =
  | "Belum ditugaskan"
  | "Dijadwalkan"
  | "Dalam proses"
  | "Menunggu verifikasi"
  | "Dikembalikan"
  | "Diverifikasi"
  | "Dibatalkan";

export const STATUS_RABAS: StatusRabas[] = [
  "Belum ditugaskan", "Dijadwalkan", "Dalam proses", "Menunggu verifikasi",
  "Dikembalikan", "Diverifikasi", "Dibatalkan",
];

const AKTIF = ["Dijadwalkan", "Dalam Proses", "Selesai", "Ditolak"];

export interface BarisRabas {
  id: string;
  woId: string;
  woNama: string | null;
  woTgl: string | null;
  segmenId: string;
  urutan: number;
  ulp: string;
  penyulang: string;
  segmenNama: string;
  panjangKm: number | null;
  panjangDari: string | null;
  regu: string | null;
  statusDb: string;
  status: StatusRabas;
  tglMulai: string | null;
  tglSelesai: string | null;
  petugasNama: string | null;
  catatan: string | null;
  verifiedNote: string | null;
  verifiedAt: string | null;
}

export type SaringStatus = "SEMUA" | StatusRabas;

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

export const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const dua = (n: number) => String(n).padStart(2, "0");
const akhirBulan = (t: number, b: number) => new Date(t, b, 0).getDate();

const KOLOM =
  "id,wo_id,segmen_id,urutan,ulp,penyulang,segmen_nama,panjang_km,panjang_dari,regu,status,tgl_mulai,tgl_selesai,petugas_nama,catatan,verified_note,verified_at,wo:wo_perabasan(nama,tgl_wo)";

const teks = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** Status tampil — "Belum ditugaskan" bukan status database, tapi keadaan
 *  yang paling perlu terlihat: selama regu kosong, segmen ini tidak muncul di
 *  HP siapa pun. */
const statusTampil = (status: string, regu: string | null): StatusRabas => {
  if (!regu && ["Dijadwalkan", "Ditolak"].includes(status)) return "Belum ditugaskan";
  switch (status) {
    case "Dijadwalkan": return "Dijadwalkan";
    case "Dalam Proses": return "Dalam proses";
    case "Selesai": return "Menunggu verifikasi";
    case "Ditolak": return "Dikembalikan";
    case "Diverifikasi": return "Diverifikasi";
    default: return "Dibatalkan";
  }
};

const petaBaris = (r: Record<string, unknown>): BarisRabas => {
  const wo = r.wo as { nama?: string; tgl_wo?: string } | null;
  const regu = teks(r.regu);
  return {
    id: r.id as string,
    woId: r.wo_id as string,
    woNama: teks(wo?.nama),
    woTgl: teks(wo?.tgl_wo),
    segmenId: r.segmen_id as string,
    urutan: Number(r.urutan ?? 0),
    ulp: r.ulp as string,
    penyulang: r.penyulang as string,
    segmenNama: r.segmen_nama as string,
    panjangKm: r.panjang_km === null || r.panjang_km === undefined ? null : Number(r.panjang_km),
    panjangDari: teks(r.panjang_dari),
    regu,
    statusDb: r.status as string,
    status: statusTampil(r.status as string, regu),
    tglMulai: teks(r.tgl_mulai),
    tglSelesai: teks(r.tgl_selesai),
    petugasNama: teks(r.petugas_nama),
    catatan: teks(r.catatan),
    verifiedNote: teks(r.verified_note),
    verifiedAt: teks(r.verified_at),
  };
};

export function useDaftarPerabasan(user: CurrentUser) {
  const bolehSemua = canSeeAllUnits(user.role);
  const sekarang = new Date();
  const tahunIni = sekarang.getFullYear();

  const [semua, setSemua] = useState<BarisRabas[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [ulp, gantiUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? ""));
  const [status, setStatus] = useState<SaringStatus>("SEMUA");
  const [cari, setCari] = useState("");
  const [bulan, gantiBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, gantiTahun] = useState(tahunIni);
  const [nonce, setNonce] = useState(0);

  const daftarUlp = useMemo(() => (bolehSemua ? ["SEMUA", ...UNIT] : [user.unit ?? ""]), [bolehSemua, user.unit]);
  const daftarTahun = useMemo(() => [tahunIni, tahunIni - 1, tahunIni - 2], [tahunIni]);

  const mulai = () => { setLoading(true); setGalat(null); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setBulan = (b: number) => { mulai(); gantiBulan(b); };
  const setTahun = (t: number) => { mulai(); gantiTahun(t); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };

  const tarik = useCallback(async () => {
    const awal = bulan === 0 ? `${tahun}-01-01` : `${tahun}-${dua(bulan)}-01`;
    const akhir = bulan === 0 ? `${tahun}-12-31` : `${tahun}-${dua(bulan)}-${dua(akhirBulan(tahun, bulan))}`;

    const aktif = () => {
      let x = supabaseBrowser.from("wo_perabasan_item").select(KOLOM).in("status", AKTIF).order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };
    // Tertutup: diverifikasi menurut TANGGAL PEKERJAAN selesai, dibatalkan
    // menurut kapan dibatalkan (tidak punya tanggal pekerjaan).
    const tertutup = () => {
      let x = supabaseBrowser
        .from("wo_perabasan_item")
        .select(KOLOM)
        .or(
          `and(status.eq.Diverifikasi,tgl_selesai.gte.${awal},tgl_selesai.lte.${akhir}),` +
            `and(status.eq.Dibatalkan,updated_at.gte.${awal},updated_at.lte.${akhir}T23:59:59)`,
        )
        .order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };

    try {
      const [a, t] = await Promise.all([
        fetchAllRows<Record<string, unknown>>(aktif),
        fetchAllRows<Record<string, unknown>>(tertutup),
      ]);
      return { rows: [...a, ...t], error: null as string | null };
    } catch (e) {
      return { rows: [] as Record<string, unknown>[], error: e instanceof Error ? e.message : String(e) };
    }
  }, [ulp, bulan, tahun]);

  useEffect(() => {
    let hidup = true;
    tarik().then((h) => {
      if (!hidup) return;
      setGalat(h.error);
      setSemua(
        h.rows
          .map(petaBaris)
          // Urut per penyulang (keputusan user), lalu urutan di WO.
          .sort((x, y) => x.penyulang.localeCompare(y.penyulang) || x.urutan - y.urutan),
      );
      setLoading(false);
    });
    return () => { hidup = false; };
  }, [tarik, nonce]);

  const dasarChip = useMemo(() => {
    const k = cari.trim().toUpperCase();
    if (!k) return semua;
    return semua.filter((b) =>
      [b.penyulang, b.segmenNama, b.regu ?? "", b.petugasNama ?? "", b.woNama ?? ""].some((v) => v.toUpperCase().includes(k)),
    );
  }, [semua, cari]);

  const baris = useMemo(
    () => dasarChip.filter((b) => status === "SEMUA" || b.status === status),
    [dasarChip, status],
  );

  const hitung = useMemo(() => {
    const h = Object.fromEntries(STATUS_RABAS.map((s) => [s, 0])) as Record<StatusRabas, number>;
    for (const b of dasarChip) h[b.status] += 1;
    return h;
  }, [dasarChip]);

  /** Ambil ulang SATU baris lalu tambal di tempat (teknisaplikasi.md butir 7). */
  const segarkanSatu = async (id: string) => {
    const { data } = await supabaseBrowser.from("wo_perabasan_item").select(KOLOM).eq("id", id).maybeSingle();
    if (data) setSemua((p) => p.map((x) => (x.id === id ? petaBaris(data as Record<string, unknown>) : x)));
  };

  return {
    semua, baris, hitung, loading, galat,
    ulp, setUlp, daftarUlp, status, setStatus, cari, setCari,
    bulan, setBulan, tahun, setTahun, daftarTahun,
    muat, segarkanSatu,
  };
}
