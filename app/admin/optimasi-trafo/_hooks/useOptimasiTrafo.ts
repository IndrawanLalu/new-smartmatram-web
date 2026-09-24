"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Optimasi Trafo — satu tabel untuk WO yang belum dikerjakan DAN catatan yang
 * sudah terkirim, supaya admin melihat seluruh pekerjaan di satu tempat.
 *
 * Pengisiannya di HP; web memeriksa, mengoreksi (selama belum diverifikasi),
 * dan memutuskan. Memverifikasi SEKALIGUS menerapkan usulan master yang lahir
 * dari catatan itu — satu keputusan, satu tombol. Lihat
 * `scripts/optimasi-trafo.sql` §9 dan `optimasi-trafo-beban.sql`.
 */

/** Apakah perpindahan trafo sudah tersambung ke catatan di gardu seberang
 *  lewat nomor seri. null = tidak melibatkan gardu lain. */
export type Jejak = "bersambung" | "dipastikan" | "terbuka" | null;

/** Nama status yang tampil — disepakati 24 Sep 2026. `Selesai` di database
 *  tampil sebagai "Menunggu verifikasi": dari sisi admin, itulah artinya. */
export type StatusTabel = "Belum dikerjakan" | "Menunggu verifikasi" | "Dikembalikan" | "Diverifikasi" | "Dibatalkan";

export const STATUS_TABEL: StatusTabel[] = [
  "Belum dikerjakan", "Menunggu verifikasi", "Dikembalikan", "Diverifikasi", "Dibatalkan",
];

const STATUS_DB: Record<string, StatusTabel> = {
  Selesai: "Menunggu verifikasi",
  // Dikembalikan ke petugas (25 Sep 2026): muncul lagi di HP sebagai draf.
  Dikembalikan: "Dikembalikan",
  Diverifikasi: "Diverifikasi",
  Dibatalkan: "Dibatalkan",
};

export interface CatatanOptimasi {
  id: string;
  pengukuranId: string | null;
  kodeGardu: string;
  ulp: string;
  penyulang: string | null;
  alamat: string | null;
  kvaLama: number;
  kvaBaru: number;
  kvaLamaMaster: number | null;
  noSeriLama: string | null;
  seriLamaTakTerbaca: boolean;
  noSeriLamaMaster: string | null;
  noSeriBaru: string;
  merkBaru: string | null;
  tahunBaru: number | null;
  asal: "GUDANG" | "GARDU";
  asalKode: string | null;
  asalUlp: string | null;
  tujuan: "GUDANG" | "GARDU" | "PERBAIKAN";
  tujuanKode: string | null;
  tujuanUlp: string | null;
  alasan: string;
  alasanLabel: string | null;
  tglOperasi: string;
  fotoLama: string;
  fotoBaru: string;
  lat: number | null;
  lng: number | null;
  statusDb: string;
  petugasNama: string | null;
  catatan: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  usulanMenunggu: number;
  usulanDisetujui: number;
  jejakAsal: Jejak;
  jejakTujuan: Jejak;
  sebelumPersen: number | null;
  sebelumKvaBeban: number | null;
  sebelumSuhu: number | null;
  sebelumTgl: string | null;
  sesudahPersen: number | null;
  sesudahKvaBeban: number | null;
  sesudahSuhu: number | null;
  sesudahTgl: string | null;
  sesudahDiukurUlang: boolean;
}

export interface WoTerbuka {
  pengukuranId: string;
  kodeGardu: string;
  ulp: string;
  namaGardu: string | null;
  penyulang: string | null;
  alamat: string | null;
  kvaTrafo: number | null;
  kvaMaster: number | null;
  noSeriMaster: string | null;
  merkMaster: string | null;
  persenBeban: number | null;
  bebanKva: number | null;
  suhu: number | null;
  tglUkur: string;
  woSentAt: string | null;
}

/** WO yang dibatalkan admin sebelum dikerjakan. */
export interface BatalWo {
  alasan: string;
  oleh: string | null;
  pada: string;
}

/** Satu baris tabel — WO yang belum dikerjakan, atau catatan yang terkirim. */
export interface BarisTabel {
  kunci: string;
  status: StatusTabel;
  kodeGardu: string;
  ulp: string;
  penyulang: string | null;
  sebelumPersen: number | null;
  sesudahPersen: number | null;
  wo: WoTerbuka | null;
  /** Terisi hanya untuk WO yang dibatalkan sebelum dikerjakan. */
  batal: BatalWo | null;
  catatan: CatatanOptimasi | null;
}

export interface AlasanRef {
  kode: string;
  label: string;
  urutan: number;
  aktif: boolean;
}

