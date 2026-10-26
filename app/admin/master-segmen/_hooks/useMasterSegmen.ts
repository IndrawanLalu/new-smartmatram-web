"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { PratinjauBatalJtm } from "@/app/admin/jtm/_hooks/useDaftarJtm";

/**
 * Master Segmen — daftar acuan ruas jaringan, melayani inspeksi JTM DAN
 * perabasan.
 *
 * Yang membuatnya berguna bukan daftarnya, melainkan UMURNYA: ruas yang paling
 * lama tidak disentuh naik sendiri ke atas, dan WO berikutnya tinggal
 * mencentang dari situ alih-alih diingat-ingat orang.
 */

export interface SegmenBaris {
  segmen_id: string;
  nama: string;
  penyulang: string;
  ulp: string;
  status: string;
  /** 'lapangan' = dirintis regu · 'impor' = tempelan Excel · 'manual' = warisan */
  sumber: string;
  jumlah_tiang: number;
  jumlah_gawang: number;
  /** Dihitung dari bentang tiang. 0 kalau tiangnya belum tertelusuri. */
  panjang_km: number;
  /** Yang diketik admin. */
  panjang_manual_km: number | null;
  /** Yang benar-benar dipakai — hitungan kalau ada, ketikan kalau belum. */
  panjang_pakai_km: number | null;
  panjang_dari: "hitungan" | "ketikan" | "kosong";
  tiang_bersama: number;
  catatan: string | null;
  terakhir_inspeksi: string | null;
  umur_inspeksi_bulan: number | null;
  inspeksi_berjalan: boolean;
}

/**
 * Segmen YATIM (`jtm_segmen_yatim`, `jtm-batal-hp.sql`): hasil rintis HP yang
 * inspeksinya sudah dibatalkan semua dan tidak masuk WO — dulu "Batalkan" di
 * web hanya membatalkan inspeksinya. Segmennya tetap muncul di HP sebagai
 * rintisan terbuka, lengkap dengan tiang & nomornya. Dihapus dari sini.
 */
export interface SegmenYatim {
  tiang: number;
  perintis: string | null;
  terakhir_dibatalkan: string | null;
}

/** Section "rumah" segmen (`segmen_section_utama`, X4). Segmen tanpa tiang tidak punya. */
export interface SectionSegmen {
  section_id: string;
  section_nama: string;
  section_urutan: number;
  /** Isinya juga di section lain — melewati keypoint, bahan Pecah di /peta. */
  lintas: boolean;
}

/** Ringkasan satu section (`section_rekap`, X4). */
export interface RekapSection {
  section_id: string;
  penyulang: string;
  ulp: string;
  nama: string;
  jenis_hulu: string;
  urutan: number;
  jumlah_tiang: number;
  panjang_km: number;
  jumlah_segmen: number;
  tiang_tanpa_segmen: number;
  /** Gardu di tiang section (master gardu, `jtm-section-gardu.sql`). */
  jumlah_gardu: number;
  gardu_kva: number;
}

/** Gardu & kVA per segmen (`segmen_gardu`). */
export interface GarduSegmen {
  jumlah_gardu: number;
  gardu_kva: number;
  gardu: string;
}

/** Gardu master penyulang yang belum di segmen mana pun (`gardu_belum_segmen`). */
export interface GarduBelum {
  kode: string;
  nama: string | null;
  daya: number | null;
  penyulang: string;
  ulp: string | null;
  /** Tiangnya sudah di pohon penyulang — tinggal dimasukkan ke segmen. */
  di_section: boolean;
  /** Rincian (`jtm-gardu-belum-rinci.sql`); tidak ada = SQL itu belum dijalankan. */
  alamat?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Tercatat di tiang penyulang LAIN — feeder master mungkin salah. */
  di_tiang_penyulang?: string | null;
}

export interface BarisImpor {
  awal: string;
  akhir: string;
  km: number | null;
}

export interface HasilImpor {
  penyulang: string;
  ulp: string;
  /** true = pratinjau, tidak satu baris pun ditulis. */
  uji: boolean;
  dibuat: number;
  /** Nama segmen yang AKAN (atau sudah) terbentuk — disusun database, bukan ditebak layar. */
  siap: { nama: string; km: number | null; awal_jenis: string; akhir_jenis: string }[];
  dilewati: { baris: BarisImpor; sebab: string }[];
}

