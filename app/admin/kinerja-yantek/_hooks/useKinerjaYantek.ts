"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { META, type BarisKinerja } from "../_lib/kinerjaMeta";

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

export {
  BULAN, JENIS_KINERJA, META, capaianSla, capaianWo,
  type BarisKinerja, type Keadaan,
} from "../_lib/kinerjaMeta";

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
  /** KMS tempelan JTM Tier 2 yang dicentang di web — sisanya dari HP. */
  const [centangJtm2, setCentangJtm2] = useState<number | null>(null);
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

    // Tempelan JTM Tier 2 yang dicentang — aturan sama dengan
    // `_wo_manual_total(..., 'jtm2', true, true)` di rekap.
    fetchAllRows<{ km: number | string | null }>(() => {
      let q = supabaseBrowser
        .from("wo_manual_item")
        .select("id, km, wo_manual!inner(jenis, tahun, bulan, ulp)")
        .eq("wo_manual.jenis", "jtm2")
        .eq("wo_manual.tahun", tahun)
        .not("selesai_tgl", "is", null)
        .order("id");
      if (bulan !== 0) q = q.eq("wo_manual.bulan", bulan);
      if (ulp !== "SEMUA") q = q.eq("wo_manual.ulp", ulp);
      return q;
    }).then(
      (rows) => { if (hidup) setCentangJtm2(rows.reduce((n, x) => n + Number(x.km ?? 0), 0)); },
      () => { if (hidup) setCentangJtm2(null); },
    );

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
      const kmTeks = (v: number) => v.toFixed(2).replace(".", ",");
      // Tier 2: realisasi = dari HP + dari centang — dua-duanya disebut.
      const rincianJtm2 =
        m.kunci === "jtm2" && centangJtm2 !== null && r.realisasi !== null
          ? ` Realisasi: ${kmTeks(Math.max(0, Number(r.realisasi) - centangJtm2))} KMS dari HP · ${kmTeks(centangJtm2)} KMS dari centang tempelan.`
          : "";
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
          (luar <= 0
            ? m.catatan
            : m.kunci === "perabasan"
              ? `${m.catatan} Di luar WO: ${luar} pohon dirabas (tidak dihitung KMS).`
              : m.kunci === "harjtm"
                // Baris ini: `luar_wo` = berapa dari realisasi yang berasal dari tugas temuan.
                ? `${m.catatan} ${luar} di antaranya dari tugas temuan.`
                : m.kunci === "jtm" || m.kunci === "jtm2" || m.kunci === "jtr"
                  // Km inspeksi yang selesai tanpa WO (rencana-mobile-jtm-jtr.md keputusan e).
                  ? `${m.catatan} Di luar WO: ${kmTeks(luar)} KMS.`
                  : `${m.catatan} Di luar WO: ${luar} pemeliharaan lain terkirim.`) + rincianJtm2,
      };
    });
  }, [data, woGarduJtr, centangJtm2]);

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
