"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabasePaginate";

export interface InspeksiMenunggu {
  id: string;
  gardu_kode: string;
  ulp: string;
  penyulang: string | null;
  gardu_nama: string | null;
  gardu_alamat: string | null;
  tgl_mulai: string;
  tgl_selesai: string | null;
  status: string;
  inspektor_nama: string | null;
  petugas_2: string | null;
  catatan: string | null;
  verified_note: string | null;
  tiang_aktif: number;
  sudah_diperiksa: number;
  tiang_baru: number;
  jumlah_temuan: number;
  panjang_km: number;
  /** WO inspeksi JTR tempat inspeksi ini tersambung (J5c); null = di luar WO. */
  wo_nama?: string | null;
  tgl_wo?: string | null;
  /**
   * Baris TURUNAN dari tiang, bukan catatan `jtr_inspeksi`: gardu yang sedang
   * dititik tapi belum ditekan "Selesai" di HP. Hanya untuk dilihat — belum ada
   * inspeksi yang bisa disetujui atau dibatalkan.
   */
  sementara?: true;
}

/** Bagaimana sebuah tiang berubah selama inspeksi ini. */
export type Perubahan = "lama" | "baru" | "berubah" | "hilang";

export interface TiangBanding {
  id: string;
  kode: string;
  lat: number | null;
  lng: number | null;
  indukId: string | null;
  jurusan: string | null;
  kondisi: string | null;
  perubahan: Perubahan;
  /** Ringkasan apa yang berubah, dibaca dari jejak audit. */
  rincian: string[];
}

export interface Penghantar {
  jurusan: string;
  nomor_kabel: number;
  jenis: string | null;
  ukuran: string | null;
  jumlah_gawang: number;
  panjang_km: number;
}

export interface RutePerJurusan {
  jurusan: string;
  jumlah_tiang: number;
  panjang_rute_km: number;
  panjang_penghantar_km: number;
  tiang_tanpa_kabel: number;
  gawang_terputus: number;
}

/**
 * Bentang yang kabelnya tercatat tapi hulunya belum jelas.
 *
 * Bukan daftar kesalahan — daftar pekerjaan. Tiap baris berarti ada kabel di
 * sebuah tiang yang belum ketahuan datang dari mana, jadi panjangnya belum ikut
 * terhitung. Diperlihatkan saat persetujuan karena di situlah orang masih ingat
 * jaringannya, dan perbaikannya satu ketukan di lapangan.
 */
export interface GawangTerputus {
  jurusan: string;
  tiang_kode: string;
  nomor_kabel: number;
  ukuran: string | null;
  panjang_m: number;
  hulu_kode: string | null;
}

export interface Temuan {
  tiang_kode: string;
  temuan: string;
  urgensi: string;
}

const angka = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/** Status tampil — bahasa persetujuan, sama dengan Pemeliharaan Gardu. */
export type StatusJtr =
  | "Dijadwalkan"
  | "Sedang diinspeksi"
  | "Menunggu persetujuan"
  | "Dikembalikan"
  | "Disetujui"
  | "Dibatalkan";

export const STATUS_JTR: StatusJtr[] = [
  "Dijadwalkan", "Sedang diinspeksi", "Menunggu persetujuan", "Dikembalikan", "Disetujui", "Dibatalkan",
];

const STATUS_DB: Record<string, StatusJtr> = {
  Dijadwalkan: "Dijadwalkan",
  "Dalam Proses": "Sedang diinspeksi",
  Selesai: "Menunggu persetujuan",
  Ditolak: "Dikembalikan",
  Diverifikasi: "Disetujui",
  Dibatalkan: "Dibatalkan",
};

export const statusTampil = (s: string): StatusJtr => STATUS_DB[s] ?? "Sedang diinspeksi";

const AKTIF = ["Dijadwalkan", "Dalam Proses", "Selesai", "Ditolak"];
const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

export const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const dua = (n: number) => String(n).padStart(2, "0");
const akhirBulan = (t: number, b: number) => new Date(t, b, 0).getDate();

export type SaringStatus = "SEMUA" | StatusJtr;

/** Tanggal WITA dari cap waktu — batas hari mengikuti lapangan, bukan UTC. */
const tanggalWita = (ts: string) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: "Asia/Makassar" });

const potong = <T,>(a: T[], n = 150) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

