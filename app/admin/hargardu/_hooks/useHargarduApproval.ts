"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabasePaginate";

export interface PemeliharaanMenunggu {
  id: string;
  gardu_kode: string;
  ulp: string;
  penyulang: string | null;
  gardu_nama: string | null;
  gardu_alamat: string | null;
  daya_master: string | null;
  status: string;
  sumber: string;
  /** Tanggal rencana — terisi untuk pemeliharaan terjadwal (`sumber = 'jadwal'`). */
  tgl_rencana: string | null;
  tgl_padam: string | null;
  tgl_selesai: string | null;
  tgl_acuan: string | null;
  regu_1: string[] | null;
  regu_2: string[] | null;
  petugas_nama: string | null;
  catatan_perbaikan: string | null;
  pr_keterangan: string | null;
  verified_note: string | null;
  item_terisi: number;
  item_tidak_normal: number;
  jumlah_foto: number;
  foto_wajib: number;
  usulan_menunggu: number;
  /** WO Pemeliharaan yang memuat pekerjaan ini ("WO Sep 2026"); tidak ada = null. */
  wo_label?: string | null;
  wo_tgl?: string | null;
}

const BLN_WO = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/**
 * Tempelkan WO Pemeliharaan ke tiap pekerjaan. Sambungannya dibaca dari view
 * `wo_hargardu_realisasi` (pekerjaan yang mewakili baris WO di bulannya) —
 * tidak ada kolom WO di `pemeliharaan_gardu`, dan memang tidak perlu.
 */
async function tempelWo(rows: PemeliharaanMenunggu[]): Promise<PemeliharaanMenunggu[]> {
  const ids = rows.map((r) => r.id);
  const peta = new Map<string, { bulan: number; tahun: number; tgl_wo: string }>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabaseBrowser
      .from("wo_hargardu_realisasi")
      .select("pemeliharaan_id,bulan,tahun,tgl_wo")
      .in("pemeliharaan_id", ids.slice(i, i + 100));
    // View belum terpasang (SQL WO belum dijalankan) tidak boleh menggagalkan
    // daftar pemeliharaan — kolom WO saja yang tetap "-".
    if (error) return rows;
    for (const d of data ?? []) peta.set(d.pemeliharaan_id as string, d as { bulan: number; tahun: number; tgl_wo: string });
  }
  return rows.map((r) => {
    const w = peta.get(r.id);
    return w ? { ...r, wo_label: `WO ${BLN_WO[w.bulan - 1]} ${w.tahun}`, wo_tgl: w.tgl_wo } : r;
  });
}

/** Satu jawaban pemeriksaan, sudah dipasangkan dengan acuannya. */
export interface Periksa {
  itemKode: string;
  itemNama: string;
  kelompok: string;
  bagian: string;
  nilai: string | null;
  nilaiLabel: string | null;
  nilaiAngka: number | null;
  satuan: string | null;
  /**
   * Pilihan yang TIDAK dikenal acuan sengaja tidak dianggap normal diam-diam.
   * Kalau daftar acuan berubah sesudah pekerjaan dikirim, lebih baik barisnya
   * terlihat mencurigakan daripada hilang dari daftar temuan.
   */
  normal: boolean;
  catatan: string | null;
}

export interface Ukuran {
  tahap: "sebelum" | "sesudah";
  putaran_phasa: string | null;
  arus_r: number | null;
  arus_s: number | null;
  arus_t: number | null;
  arus_n: number | null;
  teg_rn: number | null;
  teg_sn: number | null;
  teg_tn: number | null;
  pertanahan_arrester: number | null;
  pertanahan_trafo: number | null;
  pertanahan_netral: number | null;
  perjurusan: Record<string, { arus?: Record<string, number | null> }> | null;
}

export interface FotoBukti {
  slot: string;
  nama: string;
  kelompok: string;
  wajib: boolean;
  url: string;
}

/** Usulan koreksi master yang lahir dari pekerjaan ini. */
export interface UsulanSpek {
  id: string;
  field: string;
  nilai_lama: string | null;
  nilai_baru: string;
  bukti_foto: string[];
  status: string;
  diusulkan_at: string;
  pengusul_nama: string | null;
}

export interface Rincian {
  periksa: Periksa[];
  ukur: Ukuran[];
  foto: FotoBukti[];
  usulan: UsulanSpek[];
  spek: Record<string, string>;
  retingFuse: Record<string, Record<string, string>>;
}

/** Status tampil — label lama modul ini dipertahankan (bahasa persetujuan:
 *  menyetujui pemeliharaan sekaligus mengonfirmasi master gardunya). */
