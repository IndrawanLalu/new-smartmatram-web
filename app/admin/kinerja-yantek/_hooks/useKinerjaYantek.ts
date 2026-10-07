"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";

/**
 * Rekap kinerja sebelas jenis pekerjaan Pelayanan Teknik (sama dengan surat WO).
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
 * ── ANGKANYA LAHIR DI DATABASE (sejak 25 Sep 2026) ──────────────────────────
 * Dihitung fungsi `rekap_kinerja` (`scripts/hp-kirim-rekap.sql`), yang juga
 * dipakai Beranda HP. Dulu dihitung di sini dari sebelas kueri — menyalinnya
 * ke HP berarti dua salinan yang pasti melenceng. Label, satuan, dan
 * keterangan tiap baris tetap milik layar ini.
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
  /** Dinilai terhadap SLA saja. Inspeksi JTR: WO-nya disusun dari jalur yang
   *  dikerjakan, jadi WO = realisasi dan capaian WO selalu 100% — angka itu
   *  tidak berarti apa-apa dan menutupi capaian SLA (keputusan user 7 Okt 2026,
   *  sama dengan Beranda HP). */
  dinilaiSla?: boolean;
  /** Inspeksi JTR saja: jumlah gardu di WO. WO dari sistem belum tentu membawa
   *  KMS (panjang penghantar gardu belum terukur), sehingga WO yang ada tampil
   *  "0 KMS" — jumlah gardunya yang menunjukkan WO itu ada. */
  woGardu?: number | null;
  /** SLA periode ini — target bulanan per ULP yang diisi UP3/admin ULP
   *  (`sla_kinerja`), dijumlah untuk seluruh tahun / semua ULP. null = belum
   *  ada SLA. */
  sla: number | null;
  realisasi: number | null;
  belumApprove: number | null;
  /** Sumbernya gagal dibaca. Angkanya dikosongkan, BUKAN ditulis nol —
   *  nol yang dikarang tidak bisa dibedakan dari kinerja yang benar nihil. */
  gagal?: boolean;
  /** Kenapa belum ada, atau apa persisnya yang dihitung. */
  catatan: string;
}

const persen = (r: number | null, w: number | null) =>
  r === null || w === null || w === 0 ? null : Math.round((r / w) * 100);

/** Capaian WO = realisasi ÷ WO terbit. Kosong untuk baris yang dinilai
 *  terhadap SLA saja. */
export function capaianWo(b: BarisKinerja) {
  return b.dinilaiSla ? null : persen(b.realisasi, b.woTerbit);
}

/** Capaian SLA = SEMUA realisasi (WO + di luar WO) ÷ SLA — keputusan user
 *  25 Sep 2026. */
export function capaianSla(b: BarisKinerja) {
  return persen(b.realisasi, b.sla);
}

export const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Label & keterangan tiap baris — urutan di sini = urutan di layar, SAMA
 *  dengan urutan surat WO (`_lib/woSurat.ts`, ditetapkan user 29 Sep 2026). */