export interface UsulanMaster {
  id: string;
  field: string;
  nilaiLama: string | null;
  nilaiBaru: string | null;
  status: string;
  penilaiNama: string | null;
}

/** Isian yang boleh dikoreksi admin — gardu dan WO-nya tidak termasuk. */
export interface KoreksiOptimasi {
  kvaLama: number;
  kvaBaru: number;
  noSeriLama: string | null;
  seriLamaTakTerbaca: boolean;
  noSeriBaru: string;
  merkBaru: string | null;
  tahunBaru: number | null;
  asal: "GUDANG" | "GARDU";
  asalKode: string | null;
  asalUlp: string | null;
  tujuan: "GUDANG" | "GARDU" | "PERBAIKAN";
  tujuanKode: string | null;
  tujuanUlp: string | null;
  alasan: string;
  tglOperasi: string;
  catatan: string | null;
}

export type SaringStatus = "SEMUA" | StatusTabel;

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

export const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const dua = (n: number) => String(n).padStart(2, "0");
/** Hari terakhir bulan — dihitung, supaya Februari kabisat tidak terlewat. */
const akhirBulan = (tahun: number, bulan: number) => new Date(tahun, bulan, 0).getDate();

/**
 * Seluruh baris sebuah kueri, dipaginasi per 1.000 — lalu dikemas ke bentuk
 * `{ data, error }` seperti jawaban Supabase biasa.
 *
 * Bukan `.limit(500)`: batas diam-diam membuat catatan ke-501 ada di database
 * tapi tidak pernah tampil, tanpa tanda apa pun (teknisaplikasi.md butir 13).
 * Jumlahnya tetap terkendali karena setiap kueri dibatasi periode/penyaring.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pembangun kueri PostgREST
const semuaBaris = (buat: () => any) =>
  fetchAllRows<Record<string, unknown>>(buat).then(
    (data) => ({ data, error: null as { message: string } | null }),
    (e: Error) => ({ data: null as Record<string, unknown>[] | null, error: { message: e.message } }),
  );

const angka = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const teks = (v: unknown) => (v === null || v === undefined ? null : String(v));

/* eslint-disable @typescript-eslint/no-explicit-any -- baris mentah view PostgREST */
const petaCatatan = (r: any): CatatanOptimasi => ({
  id: r.id,
  pengukuranId: teks(r.pengukuran_id),
  kodeGardu: r.kode_gardu,
  ulp: r.ulp,
  penyulang: teks(r.penyulang),
  alamat: teks(r.alamat),
  kvaLama: Number(r.kva_lama),
  kvaBaru: Number(r.kva_baru),
  kvaLamaMaster: angka(r.kva_lama_master),
  noSeriLama: teks(r.no_seri_lama),
  seriLamaTakTerbaca: !!r.seri_lama_tak_terbaca,
  noSeriLamaMaster: teks(r.no_seri_lama_master),
  noSeriBaru: r.no_seri_baru,
  merkBaru: teks(r.merk_baru),
  tahunBaru: angka(r.tahun_baru),
  asal: r.asal_trafo,
  asalKode: teks(r.asal_kode_gardu),
  asalUlp: teks(r.asal_ulp),
  tujuan: r.tujuan_trafo_lama,
  tujuanKode: teks(r.tujuan_kode_gardu),
  tujuanUlp: teks(r.tujuan_ulp),
  alasan: r.alasan,
  alasanLabel: teks(r.alasan_label),
  tglOperasi: r.tgl_operasi ?? "",
  fotoLama: r.foto_nameplate_lama_url ?? "",
  fotoBaru: r.foto_nameplate_baru_url ?? "",
  lat: angka(r.lat),
  lng: angka(r.lng),
  statusDb: r.status ?? "Selesai",
  petugasNama: teks(r.petugas_nama),
  catatan: teks(r.catatan),
  verifiedBy: teks(r.verified_by),
  verifiedAt: teks(r.verified_at),
  usulanMenunggu: Number(r.usulan_menunggu ?? 0),
  usulanDisetujui: Number(r.usulan_disetujui ?? 0),
  jejakAsal: r.jejak_asal ?? null,
  jejakTujuan: r.jejak_tujuan ?? null,
  sebelumPersen: angka(r.sebelum_persen),
  sebelumKvaBeban: angka(r.sebelum_kva_beban),
  sebelumSuhu: angka(r.sebelum_suhu),
  sebelumTgl: teks(r.sebelum_tgl),
  sesudahPersen: angka(r.sesudah_persen),
  sesudahKvaBeban: angka(r.sesudah_kva_beban),
  sesudahSuhu: angka(r.sesudah_suhu),
  sesudahTgl: teks(r.sesudah_tgl),
  sesudahDiukurUlang: !!r.sesudah_diukur_ulang,
});