export type StatusHargardu =
  | "Dijadwalkan"
  | "Sedang dikerjakan"
  | "Menunggu persetujuan"
  | "Dikembalikan"
  | "Disetujui"
  | "Dibatalkan";

export const STATUS_HARGARDU: StatusHargardu[] = [
  "Dijadwalkan", "Sedang dikerjakan", "Menunggu persetujuan", "Dikembalikan", "Disetujui", "Dibatalkan",
];

const STATUS_DB: Record<string, StatusHargardu> = {
  Dijadwalkan: "Dijadwalkan",
  "Dalam Proses": "Sedang dikerjakan",
  Selesai: "Menunggu persetujuan",
  Ditolak: "Dikembalikan",
  Diverifikasi: "Disetujui",
  Dibatalkan: "Dibatalkan",
};

export const statusTampil = (s: string): StatusHargardu => STATUS_DB[s] ?? "Sedang dikerjakan";

const AKTIF = ["Dijadwalkan", "Dalam Proses", "Selesai", "Ditolak"];

export type SaringStatus = "SEMUA" | StatusHargardu;

export const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];
const dua = (n: number) => String(n).padStart(2, "0");
const akhirBulan = (t: number, b: number) => new Date(t, b, 0).getDate();

/**
 * Daftar pemeliharaan gardu — pola Kinerja Pelayanan Teknik (tabel + modal,
 * teknisaplikasi.md butir 7).
 *
 * Yang MASIH BERJALAN (dijadwalkan, dikerjakan, menunggu persetujuan,
 * dikembalikan) selalu dimuat — tunggakan tidak boleh hilang karena bulan
 * berganti. Yang sudah disetujui/dibatalkan disaring per periode menurut
 * `tgl_acuan` (selesai → padam → dibuat).
 *
 * PENCARIAN GARDU MENELUSURI SELURUH RIWAYAT, bukan periode — keputusan lama
 * yang dipertahankan: yang dicari orang saat mengetik kode gardu adalah "gardu
 * ini pernah dipelihara kapan saja".
 */
