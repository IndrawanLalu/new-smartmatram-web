"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * WO Perabasan — bahan tab Susun WO dan tombol-tombol aksinya. Daftar segmen
 * untuk dilihat & diputuskan ada di `useDaftarPerabasan` (per periode).
 *
 * WO Perabasan — bersatuan segmen, diukur KILOMETER.
 *
 * Seluruh angka capaian datang dari view `wo_perabasan_capaian`, tidak satu pun
 * dijumlah di sini. Aturannya tidak sepele — hanya item Diverifikasi yang
 * dihitung, dan km hasil hitungan dipisah dari km hasil ketikan — dan aturan
 * seperti itu kalau ditulis dua kali akan melenceng persis saat dibandingkan
 * antar bulan.
 */

export interface WoRingkas {
  wo_id: string;
  ulp: string;
  nama: string;
  tgl_wo: string;
  target_km: number;
  status: string;
  item: number;
  item_selesai: number;
  rencana_km: number;
  capaian_km: number;
  /** Km dari segmen yang panjangnya dihitung dari bentang tiang. */
  capaian_km_hitungan: number;
  /** Km dari segmen yang panjangnya masih angka ketikan — TIDAK sebanding. */
  capaian_km_ketikan: number;
  capaian_persen: number | null;
  pohon_dirabas: number;
}

export interface WoItem {
  id: string;
  wo_id: string;
  segmen_id: string;
  urutan: number;
  ulp: string;
  penyulang: string;
  segmen_nama: string;
  panjang_km: number | null;
  panjang_dari: string | null;
  /**
   * Regu yang ditugasi, mis. "RABAS 1". NULL = belum ditugaskan — dan selama
   * NULL, segmen ini TIDAK muncul di HP regu mana pun.
   */
  regu: string | null;
  status: string;
  tgl_mulai: string | null;
  tgl_selesai: string | null;
  petugas_nama: string | null;
  catatan: string | null;
  verified_note: string | null;
}

export interface SegmenPilihan {
  segmen_id: string;
  nama: string;
  penyulang: string;
  ulp: string;
  panjang_pakai_km: number | null;
  panjang_dari: "hitungan" | "ketikan" | "kosong";
  umur_inspeksi_bulan: number | null;
}

/** Regu rabas yang aktif di sebuah ULP, beserta beban yang sedang dipikulnya. */
export interface Regu {
  regu: string;
  ulp: string;
  segmen_berjalan: number;
  km_berjalan: number;
}

export interface Realisasi {
  id: string;
  item_id: string;
  tiang_id: string | null;
  jenis_pohon: string | null;
  lat: number | null;
  lng: number | null;
  foto_sebelum_url: string;
  foto_sesudah_url: string;
  petugas_nama: string | null;
  dikerjakan_at: string;
  catatan: string | null;
}

const KOLOM_WO =
  "wo_id,ulp,nama,tgl_wo,target_km,status,item,item_selesai,rencana_km,capaian_km,capaian_km_hitungan,capaian_km_ketikan,capaian_persen,pohon_dirabas";
const KOLOM_ITEM =
  "id,wo_id,segmen_id,urutan,ulp,penyulang,segmen_nama,panjang_km,panjang_dari,regu,status,tgl_mulai,tgl_selesai,petugas_nama,catatan,verified_note";
const KOLOM_SEGMEN =
  "segmen_id,nama,penyulang,ulp,panjang_pakai_km,panjang_dari,umur_inspeksi_bulan";