interface TiangRingkas { id: string; gardu_kode: string; ulp: string; created_at: string; dikonfirmasi_at: string | null }
interface InspeksiRingkas { id: string; gardu_kode: string; ulp: string; status: string; tgl_mulai: string; tgl_selesai: string | null }

/**
 * Gardu yang sedang ditelusuri tapi belum ditutup petugas.
 *
 * HP baru membuat baris `jtr_inspeksi` saat petugas menekan "Selesai" — satu
 * fungsi membuat, mendaftar tiang, lalu menutupnya. Tanpa turunan ini, gardu
 * yang sudah dititik berhari-hari tidak terlihat di mana pun di daftar.
 *
 * Aturannya: gardu punya tiang aktif yang dicatat SESUDAH hari inspeksi
 * terakhirnya (atau belum pernah diinspeksi), dan tidak sedang punya inspeksi
 * terbuka (yang terbuka sudah tampil sebagai baris aslinya).
 *
 * ⚠ Menarik semua tiang ber-gardu (kolom ringan, dipaginasi). Kalau jumlah
 * tiang sudah puluhan ribu, pindahkan agregasinya ke view di database.
 */
async function ambilBerjalan(ulp: string): Promise<InspeksiMenunggu[]> {
  const [tiang, inspeksi] = await Promise.all([
    fetchAllRows<TiangRingkas>(() => {
      let x = supabaseBrowser
        .from("jtr_tiang_lengkap")
        .select("id,gardu_kode,ulp,created_at,dikonfirmasi_at")
        .eq("status_hidup", "aktif")
        .order("id")
        .order("gardu_kode");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    }),
    fetchAllRows<InspeksiRingkas>(() => {
      let x = supabaseBrowser.from("jtr_inspeksi").select("id,gardu_kode,ulp,status,tgl_mulai,tgl_selesai").order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    }),
  ]);

  const kunci = (g: string, u: string) => `${g.toUpperCase()}|${u}`;
  const terbuka = new Set<string>();
  const terakhir = new Map<string, string>();
  for (const i of inspeksi) {
    const k = kunci(i.gardu_kode, i.ulp);
    if (AKTIF.includes(i.status)) terbuka.add(k);
    const tgl = i.tgl_selesai ?? i.tgl_mulai;
    if (tgl > (terakhir.get(k) ?? "")) terakhir.set(k, tgl);
  }

  const perGardu = new Map<string, { kode: string; ulp: string; aktif: number; baru: number; mulai: string; akhir: string }>();
  for (const t of tiang) {
    const k = kunci(t.gardu_kode, t.ulp);
    if (terbuka.has(k)) continue;
    const g = perGardu.get(k) ?? { kode: t.gardu_kode, ulp: t.ulp, aktif: 0, baru: 0, mulai: "", akhir: "" };
    g.aktif += 1;
    const batas = terakhir.get(k) ?? "";
    const dibuat = tanggalWita(t.created_at);
    const kegiatan = tanggalWita(t.dikonfirmasi_at && t.dikonfirmasi_at > t.created_at ? t.dikonfirmasi_at : t.created_at);
    if (dibuat > batas) g.baru += 1;
    if (kegiatan > batas) {
      if (!g.mulai || kegiatan < g.mulai) g.mulai = kegiatan;
      if (kegiatan > g.akhir) g.akhir = kegiatan;
    }
    perGardu.set(k, g);
  }
  const berjalan = [...perGardu.values()].filter((g) => g.mulai);
  if (berjalan.length === 0) return [];

  // Nama gardu & panjang rute — hanya untuk gardu yang berjalan (sedikit).
  const kode = [...new Set(berjalan.map((g) => g.kode))];
  const [garduRes, panjangRes] = await Promise.all([
    Promise.all(potong(kode).map((p) => supabaseBrowser.from("gardu").select("kode,ulp,nama,alamat,feeder").in("kode", p))),
    Promise.all(potong(kode).map((p) => supabaseBrowser.from("gardu_jtr_panjang").select("gardu_kode,ulp,panjang_rute_km").in("gardu_kode", p))),
  ]);
  const galat = [...garduRes, ...panjangRes].find((r) => r.error)?.error;
  if (galat) throw new Error(galat.message);

  const info = new Map(garduRes.flatMap((r) => r.data ?? []).map((g) => [kunci(g.kode, g.ulp), g]));
  const panjang = new Map<string, number>();
  for (const p of panjangRes.flatMap((r) => r.data ?? [])) {
    const k = kunci(p.gardu_kode, p.ulp);
    panjang.set(k, (panjang.get(k) ?? 0) + Number(p.panjang_rute_km ?? 0));
  }

  return berjalan.map((g) => {
    const k = kunci(g.kode, g.ulp);
    const gi = info.get(k);
    return {
      id: `berjalan:${k}`,
      gardu_kode: g.kode,
      ulp: g.ulp,
      penyulang: gi?.feeder ?? null,
      gardu_nama: gi?.nama ?? null,
      gardu_alamat: gi?.alamat ?? null,
      tgl_mulai: g.mulai,
      tgl_selesai: null,
      status: "Dalam Proses",
      inspektor_nama: null,
      petugas_2: null,
      catatan: null,
      verified_note: null,
      tiang_aktif: g.aktif,
      sudah_diperiksa: g.aktif,
      tiang_baru: g.baru,
      jumlah_temuan: 0,
      panjang_km: Math.round((panjang.get(k) ?? 0) * 1000) / 1000,
      sementara: true,
    };
  });
}

