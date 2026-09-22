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
  /** Yang dihitung: "segmen", "gardu", "item". Ditulis supaya angka di satu
   *  baris tidak dikira sebanding dengan baris lain. */
  satuan: string;
  woTerbit: number | null;
  realisasi: number | null;
  belumApprove: number | null;
  /** Kenapa belum ada, atau apa persisnya yang dihitung. */
  catatan: string;
}

/** Bentuk baris yang ditarik tiap sumber — sempit, cuma yang dipakai. */
interface BarisRabas {
  item: number | null;
  item_selesai: number | null;
}
interface BarisUkur {
  terealisasi: boolean | null;
  tertahan: boolean | null;
}
interface BarisStatus {
  status: string | null;
}

const persen = (r: number | null, w: number | null) =>
  r === null || w === null || w === 0 ? null : Math.round((r / w) * 100);

export function kolomPersen(b: BarisKinerja) {
  return persen(b.realisasi, b.woTerbit);
}

interface Hasil {
  baris: BarisKinerja[];
  loading: boolean;
  tahun: number;
  setTahun: (t: number) => void;
  ulp: string;
  setUlp: (u: string) => void;
  daftarUlp: string[];
  daftarTahun: number[];
  muatUlang: () => void;
}

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

export function useKinerjaYantek(user: CurrentUser): Hasil {
  const bolehSemua = canSeeAllUnits(user.role);
  const tahunIni = new Date().getFullYear();

  const [tahun, setTahun] = useState(tahunIni);
  const [ulp, setUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? ""));
  const [baris, setBaris] = useState<BarisKinerja[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const daftarUlp = useMemo(
    () => (bolehSemua ? ["SEMUA", ...UNIT] : [user.unit ?? ""]),
    [bolehSemua, user.unit],
  );
  const daftarTahun = useMemo(
    () => [tahunIni, tahunIni - 1, tahunIni - 2],
    [tahunIni],
  );

  const muat = useCallback(async (masihBerlaku: () => boolean) => {
    setLoading(true);

    // Saringan ULP dipasang PER KUERI dengan `let`, bukan lewat satu pembantu
    // bergenerik. Pembantu itu sempat ditulis dan TypeScript menyerah padanya —
    // "type instantiation is excessively deep": tipe pembangun kueri PostgREST
    // sudah berlapis-lapis sendiri, dan membungkusnya dalam generik membuatnya
    // berulang tanpa henti. Enam baris `if` lebih panjang, tapi tipenya utuh.
    const unit = ulp === "SEMUA" ? null : ulp;
    const awal = `${tahun}-01-01`;
    const akhir = `${tahun}-12-31`;
    const akhirJam = `${akhir}T23:59:59`;

    // ── 1. Perabasan Pohon ────────────────────────────────────────────────
    // `wo_perabasan_capaian` sudah menghitung item dan item_selesai per WO;
    // yang dijumlah di sini item-nya, bukan WO-nya. Satu WO bisa berisi 20
    // segmen, dan "1 WO terbit" tidak memberi tahu siapa pun berapa banyak
    // pekerjaan yang sebenarnya diterbitkan.
    let qRabas = supabaseBrowser
      .from("wo_perabasan_capaian")
      .select("item,item_selesai")
      .gte("tgl_wo", awal)
      .lte("tgl_wo", akhir);
    if (unit) qRabas = qRabas.eq("ulp", unit);

    // ── 2. Pengukuran beban ───────────────────────────────────────────────
    let qUkur = supabaseBrowser
      .from("wo_pengukuran_realisasi")
      .select("terealisasi,tertahan")
      .eq("tahun", tahun);
    if (unit) qUkur = qUkur.eq("ulp", unit);

    // ── 3. Pemeliharaan Gardu ─────────────────────────────────────────────
    let qGardu = supabaseBrowser
      .from("pemeliharaan_gardu")
      .select("status")
      .gte("created_at", awal)
      .lte("created_at", akhirJam);
    if (unit) qGardu = qGardu.eq("ulp", unit);

    // ── 4. Penyeimbangan Beban Trafo ──────────────────────────────────────
    let qSeimbang = supabaseBrowser
      .from("penyeimbangan_gardu")
      .select("id")
      .gte("created_at", awal)
      .lte("created_at", akhirJam);
    if (unit) qSeimbang = qSeimbang.eq("ulp", unit);

    // ── 5. Inspeksi JTM & JTR ─────────────────────────────────────────────
    let qJtm = supabaseBrowser
      .from("inspeksi_jtm")
      .select("status")
      .gte("created_at", awal)
      .lte("created_at", akhirJam);
    if (unit) qJtm = qJtm.eq("ulp", unit);

    let qJtr = supabaseBrowser
      .from("inspeksi_jtr")
      .select("status")
      .gte("created_at", awal)
      .lte("created_at", akhirJam);
    if (unit) qJtr = qJtr.eq("ulp", unit);

    const [rabas, ukur, gardu, seimbang, jtm, jtr] = await Promise.all([
      qRabas, qUkur, qGardu, qSeimbang, qJtm, qJtr,
    ]);

    // Enam kueri untuk enam sumber, dan tahun bisa diganti di tengahnya.
    // Tanpa penjaga ini, jawaban tahun lama yang datang belakangan akan menimpa
    // tahun baru — tabelnya terlihat wajar, angkanya milik tahun yang salah,
    // dan tidak ada apa pun di layar yang menunjukkan itu terjadi.
    if (!masihBerlaku()) return;

    // Galat tidak dilempar: satu tabel yang belum ada tidak boleh mengosongkan
    // seluruh tabel rekap. Barisnya saja yang jadi kosong.
    const isi = <T,>(r: { data: T[] | null; error: unknown }): T[] =>
      r.error ? [] : (r.data ?? []);

    const r1 = isi<BarisRabas>(rabas);
    const r2 = isi<BarisUkur>(ukur);
    const r3 = isi<BarisStatus>(gardu);
    const r4 = isi<{ id: string }>(seimbang);
    const r5 = isi<BarisStatus>(jtm);
    const r6 = isi<BarisStatus>(jtr);

    const jum = <T,>(a: T[], f: (x: T) => number) => a.reduce((n, x) => n + f(x), 0);
    const hitung = <T,>(a: T[], f: (x: T) => boolean) => a.filter(f).length;

    // Selesai = sudah dikerjakan; Diverifikasi = sudah disetujui admin.
    // "Belum approve" adalah selisihnya, dan itulah angka yang menunjukkan
    // pekerjaan yang menunggu di meja admin, bukan di lapangan.
    const selesaiJtm = hitung(r5, (x) => x.status === "Selesai" || x.status === "Diverifikasi");
    const selesaiJtr = hitung(r6, (x) => x.status === "Selesai" || x.status === "Diverifikasi");

    setBaris([
      {
        kunci: "perabasan",
        jenis: "Perabasan Pohon",
        href: "/admin/wo-perabasan",
        keadaan: "lengkap",
        satuan: "item segmen",
        woTerbit: jum(r1, (x) => Number(x.item ?? 0)),
        realisasi: jum(r1, (x) => Number(x.item_selesai ?? 0)),
        belumApprove: 0,
        catatan: "Dari WO Perabasan. Belum punya tahap persetujuan — selesai berarti selesai.",
      },
      {
        kunci: "harjtm",
        jenis: "Pemeliharaan JTM/JTR",
        href: null,
        keadaan: "belumAda",
        satuan: "—",
        woTerbit: null,
        realisasi: null,
        belumApprove: null,
        catatan:
          "Belum ada modulnya. Temuan inspeksi JTM/JTR sudah tercatat, tapi eksekusi perbaikannya belum punya WO sendiri.",
      },
      {
        kunci: "hargardu",
        jenis: "Pemeliharaan Gardu",
        href: "/admin/hargardu",
        keadaan: "tanpaWo",
        satuan: "gardu",
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
        satuan: "penyapuan segmen",
        woTerbit: null,
        realisasi: selesaiJtm,
        belumApprove: hitung(r5, (x) => x.status === "Selesai"),
        catatan:
          "Penyapuan lahir saat regu membuka segmennya, belum diterbitkan lewat WO — jadi belum ada pembanding target.",
      },
      {
        kunci: "jtr",
        jenis: "Inspeksi JTR",
        href: "/admin/jtr",
        keadaan: "tanpaWo",
        satuan: "penyapuan gardu",
        woTerbit: null,
        realisasi: selesaiJtr,
        belumApprove: hitung(r6, (x) => x.status === "Selesai"),
        catatan:
          "Sama seperti JTM: penyapuan lahir dari lapangan, belum diterbitkan lewat WO.",
      },
    ]);
    setLoading(false);
  }, [tahun, ulp]);

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
    ulp,
    setUlp,
    daftarUlp,
    daftarTahun,
    muatUlang: () => setNonce((n) => n + 1),
  };
}