export function useWoPerabasan() {
  const toast = useToast();
  const [wo, setWo] = useState<WoRingkas[]>([]);
  const [item, setItem] = useState<WoItem[]>([]);
  const [segmen, setSegmen] = useState<SegmenPilihan[]>([]);
  const [regu, setRegu] = useState<Regu[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    try {
      // Dipaginasi penuh (teknisaplikasi.md butir 13): master segmen aktif saja
      // sudah bisa melewati 1.000 baris, dan segmen yang terpotong tidak akan
      // pernah bisa dipilih di Susun WO — tanpa pesan apa pun. Item yang dimuat
      // hanya yang MASIH MENGIKAT segmen (bahan `segmenTerikat`).
      const [w, i, s, g] = await Promise.all([
        fetchAllRows<WoRingkas>(() =>
          supabaseBrowser.from("wo_perabasan_capaian").select(KOLOM_WO).order("tgl_wo", { ascending: false }).order("wo_id"),
        ),
        fetchAllRows<WoItem>(() =>
          supabaseBrowser
            .from("wo_perabasan_item")
            .select(KOLOM_ITEM)
            .in("status", ["Dijadwalkan", "Dalam Proses", "Selesai", "Ditolak"])
            .order("id"),
        ),
        fetchAllRows<SegmenPilihan>(() =>
          supabaseBrowser
            .from("master_segmen")
            .select(KOLOM_SEGMEN)
            .eq("status", "aktif")
            .order("penyulang")
            .order("nama")
            .order("segmen_id"),
        ),
        supabaseBrowser
          .from("regu_perabasan")
          .select("regu,ulp,segmen_berjalan,km_berjalan")
          .order("ulp")
          .order("regu"),
      ]);
      if (g.error) throw new Error(g.error.message);

      setWo(w);
      setItem(i);
      setSegmen(s);
      setRegu((g.data ?? []) as unknown as Regu[]);
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      toast.error(
        pesan.includes("does not exist") || pesan.includes("schema cache")
          ? "Tabel WO perabasan belum ada — jalankan scripts/wo-perabasan.sql di Supabase."
          : pesan,
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const terbitkan = useCallback(
    async (v: {
      ulp: string;
      nama: string;
      targetKm: number;
      segmen: string[];
      /** segmen_id → nama regu. Yang tidak disebut masuk tanpa regu. */
      regu: Record<string, string>;
      tglWo: string;
      oleh?: string;
    }) => {
      const { data, error } = await supabaseBrowser.rpc("terbitkan_wo_perabasan", {
        p_ulp: v.ulp,
        p_nama: v.nama,
        p_target_km: v.targetKm,
        p_segmen: v.segmen,
        p_tgl_wo: v.tglWo,
        p_regu: v.regu,
        p_oleh: v.oleh ?? null,
      });
      if (error) {
        toast.error(error.message);
        return null;
      }
      await muat();
      return data as unknown as {
        wo_id: string;
        item: number;
        tanpa_regu: number;
        dilewati: { segmen: string; sebab: string }[];
      };
    },
    [toast, muat],
  );

  /**
   * Menambah segmen ke WO yang SUDAH terbit.
   *
   * Aturan per segmennya sama persis dengan penerbitan — database memakai
   * fungsi yang sama untuk keduanya, jadi segmen yang ditolak saat terbit
   * tidak bisa menyelinap masuk lewat pintu ini.
   */
  const tambahKeWo = useCallback(
    async (v: {
      woId: string;
      segmen: string[];
      regu: Record<string, string>;
      targetKm: number | null;
      oleh?: string;
    }) => {
      const { data, error } = await supabaseBrowser.rpc("tambah_wo_perabasan", {
        p_wo_id: v.woId,
        p_segmen: v.segmen,
        p_regu: v.regu,
        p_target_km: v.targetKm,
        p_oleh: v.oleh ?? null,
      });
      if (error) {
        toast.error(error.message);
        return null;
      }
      const h = data as unknown as { nama: string; item: number; tanpa_regu: number };
      toast.success(`${h.item} segmen ditambahkan ke ${h.nama}.`);
      await muat();
      return h;
    },
    [toast, muat],
  );

  const putuskan = useCallback(
    async (itemId: string, terima: boolean, catatan: string, oleh?: string) => {
      const { error } = await supabaseBrowser.rpc("putuskan_perabasan_segmen", {
        p_item_id: itemId,
        p_terima: terima,
        p_catatan: catatan || null,
        p_oleh: oleh ?? null,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success(terima ? "Segmen diverifikasi." : "Dikembalikan ke regu.");
      await muat();
      return true;
    },
    [toast, muat],
  );

  /**
   * Memindahkan satu segmen ke regu lain.
   *
   * Barisnya DIPATCH DI TEMPAT, bukan dengan memuat ulang seluruh halaman.
   * Versi pertama memanggil `muat()` — lima query sekaligus — sehingga ada
   * jeda panjang saat dropdown tidak berubah dan tidak ada satu pun tanda
   * bahwa sesuatu sedang terjadi. Bagi admin itu terbaca sebagai galat, dan
   * dia menekannya lagi.
   */
  const tugaskanRegu = useCallback(
    async (itemId: string, namaRegu: string, oleh?: string) => {
      const { error } = await supabaseBrowser.rpc("tugaskan_regu_segmen", {
        p_item_id: itemId,
        p_regu: namaRegu || null,
        p_oleh: oleh ?? null,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }

      setItem((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, regu: namaRegu || null } : i)),
      );
      toast.success(
        namaRegu
          ? `Ditugaskan ke ${namaRegu}.`
          : "Regunya dikosongkan — segmen ini tidak lagi muncul di HP siapa pun.",
      );
      return true;
    },
    [toast],
  );

  const batalkanItem = useCallback(
    async (itemId: string, alasan: string, oleh?: string) => {
      const { error } = await supabaseBrowser.rpc("batalkan_perabasan_item", {
        p_item_id: itemId,
        p_alasan: alasan,
        p_oleh: oleh ?? null,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success("Segmen dikeluarkan dari WO.");
      await muat();
      return true;
    },
    [toast, muat],
  );

  /** Segmen yang sedang terikat WO berjalan — tidak boleh dipilih lagi. */
  const segmenTerikat = useMemo(
    () =>
      new Set(
        item
          .filter((i) => ["Dijadwalkan", "Dalam Proses", "Selesai", "Ditolak"].includes(i.status))
          .map((i) => i.segmen_id),
      ),
    [item],
  );

  /** Bukti pohon satu segmen — dimuat saat modalnya dibuka, bukan seluruh
   *  tabel realisasi di setiap kunjungan. */
  const ambilRealisasi = useCallback(async (itemId: string): Promise<Realisasi[]> => {
    const { data, error } = await supabaseBrowser
      .from("perabasan_realisasi")
      .select("*")
      .eq("item_id", itemId)
      .order("dikerjakan_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Realisasi[];
  }, []);

  return {
    wo, item, segmen, regu, loading, muat,
    terbitkan, tambahKeWo, putuskan, batalkanItem, tugaskanRegu, ambilRealisasi,
    segmenTerikat,
  };
}