export function useHargarduApproval(user: CurrentUser) {
  const bolehSemua = canSeeAllUnits(user.role);
  const sekarang = new Date();
  const tahunIni = sekarang.getFullYear();

  const [semua, setSemua] = useState<PemeliharaanMenunggu[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [memproses, setMemproses] = useState<string | null>(null);
  const [ulp, gantiUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? ""));
  const [bulan, gantiBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, gantiTahun] = useState(tahunIni);
  const [cari, gantiCari] = useState("");
  const [status, setStatus] = useState<SaringStatus>("SEMUA");
  const [nonce, setNonce] = useState(0);

  const daftarUlp = useMemo(() => (bolehSemua ? ["SEMUA", ...UNIT] : [user.unit ?? ""]), [bolehSemua, user.unit]);
  const daftarTahun = useMemo(() => [tahunIni, tahunIni - 1, tahunIni - 2], [tahunIni]);

  const mulai = () => { setLoading(true); setGalat(null); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setBulan = (b: number) => { mulai(); gantiBulan(b); };
  const setTahun = (t: number) => { mulai(); gantiTahun(t); };
  const setCari = (c: string) => { mulai(); gantiCari(c); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };

  const kataCari = cari.trim();

  const tarik = useCallback(async () => {
    const saringUlp = <T extends { eq: (k: string, v: string) => T }>(x: T) => (ulp !== "SEMUA" ? x.eq("ulp", ulp) : x);

    if (kataCari) {
      const q = () =>
        saringUlp(
          supabaseBrowser
            .from("pemeliharaan_gardu_ringkas")
            .select("*")
            .or(`gardu_kode.ilike.%${kataCari}%,gardu_nama.ilike.%${kataCari}%`)
            .order("id"),
        );
      return tempelWo(await fetchAllRows<PemeliharaanMenunggu>(q));
    }

    const awal = bulan === 0 ? `${tahun}-01-01` : `${tahun}-${dua(bulan)}-01`;
    const akhir = bulan === 0 ? `${tahun}-12-31` : `${tahun}-${dua(bulan)}-${dua(akhirBulan(tahun, bulan))}`;
    const aktif = () =>
      saringUlp(supabaseBrowser.from("pemeliharaan_gardu_ringkas").select("*").in("status", AKTIF).order("id"));
    const tertutup = () =>
      saringUlp(
        supabaseBrowser
          .from("pemeliharaan_gardu_ringkas")
          .select("*")
          .not("status", "in", `(${AKTIF.map((x) => `"${x}"`).join(",")})`)
          .gte("tgl_acuan", awal)
          .lte("tgl_acuan", `${akhir}T23:59:59`)
          .order("id"),
      );
    const [a, t] = await Promise.all([fetchAllRows<PemeliharaanMenunggu>(aktif), fetchAllRows<PemeliharaanMenunggu>(tertutup)]);
    return tempelWo([...a, ...t]);
  }, [ulp, bulan, tahun, kataCari]);

  useEffect(() => {
    let hidup = true;
    // Jeda singkat saat mengetik kode gardu — satu kueri per huruf tidak perlu.
    const jeda = setTimeout(() => {
      tarik().then(
        (rows) => {
          if (!hidup) return;
          setSemua([...rows].sort((x, y) => (y.tgl_acuan ?? "").localeCompare(x.tgl_acuan ?? "")));
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
    }, kataCari ? 300 : 0);
    return () => { hidup = false; clearTimeout(jeda); };
  }, [tarik, nonce, kataCari]);

  const baris = useMemo(
    () => semua.filter((d) => status === "SEMUA" || statusTampil(d.status) === status),
    [semua, status],
  );

  const hitung = useMemo(() => {
    const h = Object.fromEntries(STATUS_HARGARDU.map((x) => [x, 0])) as Record<StatusHargardu, number>;
    for (const d of semua) h[statusTampil(d.status)] += 1;
    return h;
  }, [semua]);

  /** Ambil ulang SATU baris lalu tambal di tempat. */
  const segarkanSatu = async (id: string) => {
    const { data } = await supabaseBrowser.from("pemeliharaan_gardu_ringkas").select("*").eq("id", id).maybeSingle();
    if (data) {
      setSemua((p) =>
        p.map((x) => (x.id === id ? { ...(data as unknown as PemeliharaanMenunggu), wo_label: x.wo_label, wo_tgl: x.wo_tgl } : x)),
      );
    }
  };

  const oleh = user.name ?? user.email ?? null;

  /** Jalankan RPC; galatnya DILEMPAR supaya pemanggil (modal) bisa menampilkan toast. */
  const rpc = async (id: string, fn: string, args: Record<string, unknown>, tambal: string | null) => {
    setMemproses(id);
    try {
      const { error: e } = await supabaseBrowser.rpc(fn, args);
      if (e) throw new Error(e.message);
      if (tambal) await segarkanSatu(tambal);
    } finally {
      setMemproses(null);
    }
  };

  const putuskan = (id: string, setuju: boolean, catatan?: string) =>
    rpc(id, "putuskan_pemeliharaan", { p_id: id, p_setuju: setuju, p_nama: oleh, p_catatan: catatan ?? null }, id);

  /**
   * BUKAN penolakan. Menolak = "ulangi"; membatalkan = "jangan diulang" (salah
   * gardu, uji coba). Kalau pemeliharaan ini yang dulu mengonfirmasi master
   * gardunya, penandanya ikut dicabut oleh fungsi database.
   */
  const batalkan = (id: string, alasan: string) =>
    rpc(id, "batalkan_pemeliharaan", { p_id: id, p_alasan: alasan, p_nama: oleh }, id);

  /**
   * Keputusan atas satu usulan koreksi master, terpisah dari keputusan atas
   * pekerjaannya: kVA yang berubah berarti trafonya pernah diganti, dan itu
   * pantas dilihat sendiri.
   */
  const putuskanUsulan = (idPekerjaan: string, idUsulan: string, setuju: boolean, alasan?: string) =>
    rpc(idUsulan, "putuskan_usulan", { p_id: idUsulan, p_setuju: setuju, p_nama: oleh, p_alasan: alasan ?? null }, idPekerjaan);

  return {
    semua, baris, hitung, loading, galat, memproses,
    ulp, setUlp, daftarUlp, bulan, setBulan, tahun, setTahun, daftarTahun, cari, setCari, status, setStatus,
    muat, putuskan, batalkan, putuskanUsulan,
  };
}

/**
 * Susun seluruh rincian satu pekerjaan.
 *
 * Acuan item dan opsi ikut diambil supaya kode dan label bisa dipasangkan —
 * yang tersimpan di catatan pemeriksaan adalah KODE pilihan, karena label boleh
 * berubah kapan saja tanpa memutus arti catatan lama.
 */
export async function ambilRincian(id: string): Promise<Rincian> {
  const [periksaRes, itemRes, opsiRes, ukurRes, fotoRes, fotoRefRes, usulanRes, indukRes] =
    await Promise.all([
      supabaseBrowser
        .from("pemeliharaan_gardu_periksa")
        .select("item_kode,bagian,nilai,nilai_angka,catatan")
        .eq("pemeliharaan_id", id),
      supabaseBrowser
        .from("hargardu_item_ref")
        .select("kode,nama,kelompok,satuan,urutan,dimensi"),
      supabaseBrowser.from("hargardu_opsi_ref").select("item_kode,kode,label,normal"),
      supabaseBrowser
        .from("pemeliharaan_gardu_ukur")
        .select(
          "tahap,putaran_phasa,arus_r,arus_s,arus_t,arus_n,teg_rn,teg_sn,teg_tn," +
            "pertanahan_arrester,pertanahan_trafo,pertanahan_netral,perjurusan",
        )
        .eq("pemeliharaan_id", id),
      supabaseBrowser
        .from("pemeliharaan_gardu_foto")
        .select("slot,url")
        .eq("pemeliharaan_id", id),
      supabaseBrowser.from("hargardu_foto_ref").select("kode,nama,kelompok,wajib,urutan"),
      supabaseBrowser
        .from("master_usulan")
        .select("id,field,nilai_lama,nilai_baru,bukti_foto,status,diusulkan_at,pengusul_nama")
        .eq("sumber_modul", "pemeliharaan_gardu")
        .eq("sumber_id", id)
        .order("field"),
      supabaseBrowser
        .from("pemeliharaan_gardu")
        .select("spek,reting_fuse")
        .eq("id", id)
        .maybeSingle(),
    ]);

  const item = new Map(
    (itemRes.data ?? []).map((i: any) => [i.kode, i]),
  );
  const opsi = new Map(
    (opsiRes.data ?? []).map((o: any) => [`${o.item_kode}|${o.kode}`, o]),
  );

  const periksa: Periksa[] = (periksaRes.data ?? [])
    .map((p: any) => {
      const i = item.get(p.item_kode);
      const o = p.nilai ? opsi.get(`${p.item_kode}|${p.nilai}`) : null;
      return {
        itemKode: p.item_kode,
        itemNama: i?.nama ?? p.item_kode,
        kelompok: i?.kelompok ?? "Lainnya",
        bagian: p.bagian,
        nilai: p.nilai ?? null,
        nilaiLabel: o?.label ?? null,
        nilaiAngka: p.nilai_angka ?? null,
        satuan: i?.satuan ?? null,
        normal: p.nilai ? !!o?.normal : true,
        catatan: p.catatan ?? null,
        _urutan: i?.urutan ?? 999,
      };
    })
    .sort((a: any, b: any) => a._urutan - b._urutan || a.bagian.localeCompare(b.bagian))
    .map(({ _urutan, ...r }: any) => r as Periksa);

  const fotoRef = new Map((fotoRefRes.data ?? []).map((f: any) => [f.kode, f]));
  const foto: FotoBukti[] = (fotoRes.data ?? [])
    .map((f: any) => ({
      slot: f.slot,
      nama: fotoRef.get(f.slot)?.nama ?? f.slot,
      kelompok: fotoRef.get(f.slot)?.kelompok ?? "Pekerjaan",
      wajib: !!fotoRef.get(f.slot)?.wajib,
      url: f.url,
      _urutan: fotoRef.get(f.slot)?.urutan ?? 999,
    }))
    .sort((a: any, b: any) => a._urutan - b._urutan)
    .map(({ _urutan, ...r }: any) => r as FotoBukti);

  const usulan: UsulanSpek[] = (usulanRes.data ?? []).map((u: any) => ({
    id: u.id,
    field: u.field,
    nilai_lama: u.nilai_lama?.nilai ?? null,
    nilai_baru: String(u.nilai_baru?.nilai ?? ""),
    bukti_foto: u.bukti_foto ?? [],
    status: u.status,
    diusulkan_at: u.diusulkan_at,
    pengusul_nama: u.pengusul_nama ?? null,
  }));

  return {
    periksa,
    ukur: (ukurRes.data ?? []) as unknown as Ukuran[],
    foto,
    usulan,
    spek: (indukRes.data as any)?.spek ?? {},
    retingFuse: (indukRes.data as any)?.reting_fuse ?? {},
  };
}

/** Ketidakseimbangan beban, persen. Dihitung, tidak pernah diketik. */
export const ketidakseimbangan = (u?: Ukuran): number | null => {
  if (!u) return null;
  const a = [u.arus_r, u.arus_s, u.arus_t];
  if (a.some((v) => v === null || v === undefined || !Number.isFinite(Number(v)))) return null;
  const n = a.map(Number);
  const rata = (n[0] + n[1] + n[2]) / 3;
  if (rata <= 0) return null;
  return (Math.max(...n.map((v) => Math.abs(v - rata))) / rata) * 100;
};
