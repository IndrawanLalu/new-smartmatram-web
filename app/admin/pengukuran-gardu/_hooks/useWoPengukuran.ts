"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import { batasBulanWo, type AlasanWo } from "../_lib/kandidatWo";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Header WO — satu per ULP per bulan. */
export interface WoHeader {
  id: string;
  ulp: string;
  bulan: number;
  tahun: number;
  tgl_wo: string;
  kuota: number;
  /** Jejak penyusunan: sumber (rencana/sistem/tempelan), jumlah per alasan, otomatis. */
  kriteria: { sumber?: string; rencana?: number; sisa?: number; sistem?: number; tambahan?: number; otomatis?: boolean; disusun?: string } | null;
  created_at: string;
}

/**
 * Satu baris WO beserta realisasinya, dari view `wo_pengukuran_realisasi`.
 *
 * Kolom realisasi boleh NULL dan memang begitu maksudnya: NULL = gardu ini
 * belum diukur di bulan WO-nya. Tidak ada penanda status tersimpan — status
 * dibaca dari ada-tidaknya `pengukuran_id`.
 */
export interface BarisWo {
  id: string;
  wo_id: string;
  kode_gardu: string;
  ulp: string;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  kva_master: number | null;
  /** Titik gardu, potret saat WO terbit. NULL = master belum punya koordinat. */
  lat: number | null;
  lng: number | null;
  alasan: AlasanWo;
  tgl_ukur_terakhir: string | null;
  umur_bulan: number | null;
  urutan: number;
  bulan: number;
  tahun: number;
  tgl_wo: string;
  pengukuran_id: string | null;
  tgl_realisasi: string | null;
  petugas_nama: string | null;
  persen_beban: number | null;
  beban_kva: number | null;
  kva_pengukuran: number | null;
  terealisasi: boolean;
}

// Satu literal utuh, bukan sambungan `+`: tipe hasil `.select()` disimpulkan
// dari string ini, dan sambungan membuatnya melebar jadi `string` sehingga
// seluruh baris kehilangan tipenya.
const KOLOM_BARIS =
  "id,wo_id,kode_gardu,ulp,nama,alamat,penyulang,kva_master,lat,lng,alasan,tgl_ukur_terakhir,umur_bulan,urutan,bulan,tahun,tgl_wo,pengukuran_id,tgl_realisasi,petugas_nama,persen_beban,beban_kva,kva_pengukuran,terealisasi";

/**
 * Satu pengukuran di bulan WO — hanya kolom yang dibutuhkan untuk memisahkan
 * mana yang di dalam WO dan mana yang di luar.
 */
export interface PengukuranBulan {
  /** Ikut ditarik semata sebagai kunci urut yang pasti unik untuk paginasi. */
  id: string;
  no_gardu: string;
  petugas_unit: string;
  tanggal_pengukuran: string;
  petugas_nama: string | null;
}

const KOLOM_PENGUKURAN_BULAN = "no_gardu,petugas_unit,tanggal_pengukuran,petugas_nama,id";

/** Gardu yang diukur bulan ini tapi tidak ada di WO. */
export interface GarduLuarWo {
  kode_gardu: string;
  ulp: string;
  tanggal: string;
  petugas_nama: string | null;
}

