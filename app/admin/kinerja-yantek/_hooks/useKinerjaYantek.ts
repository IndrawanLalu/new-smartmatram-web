"use client";

import { useEffect, useMemo, useState } from "react";
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

/** Capaian WO = realisasi ÷ WO terbit. */
export function capaianWo(b: BarisKinerja) {
  return persen(b.realisasi, b.woTerbit);
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

/** Label & keterangan tiap baris — urutan di sini = urutan di layar. */
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
      "Dicatat regu dari lapangan berikut foto sebelum-sesudah. Belum diterbitkan lewat WO, jadi belum ada pembanding target.",
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
    catatan: "Tercatat sebagai tindak lanjut anomali pengukuran, belum sebagai pekerjaan ber-WO sendiri.",
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
    kunci: "pengukuran",
    jenis: "Pengukuran beban & tegangan ujung",
    href: "/admin/pengukuran-gardu",
    keadaan: "lengkap",
    satuan: "gardu",
    desimal: false,
    catatan: "Angka ini BEBAN saja. Tegangan ujung belum punya tempat sendiri — belum diukur, belum tercatat.",
  },
  {
    kunci: "jtm",
    jenis: "Inspeksi JTM",
    href: "/admin/jtm",
    keadaan: "tanpaWo",
    satuan: "KMS",
    desimal: true,
    catatan:
      "Panjang segmen yang penyapuannya selesai. Penyapuan lahir saat regu membuka segmennya, belum diterbitkan lewat WO — jadi belum ada pembanding target.",
  },
  {
    kunci: "jtr",
    jenis: "Inspeksi JTR",
    href: "/admin/jtr",
    keadaan: "tanpaWo",
    satuan: "KMS",
    desimal: true,
    catatan:
      "Panjang penghantar gardu yang penyapuannya selesai, termasuk underbuild. Sama seperti JTM: belum diterbitkan lewat WO.",
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
  }, [data]);

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
