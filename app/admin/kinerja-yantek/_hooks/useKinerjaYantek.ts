"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";

/**
 * Rekap kinerja delapan jenis pekerjaan Pelayanan Teknik.
 *
 * ── KENAPA TIAP BARIS PUNYA SUMBERNYA SENDIRI ───────────────────────────────
 * Akan menggoda untuk menarik semuanya dari satu tabel WO. Tapi kenyataannya
 * belum begitu: perabasan dan pengukuran sudah punya sistem WO-nya SENDIRI
 * (`wo_perabasan`, `wo_pengukuran`) yang dibangun lebih dulu, sementara
 * inspeksi JTM/JTR dan pemeliharaan gardu belum punya konsep WO sama sekali —
 * pekerjaannya lahir saat regu membuka layarnya.
 *
 * Memaksa delapannya lewat satu tabel berarti mengarang angka untuk yang
 * belum punya. Jadi tiap baris menyebut sumbernya sendiri, dan yang belum ada
 * MENGATAKAN bahwa dia belum ada.
 *
 * ── SATUANNYA BERBEDA, DAN ITU BUKAN KELALAIAN ──────────────────────────────
 * Perabasan dan inspeksi JTM/JTR dihitung dalam KMS — itu panjang jaringan
 * yang disisir, dan jumlah segmennya tidak berarti apa-apa (satu segmen bisa
 * 0,3 km, yang lain 12 km). Pengukuran, pemeliharaan gardu, dan penyeimbangan
 * dihitung per GARDU, karena pekerjaannya memang per gardu.
 *
 * Satuan ditulis di tiap baris justru supaya tidak ada yang menjumlahkannya.
 *
 * ── TABEL INI SEKALIGUS DAFTAR PEKERJAAN RUMAH ──────────────────────────────
 * Itu disengaja dan diminta. Baris yang modulnya belum dibangun tidak
 * disembunyikan — dia muncul dengan tanda "belum ada", supaya yang hilang
 * terlihat di layar yang sama dengan yang sudah jalan. Daftar PR yang hidup
 * terpisah dari angkanya selalu berhenti dibaca.
 */

/** Keadaan sebuah baris — menentukan apa yang boleh ditampilkan sebagai angka. */
export type Keadaan =
  /** Punya WO dan punya realisasi: keempat kolomnya berarti. */
  | "lengkap"
  /** Pekerjaannya tercatat, tapi belum ada WO yang menerbitkannya. */
  | "tanpaWo"
  /** Modulnya belum dibangun. */
  | "belumAda";

export interface BarisKinerja {
  kunci: string;
  jenis: string;
  /** Tautan ke modulnya — null kalau belum ada. */
  href: string | null;
  keadaan: Keadaan;
  /** "km", "gardu", "penyapuan gardu". Ditulis supaya angka di satu baris
   *  tidak dikira sebanding dengan baris lain. */
  satuan: string;
  /** Angka pecahan (km) atau cacah bulat. Menentukan cara menuliskannya. */
  desimal: boolean;
  woTerbit: number | null;
  realisasi: number | null;
  belumApprove: number | null;
  /** Kenapa belum ada, atau apa persisnya yang dihitung. */
  catatan: string;
}

/** Bentuk baris yang ditarik tiap sumber — sempit, cuma yang dipakai. */
interface BarisRabas {
  target_km: number | null;
  capaian_km: number | null;
}
interface BarisUkur {
  terealisasi: boolean | null;
  tertahan: boolean | null;
}
interface BarisStatus {
  status: string | null;
}
interface BarisJtm {
  status: string | null;
  segmen_id: string | null;
}
interface BarisJtr {
  status: string | null;
  gardu_kode: string | null;
}

const persen = (r: number | null, w: number | null) =>
  r === null || w === null || w === 0 ? null : Math.round((r / w) * 100);

export function kolomPersen(b: BarisKinerja) {
  return persen(b.realisasi, b.woTerbit);
}

export const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

interface Hasil {
  baris: BarisKinerja[];
  loading: boolean;
  tahun: number;
  setTahun: (t: number) => void;
  /** 0 = seluruh tahun. */
  bulan: number;
  setBulan: (b: number) => void;
  ulp: string;
  setUlp: (u: string) => void;
  daftarUlp: string[];
  daftarTahun: number[];
  muatUlang: () => void;
}

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

/** Hari terakhir sebuah bulan — dihitung, bukan ditabelkan, supaya Februari
 *  kabisat tidak jadi kasus khusus yang terlewat sekali dalam empat tahun. */