/** Jawaban `terbitkan_wo_pengukuran` (rencana-pengukuran.sql). */
export interface HasilTerbit {
  jumlah: number;
  rencana?: number;
  sisa?: number;
  sistem?: number;
  tambahan?: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWoPengukuran(user: CurrentUser, ulp: string, tahun: number, bulan: number) {
  const [headers, setHeaders] = useState<WoHeader[]>([]);
  const [rows, setRows] = useState<BarisWo[]>([]);
  const [pengukuranBulan, setPengukuranBulan] = useState<PengukuranBulan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** ULP efektif: role selain UP3 selalu terkunci ke unitnya sendiri. */
  const unit = !canSeeAllUnits(user.role) && user.unit ? user.unit : ulp;

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qHeader = supabaseBrowser
        .from("wo_pengukuran")
        .select("id,ulp,bulan,tahun,tgl_wo,kuota,kriteria,created_at")
        .eq("tahun", tahun)
        .eq("bulan", bulan)
        .order("ulp");

      const { data: h, error: eh } = await (unit ? qHeader.eq("ulp", unit) : qHeader);
      if (eh) throw new Error(eh.message);

      // Diurutkan (ulp, urutan, id): dua kolom pertama adalah urutan tampil,
      // `id` yang membuatnya benar-benar unik supaya batas antar halaman tidak
      // bergeser dan membuat baris terlewat.
      const r = await fetchAllRows<BarisWo>(() => {
        const q = supabaseBrowser
          .from("wo_pengukuran_realisasi")
          .select(KOLOM_BARIS)
          .eq("tahun", tahun)
          .eq("bulan", bulan)
          .order("ulp")
          .order("urutan")
          .order("id");
        return unit ? q.eq("ulp", unit) : q;
      });

      // Seluruh pengukuran di bulan yang sama — dipakai menghitung gardu yang
      // diukur DI LUAR WO. Batas tanggalnya dari `batasBulanWo` supaya persis
      // sama dengan jendela yang dipakai view realisasi di database.
      //
      // `hasil_penyeimbangan_id IS NULL` wajib, sama seperti di view: baris
      // pembawa data ke AMG bukan pengukuran rutin, dan tanpa saringan ini tiap
      // pemerataan beban akan terhitung sebagai "diukur di luar WO".
      const { awal, akhir } = batasBulanWo(tahun, bulan);
      const pg = await fetchAllRows<PengukuranBulan>(() => {
        const q = supabaseBrowser
          .from("pengukuran_gardu")
          .select(KOLOM_PENGUKURAN_BULAN)
          .gte("tanggal_pengukuran", awal)
          .lt("tanggal_pengukuran", akhir)
          .is("hasil_penyeimbangan_id", null)
          .order("id");
        return unit ? q.eq("petugas_unit", unit) : q;
      });

      setHeaders((h ?? []) as WoHeader[]);
      setRows(r);
      setPengukuranBulan(pg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data WO");
      setHeaders([]);
      setRows([]);
      setPengukuranBulan([]);
    } finally {
      setLoading(false);
    }
  }, [unit, tahun, bulan]);

  useEffect(() => { muat(); }, [muat]);

  /**
   * Gardu yang diukur bulan ini tapi tidak ada di WO mana pun.
   *
   * Bukan pelanggaran — mengukur di luar WO memang diperbolehkan, dan angka ini
   * ada supaya kerja itu tetap terlihat alih-alih hilang dari rekap. Yang
   * dihitung GARDU, bukan jumlah pengukuran: satu gardu yang diukur dua kali
   * dalam sebulan tetap satu gardu.
   *
   * Dikunci pada `kode|ulp` karena kode gardu tidak unik lintas ULP — memakai
   * kode saja akan menganggap gardu Gerung sudah tercakup WO Cakranegara.
   */
  const luarWo = useMemo<GarduLuarWo[]>(() => {
    const diWo = new Set(rows.map((r) => `${r.kode_gardu.toUpperCase()}|${r.ulp.toUpperCase()}`));
    const terlihat = new Map<string, GarduLuarWo>();

    for (const p of pengukuranBulan) {
      const kunci = `${(p.no_gardu ?? "").toUpperCase()}|${(p.petugas_unit ?? "").toUpperCase()}`;
      if (!p.no_gardu || diWo.has(kunci) || terlihat.has(kunci)) continue;
      terlihat.set(kunci, {
        kode_gardu: p.no_gardu,
        ulp: p.petugas_unit,
        tanggal: p.tanggal_pengukuran,
        petugas_nama: p.petugas_nama,
      });
    }
    return [...terlihat.values()].sort((a, b) => a.kode_gardu.localeCompare(b.kode_gardu));
  }, [rows, pengukuranBulan]);

  /**
   * Terbitkan WO satu ULP lewat penyusun di database — fungsi yang sama dengan
   * penerbitan otomatis tanggal 1, jadi hasilnya selalu sama. `tambahan` =
   * gardu "sudah masuk waktu ukur" yang dicentang admin ikut masuk. WO yang
   * sudah terbit ditolak database (kecuali WO tempelan yang belum disusun —
   * itu ditambah).
   */
  const terbitkan = useCallback(
    async (u: string, tambahan: string[]): Promise<HasilTerbit> => {
      const { data, error: e } = await supabaseBrowser.rpc("terbitkan_wo_pengukuran", {
        p_ulp: u, p_tahun: tahun, p_bulan: bulan, p_tambahan: tambahan,
      });
      if (e) throw new Error(e.message);
      return data as HasilTerbit;
    },
    [tahun, bulan],
  );

  /** Gardu "sudah masuk waktu ukur" ditambahkan ke WO yang sudah terbit. */
  const tambahPengingat = useCallback(
    async (u: string, kode: string[]): Promise<number> => {
      const { data, error: e } = await supabaseBrowser.rpc("tambah_pengingat_wo_pengukuran", {
        p_ulp: u, p_tahun: tahun, p_bulan: bulan, p_kode: kode,
      });
      if (e) throw new Error(e.message);
      await muat();
      return data as number;
    },
    [tahun, bulan, muat],
  );

  /**
   * Batalkan satu WO beserta alasannya (`wo-batal-semua.sql`): barisnya
   * diarsipkan — hanya selama belum ada gardu yang sudah diukur. Sesudahnya
   * bulan itu bisa diterbitkan ulang.
   */
  const batalkan = useCallback(
    async (woId: string, alasan: string, oleh: string): Promise<string | null> => {
      const { error: e } = await supabaseBrowser.rpc("batalkan_wo_gardu", {
        p_modul: "pengukuran", p_wo_id: woId, p_alasan: alasan, p_oleh: oleh,
      });
      if (e) return e.message;
      await muat();
      return null;
    },
    [muat],
  );

  /** Keluarkan beberapa gardu dari WO; yang sudah diukur dilewati dengan sebabnya. */
  const keluarkan = useCallback(
    async (itemId: string[], alasan: string, oleh: string) => {
      const { data, error: e } = await supabaseBrowser.rpc("keluarkan_wo_gardu_banyak", {
        p_modul: "pengukuran", p_item_id: itemId, p_alasan: alasan, p_oleh: oleh,
      });
      if (e) throw new Error(e.message);
      await muat();
      return data as { keluar: number; dilewati: { objek: string; sebab: string }[] };
    },
    [muat],
  );

  return { headers, rows, luarWo, loading, error, unit, terbitkan, tambahPengingat, batalkan, keluarkan, refresh: muat };
}