const KOLOM =
  "segmen_id,nama,penyulang,ulp,status,sumber,jumlah_tiang,jumlah_gawang,panjang_km,panjang_manual_km,panjang_pakai_km,panjang_dari,tiang_bersama,catatan,terakhir_inspeksi,umur_inspeksi_bulan,inspeksi_berjalan";

export function useMasterSegmen() {
  const toast = useToast();
  const [baris, setBaris] = useState<SegmenBaris[]>([]);
  const [penyulang, setPenyulang] = useState<{ penyulang: string; ulp: string | null }[]>([]);
  const [yatim, setYatim] = useState<Map<string, SegmenYatim>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sectionDari, setSectionDari] = useState<Map<string, SectionSegmen>>(new Map());
  const [rekapSection, setRekapSection] = useState<RekapSection[] | null>(null);
  const [garduSegmen, setGarduSegmen] = useState<Map<string, GarduSegmen>>(new Map());
  const [garduBelum, setGarduBelum] = useState<GarduBelum[]>([]);

  const muatSection = useCallback(async () => {
    try {
      // Section yang kotor (tiang berubah) disusun ulang dulu, sama dengan /peta.
      const { error: eSusun } = await supabaseBrowser.rpc("segarkan_section_kotor", { p_ulp: null, p_batas: 50 });
      if (eSusun) throw new Error(eSusun.message);
      const [utama, rekap] = await Promise.all([
        fetchAllRows<SectionSegmen & { segmen_id: string }>(() =>
          supabaseBrowser
            .from("segmen_section_utama")
            .select("segmen_id,section_id,section_nama,section_urutan,lintas")
            .order("segmen_id"),
        ),
        fetchAllRows<RekapSection>(() =>
          supabaseBrowser
            .from("section_rekap")
            .select("section_id,penyulang,ulp,nama,jenis_hulu,urutan,jumlah_tiang,panjang_km,jumlah_segmen,tiang_tanpa_segmen,jumlah_gardu,gardu_kva")
            .order("section_id"),
        ),
      ]);
      // Gardu (`jtm-section-gardu.sql`) — belum dijalankan = kolom gardu kosong saja.
      const [gs, gb] = await Promise.all([
        fetchAllRows<GarduSegmen & { segmen_id: string }>(() =>
          supabaseBrowser.from("segmen_gardu").select("segmen_id,jumlah_gardu,gardu_kva,gardu").order("segmen_id"),
        ).catch(() => []),
        fetchAllRows<GarduBelum>(() =>
          supabaseBrowser
            .from("gardu_belum_segmen")
            .select("kode,nama,daya,penyulang,ulp,di_section,alamat,lat,lng,di_tiang_penyulang")
            .order("kode"),
        ).catch(() =>
          fetchAllRows<GarduBelum>(() =>
            supabaseBrowser.from("gardu_belum_segmen").select("kode,nama,daya,penyulang,ulp,di_section").order("kode"),
          ).catch(() => []),
        ),
      ]);
      setGarduSegmen(new Map(gs.map(({ segmen_id, ...r }) => [segmen_id, { ...r, gardu_kva: Number(r.gardu_kva) }])));
      setGarduBelum(gb.map((g) => ({ ...g, daya: g.daya === null ? null : Number(g.daya) })));
      setSectionDari(new Map(utama.map(({ segmen_id, ...r }) => [segmen_id, r])));
      setRekapSection(rekap.map((r) => ({
        ...r, panjang_km: Number(r.panjang_km), jumlah_gardu: Number(r.jumlah_gardu ?? 0), gardu_kva: Number(r.gardu_kva ?? 0),
      })));
    } catch {
      setRekapSection(null);
    }
  }, []);

  const muat = useCallback(async () => {
    try {
      // Berhalaman: 1.441 segmen (25 Okt 2026) — dulu terpotong diam-diam di 1.000.
      const data = await fetchAllRows<SegmenBaris>(() =>
        supabaseBrowser.from("master_segmen").select(KOLOM).order("segmen_id"),
      );
      setBaris(data);

      // Section (X4, `jtm-section-daftar.sql`). Belum dijalankan = tampilan
      // Per section disembunyikan, bukan halaman yang gagal dimuat.
      void muatSection();

      // View-nya lahir di `jtm-batal-hp.sql`. Belum dijalankan = tidak ada
      // penanda yatim, bukan halaman yang gagal dimuat.
      const y = await supabaseBrowser.from("jtm_segmen_yatim").select("segmen_id,tiang,perintis,terakhir_dibatalkan");
      setYatim(
        new Map(((y.data ?? []) as (SegmenYatim & { segmen_id: string })[]).map(({ segmen_id, ...r }) => [segmen_id, r])),
      );

      // Daftar penyulang dibaca dari MASTER, bukan dari segmen yang sudah ada.
      // Impor harus bisa menunjuk penyulang yang belum punya satu segmen pun —
      // justru merekalah yang paling perlu diimpor.
      const p = await supabaseBrowser
        .from("penyulang_ref")
        .select("penyulang,ulp")
        .order("penyulang");
      if (p.error) throw new Error(p.error.message);
      setPenyulang((p.data ?? []) as { penyulang: string; ulp: string | null }[]);
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      toast.error(
        pesan.includes("does not exist")
          ? "View master_segmen belum ada — jalankan scripts/master-segmen.sql di Supabase."
          : pesan,
      );
      setBaris([]);
    } finally {
      setLoading(false);
    }
  }, [toast, muatSection]);

  useEffect(() => {
    void muat();
  }, [muat]);

  /**
   * Pratinjau impor — TIDAK menulis apa pun.
   *
   * Nama segmen yang akan terbentuk dihitung database lewat `p_uji`, bukan
   * ditiru di layar. Tiruan akan melenceng cepat atau lambat, dan pratinjau
   * yang melenceng lebih buruk daripada tidak ada pratinjau sama sekali.
   */
  const pratinjauImpor = useCallback(
    async (namaPenyulang: string, isi: BarisImpor[]) => {
      const { data, error } = await supabaseBrowser.rpc("impor_segmen", {
        p_penyulang: namaPenyulang,
        p_baris: isi,
        p_oleh: null,
        p_uji: true,
      });
      if (error) {
        toast.error(error.message);
        return null;
      }
      return data as unknown as HasilImpor;
    },
    [toast],
  );

  const impor = useCallback(
    async (namaPenyulang: string, isi: BarisImpor[], oleh?: string) => {
      const { data, error } = await supabaseBrowser.rpc("impor_segmen", {
        p_penyulang: namaPenyulang,
        p_baris: isi,
        p_oleh: oleh ?? null,
        p_uji: false,
      });
      if (error) {
        // Penjaga di database menerangkan sendiri kenapa ditolak — termasuk
        // menunjuk ke Master Penyulang saat penyulangnya belum terdaftar.
        toast.error(error.message);
        return null;
      }
      const h = data as unknown as HasilImpor;
      toast.success(`${h.dibuat} segmen dibuat untuk ${h.penyulang}.`);
      await muat();
      return h;
    },
    [toast, muat],
  );

  const ubahPanjang = useCallback(
    async (segmenId: string, km: number | null, oleh?: string) => {
      const { data, error } = await supabaseBrowser.rpc("ubah_panjang_manual_segmen", {
        p_segmen_id: segmenId,
        p_km: km,
        p_oleh: oleh ?? null,
      });
      if (error) {
        toast.error(error.message);
        return null;
      }
      const h = data as unknown as { dipakai: boolean };
      // Angka yang tersimpan tapi TIDAK dipakai harus dikatakan. Kalau tidak,
      // orang mengira sudah membetulkan panjangnya, padahal hitungan dari
      // tiang tetap yang menang dan angkanya cuma mengendap.
      if (!h.dipakai) {
        toast.success(
          "Tersimpan, tapi belum dipakai — segmen ini panjangnya sudah dihitung dari tiang.",
        );
      }
      await muat();
      return h;
    },
    [toast, muat],
  );

  /** Nama segmen impor ditulis orang, jadi boleh dibetulkan orang — lewat
   *  fungsi yang memeriksa hak ULP, nama kembar, dan mencatat jejaknya. */
  const ubahNama = useCallback(
    async (segmenId: string, nama: string, oleh?: string) => {
      const { error } = await supabaseBrowser.rpc("ubah_nama_segmen", {
        p_segmen_id: segmenId,
        p_nama: nama,
        p_oleh: oleh ?? null,
      });
      if (error) {
        toast.error(
          error.message.includes("Could not find the function")
            ? "Fungsi ubah_nama_segmen belum ada — jalankan scripts/segmen-nama-tempel.sql di Supabase."
            : error.message,
        );
        return false;
      }
      toast.success("Nama segmen diubah.");
      await muat();
      return true;
    },
    [toast, muat],
  );

  /** Segmen lapangan: namanya disusun dari titik ujung, jadi TITIKNYA yang
   *  dibetulkan — segmen yang bersambung di tiang yang sama ikut. */
  const ubahTitik = useCallback(
    async (segmenId: string, ujung: "awal" | "akhir", jenis: string, nama: string, oleh?: string) => {
      const { data, error } = await supabaseBrowser.rpc("ubah_titik_segmen", {
        p_segmen_id: segmenId,
        p_ujung: ujung,
        p_jenis: jenis,
        p_nama: nama,
        p_oleh: oleh ?? null,
      });
      if (error) {
        toast.error(
          error.message.includes("Could not find the function")
            ? "Fungsi ubah_titik_segmen belum ada — jalankan scripts/segmen-ubah-titik.sql di Supabase."
            : error.message.includes("segmen_nama_unik")
              ? "Nama segmen itu sudah ada di penyulang ini."
              : error.message,
        );
        return false;
      }
      toast.success(`Segmen kini bernama ${data as string}.`);
      await muat();
      return true;
    },
    [toast, muat],
  );

  /** Segmen lapangan yang masih dirintis (ujung UJUNG) ditutup dari web —
   *  fungsi yang sama dengan "Simpan segmen" di HP (`tutup_segmen_jtm`). */
  const tutupSegmen = useCallback(
    async (segmenId: string, tiangId: string, jenis: string, nama: string, penanda: string | null, oleh?: string) => {
      const { data, error } = await supabaseBrowser.rpc("tutup_segmen_jtm", {
        p_segmen_id: segmenId,
        p_jenis: jenis,
        p_nama: nama,
        p_tiang_id: tiangId,
        p_penanda: penanda,
        p_oleh: oleh ?? null,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success(`Segmen ditutup: ${(data as { nama?: string })?.nama ?? ""}.`);
      await muat();
      return true;
    },
    [toast, muat],
  );

  /** Apa saja yang ikut terhapus — termasuk segmen lanjutan yang menyambung. */
  const pratinjauHapus = useCallback(async (segmenId: string, oleh?: string) => {
    const { data, error } = await supabaseBrowser.rpc("pratinjau_batal_jtm", {
      p_segmen_id: segmenId,
      p_tier: "1",
      p_nama: oleh ?? null,
    });
    if (error) {
      toast.error(
        error.message.includes("Could not find the function")
          ? "Fungsi pratinjau_batal_jtm belum ada — jalankan scripts/jtm-batal-hp.sql di Supabase."
          : error.message,
      );
      return null;
    }
    return data as PratinjauBatalJtm;
  }, [toast]);

  /** Fungsi yang sama dengan tombol 🗑 di HP: tiang ditandai batal, segmen dinonaktifkan. */
  const hapusSegmen = useCallback(
    async (segmenId: string, alasan: string, oleh?: string) => {
      const { data, error } = await supabaseBrowser.rpc("batalkan_jtm_hp", {
        p_segmen_id: segmenId,
        p_tier: "1",
        p_alasan: alasan,
        p_nama: oleh ?? null,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      const h = data as { segmen_dibatalkan?: number; tiang_dibatalkan?: number };
      toast.success(`${h.segmen_dibatalkan ?? 1} segmen & ${h.tiang_dibatalkan ?? 0} tiang dihapus.`);
      await muat();
      return true;
    },
    [toast, muat],
  );

  const daftarUlp = useMemo(
    () => [...new Set(baris.map((b) => b.ulp))].filter(Boolean).sort(),
    [baris],
  );

  return {
    baris, penyulang, daftarUlp, loading, yatim, sectionDari, rekapSection, garduSegmen, garduBelum, muat, pratinjauImpor, impor, ubahPanjang, ubahNama, ubahTitik,
    tutupSegmen, pratinjauHapus, hapusSegmen,
  };
}