const META: Omit<BarisKinerja, "woTerbit" | "sla" | "realisasi" | "belumApprove">[] = [
  {
    kunci: "perabasan",
    jenis: "Perabasan Pohon",
    href: "/admin/wo-perabasan",
    keadaan: "lengkap",
    satuan: "KMS",
    desimal: true,
    catatan: "Target dan capaian KMS dari WO Perabasan. Belum punya tahap persetujuan.",
  },
  {
    kunci: "harjtm",
    jenis: "Pemeliharaan Jaringan",
    href: "/admin/pemeliharaan-jaringan",
    keadaan: "tanpaWo",
    satuan: "pekerjaan",
    desimal: false,
    catatan:
      "WO dari tempelan Excel di Cetak / Kirim WO. Realisasi dicatat regu dari lapangan berikut foto sebelum-sesudah.",
  },
  {
    kunci: "hargardu",
    jenis: "Pemeliharaan Gardu",
    href: "/admin/hargardu",
    keadaan: "lengkap",
    satuan: "gardu",
    desimal: false,
    catatan: "WO Pemeliharaan bulanan. Realisasi = gardu WO yang pemeliharaannya sudah dikirim regu di bulan WO-nya.",
  },
  {
    kunci: "penyeimbangan",
    jenis: "Penyeimbangan Beban Trafo",
    href: "/admin/pengukuran-gardu",
    keadaan: "tanpaWo",
    satuan: "gardu",
    desimal: false,
    catatan: "WO dari tempelan Excel di Cetak / Kirim WO. Realisasi = tindak lanjut anomali pengukuran.",
  },
  {
    kunci: "optimasi",
    jenis: "Optimasi Trafo",
    href: "/admin/optimasi-trafo",
    keadaan: "lengkap",
    satuan: "gardu",
    desimal: false,
    catatan:
      "WO = gardu yang ditandai OPTIMASI TRAFO di Tindak Lanjut Anomali pada periode ini, tanpa WO yang dibatalkan. Realisasi = catatan terkirim dari HP, termasuk yang di luar WO — jadi bisa melampaui WO-nya.",
  },
  {
    kunci: "jtm",
    jenis: "Inspeksi JTM Tier 1",
    href: "/admin/jtm",
    keadaan: "tanpaWo",
    satuan: "KMS",
    desimal: true,
    catatan:
      "WO = WO Inspeksi JTM (disusun di aplikasi atau ditempel) + tempelan yang segmennya belum ada di master. Realisasi = panjang segmen yang inspeksi tier 1-nya selesai.",
  },
  {
    kunci: "jtm2",
    jenis: "Inspeksi JTM Tier 2",
    href: null,
    keadaan: "tanpaWo",
    satuan: "KMS",
    desimal: true,
    catatan: "WO dari tempelan Excel. Modulnya belum berjalan — realisasi dicentang per segmen di web.",
  },
  {
    kunci: "jtr",
    jenis: "Inspeksi JTR",
    href: "/admin/jtr",
    keadaan: "tanpaWo",
    satuan: "KMS",
    desimal: true,
    dinilaiSla: true,
    catatan:
      "Panjang penghantar gardu yang penyapuannya selesai, termasuk underbuild. WO dari WO Inspeksi JTR.",
  },
  {
    kunci: "igardu1",
    jenis: "Inspeksi Gardu Tier 1",
    href: null,
    keadaan: "tanpaWo",
    satuan: "gardu",
    desimal: false,
    catatan: "WO dari tempelan Excel. Modulnya belum ada — realisasi dicentang per gardu di web.",
  },
  {
    kunci: "igardu2",
    jenis: "Inspeksi Gardu Tier 2",
    href: null,
    keadaan: "tanpaWo",
    satuan: "gardu",
    desimal: false,
    catatan: "WO dari tempelan Excel. Modulnya belum ada — realisasi dicentang per gardu di web.",
  },
  {
    kunci: "pengukuran",
    jenis: "Pengukuran Beban Gardu dan Tegangan Ujung",
    href: "/admin/pengukuran-gardu",
    keadaan: "lengkap",
    satuan: "gardu",
    desimal: false,
    catatan: "WO Pengukuran bulanan. Realisasi = gardu WO yang pengukurannya sudah masuk.",
  },
];

/** Jenis pekerjaan untuk layar Atur SLA — urutan & satuan sama dengan tabel. */
export const JENIS_KINERJA = META.map(({ kunci, jenis, satuan, desimal }) => ({ kunci, jenis, satuan, desimal }));

interface BarisRpc {
  kunci: string;
  wo_terbit: number | string | null;
  realisasi: number | string | null;
  belum_disetujui: number | string | null;
  luar_wo: number | string | null;
  sla?: number | string | null;
}

const angka = (v: number | string | null) => (v === null ? null : Number(v));

interface Hasil {
  baris: BarisKinerja[];
  loading: boolean;
  /** Rekap gagal dibaca — tabelnya kosong karena gagal, dan itu harus
   *  terlihat di layar, bukan tampil sebagai nol. */
  adaGagal: boolean;
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

export function useKinerjaYantek(user: CurrentUser): Hasil {
  const bolehSemua = canSeeAllUnits(user.role);
  const tahunIni = new Date().getFullYear();

  const [tahun, gantiTahun] = useState(tahunIni);
  // Bawaan bulan berjalan (permintaan user 25 Sep 2026), bukan seluruh tahun.
  const [bulan, gantiBulan] = useState(new Date().getMonth() + 1);
  const [ulp, gantiUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? ""));
  const [data, setData] = useState<BarisRpc[] | null>(null);
  const [woGarduJtr, setWoGarduJtr] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const daftarUlp = useMemo(
    () => (bolehSemua ? ["SEMUA", ...UNIT] : [user.unit ?? ""]),
    [bolehSemua, user.unit],
  );
  const daftarTahun = useMemo(() => [tahunIni, tahunIni - 1, tahunIni - 2], [tahunIni]);

