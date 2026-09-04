"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import {
  batasBulanWo,
  tanggalWo,
  type AlasanWo,
  type BarisMasterUntukWo,
  type KandidatWo,
  type WoSettings,
} from "../_lib/kandidatWo";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Header WO — satu per ULP per bulan. */
export interface WoHeader {
  id: string;
  ulp: string;
  bulan: number;
  tahun: number;
  tgl_wo: string;
  kuota: number;
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

/** Satu WO yang akan diterbitkan. */
export interface RencanaTerbit {
  ulp: string;
  kandidat: KandidatWo[];
  settings: WoSettings;
}

export interface HasilTerbit {
  diterbitkan: { ulp: string; jumlah: number }[];
  ditolak: string[];
  error: string | null;
}

/** Baris per sekali kirim. Kuota bisa sampai 2.000 dan empat ULP diterbitkan
 *  berurutan, jadi dipecah supaya satu permintaan tidak jadi terlalu besar. */
const UKURAN_BATCH = 500;

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
        .select("id,ulp,bulan,tahun,tgl_wo,kuota,created_at")
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

  /** ULP yang WO bulan ini sudah terbit — dipakai menolak penerbitan ulang. */
  const ulpSudahTerbit = useMemo(() => new Set(headers.map((h) => h.ulp)), [headers]);

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
   * Terbitkan WO untuk tiap rencana yang ULP-nya belum punya WO bulan ini.
   *
   * ULP yang sudah punya DITOLAK, tidak ditimpa: daftar yang sudah terbit boleh
   * jadi sudah dicetak dan dipegang petugas, dan realisasi yang menempel padanya
   * akan ikut lepas kalau barisnya disusun ulang. Menerbitkan ulang harus lewat
   * hapus yang disengaja.
   */
  const terbitkan = useCallback(
    async (rencana: RencanaTerbit[]): Promise<HasilTerbit> => {
      const tglWo = tanggalWo(tahun, bulan);
      const diterbitkan: { ulp: string; jumlah: number }[] = [];
      const ditolak: string[] = [];

      const { data: auth } = await supabaseBrowser.auth.getUser();

      for (const r of rencana) {
        if (ulpSudahTerbit.has(r.ulp)) { ditolak.push(r.ulp); continue; }
        if (r.kandidat.length === 0) continue;

        // Id dibuat di klien, bukan diambil dari `.select()` setelah insert —
        // pola yang sudah dipakai di tabel lain proyek ini supaya tidak
        // bergantung pada nilai balik yang bisa ditahan RLS.
        const woId = crypto.randomUUID();

        const { error: eWo } = await supabaseBrowser.from("wo_pengukuran").insert({
          id: woId,
          ulp: r.ulp,
          bulan,
          tahun,
          tgl_wo: tglWo,
          kuota: r.settings.kuota_per_bulan,
          kriteria: r.settings,
          created_by: auth?.user?.id ?? null,
        });
        if (eWo) return { diterbitkan, ditolak, error: eWo.message };

        const items = r.kandidat.map((k, i) => ({
          wo_id: woId,
          kode_gardu: k.kode_gardu,
          ulp: k.ulp,
          nama: k.nama,
          alamat: k.alamat,
          penyulang: k.penyulang,
          kva_master: k.kva_master,
          lat: k.lat,
          lng: k.lng,
          alasan: k.alasan,
          tgl_ukur_terakhir: k.tgl_ukur_terakhir,
          umur_bulan: k.umur_bulan,
          urutan: i + 1,
        }));

        for (let i = 0; i < items.length; i += UKURAN_BATCH) {
          const { error: eItem } = await supabaseBrowser
            .from("wo_pengukuran_item")
            .insert(items.slice(i, i + UKURAN_BATCH));
          if (eItem) {
            // Header tanpa baris adalah keadaan yang menyesatkan — tampil sebagai
            // "WO sudah terbit" padahal kosong, dan menghalangi percobaan ulang.
            await supabaseBrowser.from("wo_pengukuran").delete().eq("id", woId);
            return { diterbitkan, ditolak, error: eItem.message };
          }
        }

        diterbitkan.push({ ulp: r.ulp, jumlah: items.length });
      }

      await muat();
      return { diterbitkan, ditolak, error: null };
    },
    [tahun, bulan, ulpSudahTerbit, muat],
  );

  /** Hapus satu WO beserta seluruh barisnya (cascade di database). */
  const hapus = useCallback(
    async (woId: string): Promise<string | null> => {
      const { error: e } = await supabaseBrowser.from("wo_pengukuran").delete().eq("id", woId);
      if (e) return e.message;
      await muat();
      return null;
    },
    [muat],
  );

  return { headers, rows, luarWo, loading, error, unit, ulpSudahTerbit, terbitkan, hapus, refresh: muat };
}

// ── Hook: master gardu untuk penyusunan kandidat ──────────────────────────────

const KOLOM_MASTER =
  "kode,ulp,nama,alamat,penyulang,kva_master,status,belum_diukur,event_date,persen_beban,lat,lng";

/**
 * Baris master + kondisi terakhir, seperlunya untuk menyusun kandidat WO.
 *
 * Sepuluh kolom, bukan `*`. View yang sama dipakai tab Data Gardu dengan 31
 * kolom (186 KB untuk 2.526 gardu), dan yang paling berat di sana adalah JSONB
 * `perjurusan` — tidak ada gunanya di sini, sebab penyusunan WO hanya bertanya
 * "kapan terakhir diukur dan seberapa berat bebannya".
 */
export function useMasterUntukWo(user: CurrentUser, ulp: string) {
  const [master, setMaster] = useState<BarisMasterUntukWo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unit = !canSeeAllUnits(user.role) && user.unit ? user.unit : ulp;

  useEffect(() => {
    let batal = false;
    setLoading(true);
    setError(null);

    // Wajib paginasi: master berisi 2.526 gardu, dan PostgREST memotong di 1.000
    // tanpa berkata apa-apa — separuh lebih armada akan hilang dari kandidat.
    fetchAllRows<BarisMasterUntukWo>(() => {
      const q = supabaseBrowser
        .from("gardu_master_state")
        .select(KOLOM_MASTER)
        .order("kode")
        .order("ulp");
      return unit ? q.eq("ulp", unit) : q;
    })
      .then((rows) => { if (!batal) setMaster(rows); })
      .catch((e: unknown) => {
        if (!batal) setError(e instanceof Error ? e.message : "Gagal mengambil master gardu");
      })
      .finally(() => { if (!batal) setLoading(false); });

    return () => { batal = true; };
  }, [unit]);

  return { master, loading, error };
}