const akhirBulan = (tahun: number, bulan: number) =>
  new Date(tahun, bulan, 0).getDate();

const dua = (n: number) => String(n).padStart(2, "0");

export function useKinerjaYantek(user: CurrentUser): Hasil {
  const bolehSemua = canSeeAllUnits(user.role);
  const tahunIni = new Date().getFullYear();

  const [tahun, setTahun] = useState(tahunIni);
  const [bulan, setBulan] = useState(0);
  const [ulp, setUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? ""));
  const [baris, setBaris] = useState<BarisKinerja[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const daftarUlp = useMemo(
    () => (bolehSemua ? ["SEMUA", ...UNIT] : [user.unit ?? ""]),
    [bolehSemua, user.unit],
  );
  const daftarTahun = useMemo(() => [tahunIni, tahunIni - 1, tahunIni - 2], [tahunIni]);

  const muat = useCallback(async (masihBerlaku: () => boolean) => {
    setLoading(true);

    // Saringan ULP dipasang PER KUERI dengan `let`, bukan lewat satu pembantu
    // bergenerik. Pembantu itu sempat ditulis dan TypeScript menyerah padanya —
    // "type instantiation is excessively deep": tipe pembangun kueri PostgREST
    // sudah berlapis-lapis sendiri, dan membungkusnya dalam generik membuatnya
    // berulang tanpa henti. Beberapa baris `if` lebih panjang, tapi tipenya utuh.
    const unit = ulp === "SEMUA" ? null : ulp;

    // Rentang tanggal ditutup di satu tempat: bulan 0 berarti seluruh tahun.
    const awal = bulan === 0 ? `${tahun}-01-01` : `${tahun}-${dua(bulan)}-01`;
    const akhir =
      bulan === 0
        ? `${tahun}-12-31`
        : `${tahun}-${dua(bulan)}-${dua(akhirBulan(tahun, bulan))}`;
    const akhirJam = `${akhir}T23:59:59`;

    // ── 1. Perabasan Pohon — KMS ──────────────────────────────────────────
    // `target_km` yang dibandingkan, bukan `rencana_km`: capaian_persen di view
    // perabasan juga memakai target_km, dan dua angka capaian yang berbeda
    // untuk pekerjaan yang sama adalah cara tercepat membuat orang berhenti
    // mempercayai keduanya.
    let qRabas = supabaseBrowser
      .from("wo_perabasan_capaian")
      .select("target_km,capaian_km")
      .gte("tgl_wo", awal)
      .lte("tgl_wo", akhir);
    if (unit) qRabas = qRabas.eq("ulp", unit);

    // ── 2. Pengukuran beban — per gardu ───────────────────────────────────
    let qUkur = supabaseBrowser
      .from("wo_pengukuran_realisasi")
      .select("terealisasi,tertahan")
      .eq("tahun", tahun);
    if (bulan !== 0) qUkur = qUkur.eq("bulan", bulan);
    if (unit) qUkur = qUkur.eq("ulp", unit);

    // ── 3. Pemeliharaan Gardu ─────────────────────────────────────────────
    let qGardu = supabaseBrowser
      .from("pemeliharaan_gardu")
      .select("status")
      .gte("created_at", awal)
      .lte("created_at", akhirJam);
    if (unit) qGardu = qGardu.eq("ulp", unit);

    // ── 3b. Pemeliharaan Jaringan JTM/JTR ─────────────────────────────────
    let qHarJar = supabaseBrowser
      .from("pemeliharaan_jaringan")
      .select("status")
      .neq("status", "Dibatalkan")
      .gte("tgl", awal)
      .lte("tgl", akhir);
    if (unit) qHarJar = qHarJar.eq("ulp", unit);

    // ── 4. Penyeimbangan Beban Trafo ──────────────────────────────────────
    let qSeimbang = supabaseBrowser
      .from("penyeimbangan_gardu")
      .select("id")
      .gte("created_at", awal)
      .lte("created_at", akhirJam);
    if (unit) qSeimbang = qSeimbang.eq("ulp", unit);

    // ── 5. Inspeksi JTM & JTR — KMS ───────────────────────────────────────
    // Panjangnya tidak ada di tabel inspeksi; dia milik segmen (JTM) dan gardu
    // (JTR). Jadi ditarik dua langkah: inspeksinya dulu, lalu panjang yang
    // menyangkut inspeksi itu saja lewat `.in(...)` — bukan seluruh tabel
    // panjang, yang kelak berisi ribuan baris untuk menjawab sepuluh.
    let qJtm = supabaseBrowser
      .from("inspeksi_jtm")
      .select("status,segmen_id")
      .gte("created_at", awal)
      .lte("created_at", akhirJam);
    if (unit) qJtm = qJtm.eq("ulp", unit);

    let qJtr = supabaseBrowser
      .from("inspeksi_jtr")
      .select("status,gardu_kode")
      .gte("created_at", awal)
      .lte("created_at", akhirJam);
    if (unit) qJtr = qJtr.eq("ulp", unit);

    const [rabas, ukur, gardu, harjar, seimbang, jtm, jtr] = await Promise.all([
      qRabas, qUkur, qGardu, qHarJar, qSeimbang, qJtm, qJtr,
    ]);

    // Enam kueri untuk enam sumber, dan tahun/bulan bisa diganti di tengahnya.
    // Tanpa penjaga ini, jawaban rentang lama yang datang belakangan akan
    // menimpa yang baru — tabelnya terlihat wajar, angkanya milik bulan yang
    // salah, dan tidak ada apa pun di layar yang menunjukkan itu terjadi.
    if (!masihBerlaku()) return;

    // Galat tidak dilempar: satu tabel yang belum ada tidak boleh mengosongkan
    // seluruh tabel rekap. Barisnya saja yang jadi kosong.
    const isi = <T,>(r: { data: T[] | null; error: unknown }): T[] =>
      r.error ? [] : (r.data ?? []);

    const r1 = isi<BarisRabas>(rabas);
    const r2 = isi<BarisUkur>(ukur);
    const r3 = isi<BarisStatus>(gardu);
    const r3b = isi<BarisStatus>(harjar);
    const r4 = isi<{ id: string }>(seimbang);
    const r5 = isi<BarisJtm>(jtm);
    const r6 = isi<BarisJtr>(jtr);

    const jum = <T,>(a: T[], f: (x: T) => number) => a.reduce((n, x) => n + f(x), 0);
    const hitung = <T,>(a: T[], f: (x: T) => boolean) => a.filter(f).length;
    const bulat3 = (v: number) => Math.round(v * 1000) / 1000;

    // Selesai = sudah dikerjakan; Diverifikasi = sudah disetujui admin.
    // "Belum approve" adalah selisihnya, dan itulah angka yang menunjukkan
    // pekerjaan yang menunggu di meja admin, bukan di lapangan.
    const usai = (s: string | null) => s === "Selesai" || s === "Diverifikasi";

    // ── Panjang JTM ───────────────────────────────────────────────────────
    const segUsai = r5.filter((x) => usai(x.status) && x.segmen_id).map((x) => x.segmen_id!);
    const segNunggu = r5.filter((x) => x.status === "Selesai" && x.segmen_id).map((x) => x.segmen_id!);
    let kmJtm = 0;
    let kmJtmNunggu = 0;
    if (segUsai.length > 0) {
      const { data } = await supabaseBrowser
        .from("segmen_panjang")
        .select("segmen_id,panjang_pakai_km")
        .in("segmen_id", [...new Set(segUsai)]);
      const peta = new Map((data ?? []).map((s) => [s.segmen_id as string, Number(s.panjang_pakai_km ?? 0)]));
      kmJtm = bulat3(jum(segUsai, (id) => peta.get(id) ?? 0));
      kmJtmNunggu = bulat3(jum(segNunggu, (id) => peta.get(id) ?? 0));
    }

    // ── Panjang JTR ───────────────────────────────────────────────────────
    // Panjang per gardu dijumlah dari `gardu_jtr_penghantar`, yang sudah
    // memecahnya per jurusan dan per nomor kabel. Nomor kabel >1 adalah
    // underbuild — ikut dijumlah, karena kabel kedua di tiang yang sama tetap
    // penghantar yang harus disisir.
    const garduUsai = r6.filter((x) => usai(x.status) && x.gardu_kode).map((x) => x.gardu_kode!);
    const garduNunggu = r6.filter((x) => x.status === "Selesai" && x.gardu_kode).map((x) => x.gardu_kode!);
    let kmJtr = 0;
    let kmJtrNunggu = 0;
    if (garduUsai.length > 0) {
      const { data } = await supabaseBrowser
        .from("gardu_jtr_penghantar")
        .select("gardu_kode,panjang_km")
        .in("gardu_kode", [...new Set(garduUsai)]);
      const peta = new Map<string, number>();
      for (const g of data ?? []) {
        const k = g.gardu_kode as string;
        peta.set(k, (peta.get(k) ?? 0) + Number(g.panjang_km ?? 0));
      }
      kmJtr = bulat3(jum(garduUsai, (k) => peta.get(k) ?? 0));
      kmJtrNunggu = bulat3(jum(garduNunggu, (k) => peta.get(k) ?? 0));
    }

    if (!masihBerlaku()) return;

    setBaris([
      {
        kunci: "perabasan",
        jenis: "Perabasan Pohon",
        href: "/admin/wo-perabasan",
        keadaan: "lengkap",
        satuan: "km",
        desimal: true,
        woTerbit: bulat3(jum(r1, (x) => Number(x.target_km ?? 0))),
        realisasi: bulat3(jum(r1, (x) => Number(x.capaian_km ?? 0))),
        belumApprove: 0,
        catatan: "Target dan capaian km dari WO Perabasan. Belum punya tahap persetujuan.",
      },
      {
        kunci: "harjtm",
        jenis: "Pemeliharaan Jaringan",
        href: "/admin/pemeliharaan-jaringan",
        keadaan: "tanpaWo",
        satuan: "pekerjaan",
        desimal: false,
        woTerbit: null,
        realisasi: r3b.length,
        belumApprove: hitung(r3b, (x) => x.status === "Selesai"),
        catatan:
          "Dicatat regu dari lapangan berikut foto sebelum-sesudah. Belum diterbitkan lewat WO, jadi belum ada pembanding target.",
      },
      {
        kunci: "hargardu",
        jenis: "Pemeliharaan Gardu",
        href: "/admin/hargardu",
        keadaan: "tanpaWo",
        satuan: "gardu",
        desimal: false,
        woTerbit: null,
        realisasi: r3.length,
        belumApprove: hitung(r3, (x) => x.status === "Selesai"),
        catatan:
          "Pekerjaannya tercatat, tapi belum ada WO yang menerbitkannya — jadi capaian belum bisa dihitung terhadap target.",
      },
      {
        kunci: "penyeimbangan",
        jenis: "Penyeimbangan Beban Trafo",
        href: "/admin/pengukuran-gardu",
        keadaan: "tanpaWo",
        satuan: "gardu",
        desimal: false,
        woTerbit: null,
        realisasi: r4.length,
        belumApprove: null,
        catatan:
          "Tercatat sebagai tindak lanjut anomali pengukuran, belum sebagai pekerjaan ber-WO sendiri.",
      },
      {
        kunci: "optimasi",
        jenis: "Optimasi Trafo",
        href: null,
        keadaan: "belumAda",
        satuan: "—",
        desimal: false,
        woTerbit: null,
        realisasi: null,
        belumApprove: null,
        catatan: "Belum ada modulnya, di web maupun di HP.",
      },
      {
        kunci: "pengukuran",
        jenis: "Pengukuran beban & tegangan ujung",
        href: "/admin/pengukuran-gardu",
        keadaan: "lengkap",
        satuan: "gardu",
        desimal: false,
        woTerbit: r2.length,
        realisasi: hitung(r2, (x) => !!x.terealisasi),
        belumApprove: hitung(r2, (x) => !!x.tertahan),
        catatan:
          "Angka ini BEBAN saja. Tegangan ujung belum punya tempat sendiri — belum diukur, belum tercatat.",
      },
      {
        kunci: "jtm",
        jenis: "Inspeksi JTM",
        href: "/admin/jtm",
        keadaan: "tanpaWo",
        satuan: "km",
        desimal: true,
        woTerbit: null,
        realisasi: kmJtm,
        belumApprove: kmJtmNunggu,
        catatan:
          "Panjang segmen yang penyapuannya selesai. Penyapuan lahir saat regu membuka segmennya, belum diterbitkan lewat WO — jadi belum ada pembanding target.",
      },
      {
        kunci: "jtr",
        jenis: "Inspeksi JTR",
        href: "/admin/jtr",
        keadaan: "tanpaWo",
        satuan: "km",
        desimal: true,
        woTerbit: null,
        realisasi: kmJtr,
        belumApprove: kmJtrNunggu,
        catatan:
          "Panjang penghantar gardu yang penyapuannya selesai, termasuk underbuild. Sama seperti JTM: belum diterbitkan lewat WO.",
      },
    ]);
    setLoading(false);
  }, [tahun, bulan, ulp]);

  useEffect(() => {
    let hidup = true;
    void muat(() => hidup);
    return () => {
      hidup = false;
    };
  }, [muat, nonce]);

  return {
    baris,
    loading,
    tahun,
    setTahun,
    bulan,
    setBulan,
    ulp,
    setUlp,
    daftarUlp,
    daftarTahun,
    muatUlang: () => setNonce((n) => n + 1),
  };
}