  // Pemicu menyalakan "memuat" di tempat, bukan di dalam efek.
  const mulai = () => setLoading(true);
  const setTahun = (t: number) => { mulai(); gantiTahun(t); };
  const setBulan = (b: number) => { mulai(); gantiBulan(b); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };

  useEffect(() => {
    let hidup = true;
    // Jumlah gardu di WO Inspeksi JTR periode ini — aturan sama dengan baris
    // jtr di `_rekap_kinerja_inti`: bulan dari `tgl_wo`, item batal tidak dihitung.
    const awal = `${tahun}-${String(bulan === 0 ? 1 : bulan).padStart(2, "0")}-01`;
    const akhir = bulan === 0 || bulan === 12
      ? `${tahun + 1}-01-01`
      : `${tahun}-${String(bulan + 1).padStart(2, "0")}-01`;
    let qJtr = supabaseBrowser
      .from("wo_inspeksi_item")
      .select("id, wo_inspeksi!inner(tgl_wo)", { count: "exact", head: true })
      .eq("jenis", "JTR")
      .neq("status", "Dibatalkan")
      .gte("wo_inspeksi.tgl_wo", awal)
      .lt("wo_inspeksi.tgl_wo", akhir);
    if (ulp !== "SEMUA") qJtr = qJtr.ilike("ulp", ulp);
    qJtr.then(({ count, error }) => {
      if (hidup) setWoGarduJtr(error ? null : (count ?? 0));
    });

    supabaseBrowser
      .rpc("rekap_kinerja", { p_ulp: ulp === "SEMUA" ? null : ulp, p_tahun: tahun, p_bulan: bulan })
      .then(({ data: rows, error }) => {
        // Jawaban rentang lama yang datang belakangan tidak boleh menimpa yang baru.
        if (!hidup) return;
        setData(error ? null : ((rows ?? []) as BarisRpc[]));
        setLoading(false);
      });
    return () => { hidup = false; };
  }, [tahun, bulan, ulp, nonce]);

  const baris = useMemo<BarisKinerja[]>(() => {
    const peta = new Map((data ?? []).map((r) => [r.kunci, r]));
    return META.map((m) => {
      const r = peta.get(m.kunci);
      // Gagal atau baris tidak ada: angkanya DIKOSONGKAN, bukan ditulis nol —
      // nol yang dikarang tidak bisa dibedakan dari kinerja yang benar nihil.
      if (!r) {
        return {
          ...m,
          woTerbit: null,
          sla: null,
          realisasi: null,
          belumApprove: null,
          gagal: true,
          catatan: "Data gagal dibaca dari server, jadi angkanya dikosongkan — bukan berarti nol.",
        };
      }
      const luar = Number(r.luar_wo ?? 0);
      return {
        ...m,
        woGardu: m.kunci === "jtr" ? woGarduJtr : null,
        // Sudah ada WO (sistem atau tempelan) = baris lengkap, apa pun bawaannya.
        keadaan: r.wo_terbit !== null ? "lengkap" : m.keadaan,
        woTerbit: angka(r.wo_terbit),
        sla: angka(r.sla ?? null),
        realisasi: angka(r.realisasi),
        belumApprove: angka(r.belum_disetujui),
        catatan:
          luar <= 0
            ? m.catatan
            : m.kunci === "perabasan"
              ? `${m.catatan} Di luar WO: ${luar} pohon dirabas (tidak dihitung KMS).`
              : m.kunci === "harjtm"
                // Baris ini: `luar_wo` = berapa dari realisasi yang berasal dari tugas temuan.
                ? `${m.catatan} ${luar} di antaranya dari tugas temuan.`
                : m.kunci === "jtm" || m.kunci === "jtr"
                  // Km inspeksi yang selesai tanpa WO (rencana-mobile-jtm-jtr.md keputusan e).
                  ? `${m.catatan} Di luar WO: ${luar.toFixed(2).replace(".", ",")} KMS.`
                  : `${m.catatan} Di luar WO: ${luar} pemeliharaan lain terkirim.`,
      };
    });
  }, [data, woGarduJtr]);

  return {
    baris,
    loading,
    adaGagal: !loading && data === null,
    tahun,
    setTahun,
    bulan,
    setBulan,
    ulp,
    setUlp,
    daftarUlp,
    daftarTahun,
    muatUlang: () => { mulai(); setNonce((n) => n + 1); },
  };
}