/**
 * Daftar inspeksi JTR — satu baris per gardu yang jaringannya ditelusuri.
 * Pola Kinerja Pelayanan Teknik (teknisaplikasi.md butir 7): yang MASIH
 * BERJALAN selalu dimuat; yang disetujui/dibatalkan disaring per periode.
 * Semua kueri dipaginasi (butir 13).
 */
export function useDaftarJtr(user: CurrentUser) {
  const bolehSemua = canSeeAllUnits(user.role);
  const sekarang = new Date();
  const tahunIni = sekarang.getFullYear();

  const [semua, setSemua] = useState<InspeksiMenunggu[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [memproses, setMemproses] = useState<string | null>(null);
  const [ulp, gantiUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? ""));
  const [bulan, gantiBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, gantiTahun] = useState(tahunIni);
  const [cari, setCari] = useState("");
  const [status, setStatus] = useState<SaringStatus>("SEMUA");
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
      let x = supabaseBrowser.from("jtr_inspeksi").select("*").in("status", AKTIF).order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };
    // Disetujui menurut tanggal selesai; dibatalkan menurut tanggal mulai
    // (inspeksi yang dibatalkan belum tentu pernah selesai).
    const tertutup = () => {
      let x = supabaseBrowser
        .from("jtr_inspeksi")
        .select("*")
        .or(
          `and(status.eq.Diverifikasi,tgl_selesai.gte.${awal},tgl_selesai.lte.${akhir}T23:59:59),` +
            `and(status.eq.Dibatalkan,tgl_mulai.gte.${awal},tgl_mulai.lte.${akhir}T23:59:59)`,
        )
        .order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };
    // WO tidak ada di view `jtr_inspeksi` — dipasang dari sambungannya. Gagal
    // (SQL WO belum dijalankan) tidak menggagalkan daftar.
    const sambung = () =>
      supabaseBrowser.from("inspeksi_jtr").select("id,wo_item_id").not("wo_item_id", "is", null).order("id");
    const itemWo = () => supabaseBrowser.from("wo_inspeksi_item_status_jtr").select("id,wo_nama,tgl_wo").order("id");
    const [a, t, b, s, w] = await Promise.all([
      fetchAllRows<InspeksiMenunggu>(aktif),
      fetchAllRows<InspeksiMenunggu>(tertutup),
      ambilBerjalan(ulp),
      fetchAllRows<{ id: string; wo_item_id: string }>(sambung).catch(() => []),
      fetchAllRows<{ id: string; wo_nama: string; tgl_wo: string }>(itemWo).catch(() => []),
    ]);
    const item = new Map(w.map((x) => [x.id, x]));
    const wo = new Map(s.map((x) => [x.id, item.get(x.wo_item_id)]));
    const pasang = (d: InspeksiMenunggu): InspeksiMenunggu => ({
      ...d,
      wo_nama: wo.get(d.id)?.wo_nama ?? null,
      tgl_wo: wo.get(d.id)?.tgl_wo ?? null,
    });
    return [...b, ...a.map(pasang), ...t.map(pasang)];
  }, [ulp, bulan, tahun]);

  useEffect(() => {
    let hidup = true;
    tarik().then(
      (rows) => {
        if (!hidup) return;
        setSemua([...rows].sort((x, y) => (y.tgl_selesai ?? y.tgl_mulai ?? "").localeCompare(x.tgl_selesai ?? x.tgl_mulai ?? "")));
        setGalat(null);
        setLoading(false);
      },
      (e: Error) => {
        if (!hidup) return;
        setSemua([]);
        setGalat(e.message);
        setLoading(false);
      },
    );
    return () => { hidup = false; };
  }, [tarik, nonce]);

  const dasarChip = useMemo(() => {
    const k = cari.trim().toUpperCase();
    if (!k) return semua;
    return semua.filter((d) =>
      [d.gardu_kode, d.gardu_nama ?? "", d.penyulang ?? "", d.inspektor_nama ?? ""].some((v) => v.toUpperCase().includes(k)),
    );
  }, [semua, cari]);

  const baris = useMemo(
    () => dasarChip.filter((d) => status === "SEMUA" || statusTampil(d.status) === status),
    [dasarChip, status],
  );

  const hitung = useMemo(() => {
    const h = Object.fromEntries(STATUS_JTR.map((x) => [x, 0])) as Record<StatusJtr, number>;
    for (const d of dasarChip) h[statusTampil(d.status)] += 1;
    return h;
  }, [dasarChip]);

  const segarkanSatu = async (id: string) => {
    const { data } = await supabaseBrowser.from("jtr_inspeksi").select("*").eq("id", id).maybeSingle();
    if (data) setSemua((p) => p.map((x) => (x.id === id ? { ...x, ...(data as unknown as InspeksiMenunggu) } : x)));
  };

  const oleh = user.name ?? user.email ?? null;

  /** RPC; galatnya DILEMPAR supaya modal bisa menampilkan toast. */
  const rpc = async (id: string, fn: string, args: Record<string, unknown>) => {
    setMemproses(id);
    try {
      const { error: e } = await supabaseBrowser.rpc(fn, args);
      if (e) throw new Error(e.message);
      await segarkanSatu(id);
    } finally {
      setMemproses(null);
    }
  };

  const putuskan = (id: string, setuju: boolean, catatan?: string) =>
    rpc(id, "putuskan_inspeksi_jtr", { p_id: id, p_setuju: setuju, p_nama: oleh, p_catatan: catatan ?? null });

  /**
   * BUKAN penolakan. Menolak = "ulangi"; membatalkan = "jangan diulang" (salah
   * objek, uji coba). Tiang yang sudah dinilai tidak ikut dibatalkan — tiangnya
   * nyata berdiri di lapangan.
   */
  const batalkan = (id: string, alasan: string) =>
    rpc(id, "batalkan_inspeksi_jtr", { p_id: id, p_alasan: alasan, p_nama: oleh });

  return {
    semua, baris, hitung, loading, galat, memproses,
    ulp, setUlp, daftarUlp, bulan, setBulan, tahun, setTahun, daftarTahun, cari, setCari, status, setStatus,
    muat, putuskan, batalkan,
  };
}