const petaWo = (r: any): WoTerbuka => ({
  pengukuranId: r.pengukuran_id,
  kodeGardu: r.no_gardu,
  ulp: r.ulp,
  namaGardu: teks(r.nama_gardu),
  penyulang: teks(r.penyulang),
  alamat: teks(r.alamat),
  kvaTrafo: angka(r.kva_trafo),
  kvaMaster: angka(r.kva_master),
  noSeriMaster: teks(r.no_seri_master),
  merkMaster: teks(r.merk_master),
  persenBeban: angka(r.persen_beban),
  bebanKva: angka(r.beban_kva),
  suhu: angka(r.suhu_trafo),
  tglUkur: r.tanggal_pengukuran ?? "",
  woSentAt: teks(r.wo_sent_at),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const barisDariCatatan = (c: CatatanOptimasi): BarisTabel => ({
  kunci: c.id,
  status: STATUS_DB[c.statusDb] ?? "Menunggu verifikasi",
  kodeGardu: c.kodeGardu,
  ulp: c.ulp,
  penyulang: c.penyulang,
  sebelumPersen: c.sebelumPersen,
  sesudahPersen: c.sesudahPersen,
  wo: null,
  batal: null,
  catatan: c,
});

// Kunci WO sama, dibatalkan atau belum: modal detail yang sedang terbuka tetap
// menunjuk baris yang sama sesudah tombol "Batalkan WO" ditekan.
const barisDariWo = (w: WoTerbuka, batal: BatalWo | null = null): BarisTabel => ({
  kunci: `wo:${w.pengukuranId}`,
  status: batal ? "Dibatalkan" : "Belum dikerjakan",
  kodeGardu: w.kodeGardu,
  ulp: w.ulp,
  penyulang: w.penyulang,
  sebelumPersen: w.persenBeban,
  sesudahPersen: null,
  wo: w,
  batal,
  catatan: null,
});

export function useOptimasiTrafo(user: CurrentUser) {
  const bolehSemua = canSeeAllUnits(user.role);

  const [catatan, setCatatan] = useState<CatatanOptimasi[]>([]);
  const [wo, setWo] = useState<WoTerbuka[]>([]);
  const [woBatal, setWoBatal] = useState<{ w: WoTerbuka; batal: BatalWo }[]>([]);
  const [alasan, setAlasan] = useState<AlasanRef[]>([]);
  const [loading, setLoading] = useState(true);
  /** Daftar catatan gagal dibaca — bukan daftar yang kosong. */
  const [galat, setGalat] = useState<string | null>(null);
  /** WO terbuka gagal dibaca; catatan tetap tampil, tapi harus dikatakan. */
  const [galatWo, setGalatWo] = useState<string | null>(null);
  const [ulp, gantiUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? ""));
  const [status, setStatus] = useState<SaringStatus>("SEMUA");
  const [cari, setCari] = useState("");
  const [nonce, setNonce] = useState(0);
  const sekarang = new Date();
  // Bawaan bulan berjalan (diminta 24 Sep 2026). 0 = sepanjang tahun.
  const [bulan, gantiBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, gantiTahun] = useState(sekarang.getFullYear());
  const tahunIni = sekarang.getFullYear();
  const daftarTahun = useMemo(() => [tahunIni, tahunIni - 1, tahunIni - 2], [tahunIni]);

  const daftarUlp = useMemo(
    () => (bolehSemua ? ["SEMUA", ...UNIT] : [user.unit ?? ""]),
    [bolehSemua, user.unit],
  );

  // Keadaan "memuat" dinyalakan oleh PEMICUNYA, bukan di dalam efek.
  const setUlp = (u: string) => { setLoading(true); gantiUlp(u); };
  const setBulan = (b: number) => { setLoading(true); gantiBulan(b); };
  const setTahun = (t: number) => { setLoading(true); gantiTahun(t); };
  const muat = () => { setLoading(true); setGalat(null); setNonce((n) => n + 1); };

  // Saring status dan cari dilakukan di peramban: datanya sudah di tangan, dan
  // mengganti chip status tidak boleh memuat ulang 500 baris dari server.
  //
  // Periode menyaring CATATAN menurut tanggal pekerjaannya. WO yang belum
  // dikerjakan SELALU tampil, berapa pun umurnya: itu tunggakan, dan tunggakan
  // yang hilang dari layar karena bulannya berganti tidak akan pernah ditagih.
  const tarik = useCallback(async () => {
    const awal = bulan === 0 ? `${tahun}-01-01` : `${tahun}-${dua(bulan)}-01`;
    const akhir = bulan === 0 ? `${tahun}-12-31` : `${tahun}-${dua(bulan)}-${dua(akhirBulan(tahun, bulan))}`;

    // Urutan diakhiri kolom UNIK: tanpa itu, baris bertanggal sama bisa
    // tertukar antarhalaman — ada yang muncul dua kali, ada yang hilang.
    const q = () => {
      let x = supabaseBrowser
        .from("optimasi_trafo_daftar")
        .select("*")
        .gte("tgl_operasi", awal)
        .lte("tgl_operasi", akhir)
        .order("tgl_operasi", { ascending: false })
        .order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };

    const qWo = () => {
      let x = supabaseBrowser
        .from("v_wo_optimasi_terbuka")
        .select("*")
        .order("wo_sent_at", { ascending: false })
        .order("pengukuran_id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };

    // WO batal disaring menurut TANGGAL DIBATALKAN — keputusan itulah
    // peristiwanya, bukan tanggal WO terbit.
    const qBatal = () => {
      let x = supabaseBrowser
        .from("v_wo_optimasi_batal")
        .select("*")
        .gte("dibatalkan_at", awal)
        .lte("dibatalkan_at", `${akhir}T23:59:59`)
        .order("dibatalkan_at", { ascending: false })
        .order("pengukuran_id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };

    const [dat, w, ref, bt] = await Promise.all([
      semuaBaris(q),
      semuaBaris(qWo),
      supabaseBrowser.from("optimasi_alasan_ref").select("kode,label,urutan,aktif").order("urutan"),
      semuaBaris(qBatal),
    ]);
    return { dat, w, ref, bt };
  }, [ulp, bulan, tahun]);

  const terapkan = useCallback(({ dat, w, ref, bt }: Awaited<ReturnType<typeof tarik>>) => {
    // teknisaplikasi.md butir 6: gagal ≠ kosong.
    setGalat(dat.error ? dat.error.message : null);
    setCatatan(dat.error ? [] : (dat.data ?? []).map(petaCatatan));
    setGalatWo(w.error ? w.error.message : null);
    setWo(w.error ? [] : (w.data ?? []).map(petaWo));
    // Gagal dibaca = digabung ke galat WO; yang terbaca tetap tampil.
    const galatBatal = bt.error?.message;
    if (galatBatal) setGalatWo((g) => g ?? galatBatal);
    setWoBatal(
      bt.error
        ? []
        : (bt.data ?? []).map((r) => ({
            w: petaWo(r),
            batal: {
              alasan: String(r.batal_alasan ?? ""),
              oleh: teks(r.batal_oleh),
              pada: String(r.dibatalkan_at ?? ""),
            },
          })),
    );
    setAlasan(
      (ref.data ?? []).map((r) => ({
        kode: r.kode as string,
        label: r.label as string,
        urutan: Number(r.urutan ?? 100),
        aktif: !!r.aktif,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    let hidup = true;
    tarik().then((h) => {
      if (hidup) terapkan(h);
    });
    return () => {
      hidup = false;
    };
  }, [tarik, terapkan, nonce]);

  const semua = useMemo(
    () => [
      ...wo.map((w) => barisDariWo(w)),
      ...catatan.map(barisDariCatatan),
      ...woBatal.map((x) => barisDariWo(x.w, x.batal)),
    ],
    [wo, catatan, woBatal],
  );

  const baris = useMemo(() => {
    const k = cari.trim().toUpperCase();
    return semua.filter(
      (b) =>
        (status === "SEMUA" || b.status === status) &&
        (!k || b.kodeGardu.toUpperCase().includes(k) || (b.penyulang ?? "").toUpperCase().includes(k)),
    );
  }, [semua, status, cari]);

  const hitung = useMemo(() => {
    const h = Object.fromEntries(STATUS_TABEL.map((s) => [s, 0])) as Record<StatusTabel, number>;
    for (const b of semua) h[b.status] += 1;
    return h;
  }, [semua]);

  /** Ambil ulang SATU catatan dari view lalu tambal di tempat — kolom turunan
   *  (usulan, jejak, beban sesudah) dihitung server, jadi tidak ditebak di sini. */
  const segarkanSatu = async (id: string) => {
    const { data, error } = await supabaseBrowser
      .from("optimasi_trafo_daftar")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return;
    const c = petaCatatan(data);
    setCatatan((p) => p.map((x) => (x.id === id ? c : x)));
  };

  const verifikasi = async (id: string, oleh: string) => {
    const { data, error } = await supabaseBrowser.rpc("verifikasi_optimasi_trafo", {
      p_id: id,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    await segarkanSatu(id);
    return Number(data ?? 0);
  };

  const batalkan = async (id: string, alasanBatal: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("batalkan_optimasi_trafo", {
      p_id: id,
      p_alasan: alasanBatal,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    await segarkanSatu(id);
  };

  /** Kembalikan ke petugas (teknisaplikasi.md butir 2): catatan muncul lagi
   *  di HP sebagai draf berisi isian lama; tidak dihitung sampai dikirim ulang. */
  const kembalikan = async (id: string, alasanKembali: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("kembalikan_optimasi_trafo", {
      p_id: id,
      p_alasan: alasanKembali,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    await segarkanSatu(id);
  };

  const pastikanJejak = async (id: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("pastikan_jejak_optimasi", {
      p_id: id,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    await segarkanSatu(id);
  };

  /** Koreksi admin — hanya selama menunggu verifikasi (dijaga server juga).
   *  Foto dan titik tidak disentuh dari web: keduanya bukti dari lapangan. */
  const koreksi = async (id: string, v: KoreksiOptimasi) => {
    const { error } = await supabaseBrowser.rpc("ubah_optimasi_trafo", {
      p_id: id,
      p_kva_lama: v.kvaLama,
      p_kva_baru: v.kvaBaru,
      p_no_seri_lama: v.noSeriLama,
      p_no_seri_baru: v.noSeriBaru,
      p_asal: v.asal,
      p_tujuan: v.tujuan,
      p_alasan: v.alasan,
      p_seri_lama_tak_terbaca: v.seriLamaTakTerbaca,
      p_merk_baru: v.merkBaru,
      p_tahun_baru: v.tahunBaru,
      p_asal_kode: v.asalKode,
      p_asal_ulp: v.asalUlp,
      p_tujuan_kode: v.tujuanKode,
      p_tujuan_ulp: v.tujuanUlp,
      p_tgl_mutasi: v.tglOperasi,
      p_tgl_operasi: v.tglOperasi,
      p_catatan: v.catatan,
    });
    if (error) throw new Error(error.message);
    await segarkanSatu(id);
  };

  // Stabil (useCallback): modal detail memakainya sebagai dependensi efek.
  /** Batalkan WO yang belum dikerjakan. Ditambal di tempat: barisnya pindah
   *  dari "Belum dikerjakan" ke "Dibatalkan" tanpa memuat ulang tabel. */
  const batalkanWo = async (w: WoTerbuka, alasanBatal: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("batalkan_wo_optimasi", {
      p_pengukuran_id: w.pengukuranId,
      p_alasan: alasanBatal,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    setWo((p) => p.filter((x) => x.pengukuranId !== w.pengukuranId));
    setWoBatal((p) => [{ w, batal: { alasan: alasanBatal, oleh, pada: new Date().toISOString() } }, ...p]);
  };

  const ambilUsulan = useCallback(async (id: string): Promise<UsulanMaster[]> => {
    const { data, error } = await supabaseBrowser
      .from("master_usulan")
      .select("id,field,nilai_lama,nilai_baru,status,penilai_nama")
      .eq("sumber_modul", "optimasi_trafo")
      .eq("sumber_id", id)
      .order("field");
    if (error) throw new Error(error.message);
    return (data ?? []).map((u) => ({
      id: u.id as string,
      field: u.field as string,
      nilaiLama: teks((u.nilai_lama as { nilai?: unknown } | null)?.nilai),
      nilaiBaru: teks((u.nilai_baru as { nilai?: unknown } | null)?.nilai),
      status: u.status as string,
      penilaiNama: teks(u.penilai_nama),
    }));
  }, []);

  const simpanAlasan = async (a: AlasanRef, baru: boolean) => {
    const isi = { ...a, updated_at: new Date().toISOString() };
    const { error } = baru
      ? await supabaseBrowser.from("optimasi_alasan_ref").insert(isi)
      : await supabaseBrowser.from("optimasi_alasan_ref").update(isi).eq("kode", a.kode);
    if (error) throw new Error(error.message);
    setAlasan((p) => [...p.filter((x) => x.kode !== a.kode), a].sort((x, y) => x.urutan - y.urutan));
  };

  return {
    baris, semua, hitung, alasan, loading, galat, galatWo,
    ulp, setUlp, daftarUlp, status, setStatus, cari, setCari,
    bulan, setBulan, tahun, setTahun, daftarTahun,
    muat, verifikasi, batalkan, kembalikan, batalkanWo, pastikanJejak, koreksi, ambilUsulan, simpanAlasan,
  };
}