/**
 * Susun keadaan jaringan SEBELUM dan SESUDAH satu inspeksi.
 *
 * Tidak ada tabel snapshot, dan memang tidak perlu: `created_at` menjawab tiang
 * mana yang baru, `status_hidup` menjawab mana yang hilang, dan `master_audit`
 * menjawab mana yang datanya dikoreksi. Snapshot berarti satu lagi salinan
 * kebenaran yang harus dijaga tetap sinkron — dan salinan seperti itu selalu
 * berakhir melenceng.
 */
export async function ambilPerbandingan(
  inspeksi: InspeksiMenunggu,
): Promise<{
  tiang: TiangBanding[];
  temuan: Temuan[];
  gardu: { lat: number; lng: number } | null;
  penghantar: Penghantar[];
  rute: RutePerJurusan[];
  terputus: GawangTerputus[];
}> {
  // Jendela waktu inspeksi: dari tanggal mulai sampai akhir hari selesainya —
  // yang belum selesai berarti masih berjalan sampai hari ini.
  const mulai = new Date(`${inspeksi.tgl_mulai}T00:00:00`).toISOString();
  const selesai = new Date(
    `${inspeksi.tgl_selesai ?? tanggalWita(new Date().toISOString())}T23:59:59`,
  ).toISOString();

  const [tiangRes, auditRes, temuanRes, garduRes, penghantarRes, ruteRes, terputusRes] =
    await Promise.all([
    supabaseBrowser
      .from("jtr_tiang_lengkap")
      .select("id,kode,lat,lng,induk_id,jurusan,kondisi,status_hidup,created_at,aktif_sampai")
      .eq("gardu_kode", inspeksi.gardu_kode)
      .eq("ulp", inspeksi.ulp),
    supabaseBrowser
      .from("master_audit")
      .select("entitas_kode,field,nilai_lama,nilai_baru,pada")
      .eq("entitas", "tiang")
      .eq("ulp", inspeksi.ulp)
      .gte("pada", mulai)
      .lte("pada", selesai),
    // Baris sementara belum punya inspeksi, jadi belum punya temuan tercatat.
    inspeksi.sementara
      ? Promise.resolve({ data: [] as Temuan[] })
      : supabaseBrowser
          .from("inspeksi_jtr_temuan")
          .select("tiang_kode,temuan,urgensi")
          .eq("inspeksi_id", inspeksi.id),
    supabaseBrowser
      .from("gardu")
      .select("lat,lng")
      .eq("kode", inspeksi.gardu_kode)
      .eq("ulp", inspeksi.ulp)
      .maybeSingle(),
    supabaseBrowser
      .from("gardu_jtr_penghantar")
      .select("jurusan,nomor_kabel,jenis,ukuran,jumlah_gawang,panjang_km")
      .eq("gardu_kode", inspeksi.gardu_kode)
      .eq("ulp", inspeksi.ulp)
      .order("jurusan")
      .order("nomor_kabel"),
    supabaseBrowser
      .from("gardu_jtr_panjang")
      .select(
        "jurusan,jumlah_tiang,panjang_rute_km,panjang_penghantar_km,tiang_tanpa_kabel,gawang_terputus",
      )
      .eq("gardu_kode", inspeksi.gardu_kode)
      .eq("ulp", inspeksi.ulp)
      .order("jurusan"),
    supabaseBrowser
      .from("jtr_gawang_terputus")
      .select("jurusan,tiang_kode,nomor_kabel,ukuran,panjang_m,hulu_kode")
      .eq("gardu_kode", inspeksi.gardu_kode)
      .eq("ulp", inspeksi.ulp)
      .order("tiang_kode"),
  ]);

  const audit = auditRes.data ?? [];
  const perKode = new Map<string, string[]>();
  for (const a of audit) {
    const list = perKode.get(a.entitas_kode) ?? [];
    list.push(`${a.field}: ${ringkasNilai(a.nilai_lama)} → ${ringkasNilai(a.nilai_baru)}`);
    perKode.set(a.entitas_kode, list);
  }

  const tiang: TiangBanding[] = (tiangRes.data ?? []).map((t) => {
    const dibuat = new Date(t.created_at).toISOString();
    const rincian = perKode.get(t.kode) ?? [];

    let perubahan: Perubahan = "lama";
    if (t.status_hidup !== "aktif") perubahan = "hilang";
    else if (dibuat >= mulai && dibuat <= selesai) perubahan = "baru";
    else if (rincian.length > 0) perubahan = "berubah";

    return {
      id: t.id,
      kode: t.kode,
      lat: angka(t.lat),
      lng: angka(t.lng),
      indukId: t.induk_id ?? null,
      jurusan: t.jurusan ?? null,
      kondisi: t.kondisi ?? null,
      perubahan,
      rincian,
    };
  });

  const g = garduRes.data;
  const gardu =
    g && angka(g.lat) !== null && angka(g.lng) !== null
      ? { lat: angka(g.lat)!, lng: angka(g.lng)! }
      : null;

  return {
    tiang,
    temuan: (temuanRes.data ?? []) as Temuan[],
    gardu,
    penghantar: (penghantarRes.data ?? []) as unknown as Penghantar[],
    rute: (ruteRes.data ?? []) as unknown as RutePerJurusan[],
    terputus: (terputusRes.data ?? []) as unknown as GawangTerputus[],
  };
}

function ringkasNilai(v: unknown): string {
  if (v === null || v === undefined) return "kosong";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("lat" in o) return `${Number(o.lat).toFixed(5)}, ${Number(o.lng).toFixed(5)}`;
    return Object.entries(o)
      .map(([k, val]) => `${k}=${Array.isArray(val) ? val.join("→") : String(val)}`)
      .join(", ");
  }
  return String(v);
}

/** Keadaan jaringan sebelum–sesudah satu inspeksi, bahan modal persetujuan. */
export type Banding = Awaited<ReturnType<typeof ambilPerbandingan>>;
