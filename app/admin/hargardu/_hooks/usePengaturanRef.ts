"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Daftar isian HARGARDU sebagai DATA, bukan kode.
 *
 * Semua penulisan lewat fungsi SECURITY DEFINER — bukan karena tabelnya
 * terkunci (RLS-nya masih longgar sampai Fase 0.4), tapi karena jejak audit
 * dan penjaganya tidak boleh bergantung pada layar yang kebetulan ingat
 * menulisnya. Yang lupa dicatat tidak pernah ketahuan: tidak ada galat saat
 * sesuatu TIDAK ditulis.
 */

export type Dimensi = "tunggal" | "fasa" | "jurusan";
export type TipeItem = "pilihan" | "angka" | "teks";

export interface ItemRef {
  kode: string;
  nama: string;
  kelompok: string;
  dimensi: Dimensi;
  tipe: TipeItem;
  satuan: string | null;
  wajib: boolean;
  urutan: number;
  aktif: boolean;
  tampil_dashboard: boolean;
  keterangan: string | null;
}

export interface OpsiRef {
  item_kode: string;
  kode: string;
  label: string;
  normal: boolean;
  urutan: number;
  aktif: boolean;
}

export interface RiwayatRef {
  id: string;
  tabel: string;
  kunci: string;
  aksi: string;
  nilai_lama: Record<string, unknown> | null;
  nilai_baru: Record<string, unknown> | null;
  oleh_nama: string | null;
  pada: string;
}

const RIWAYAT_TAMPIL = 20;

export function usePengaturanRef(oleh: string) {
  const toast = useToast();
  const [item, setItem] = useState<ItemRef[]>([]);
  const [opsi, setOpsi] = useState<OpsiRef[]>([]);
  const [pakaiItem, setPakaiItem] = useState<Record<string, number>>({});
  const [pakaiOpsi, setPakaiOpsi] = useState<Record<string, number>>({});
  const [riwayat, setRiwayat] = useState<RiwayatRef[]>([]);
  const [loading, setLoading] = useState(true);

  const muatRiwayat = useCallback(async () => {
    const { data } = await supabaseBrowser
      .from("hargardu_ref_audit")
      .select("id,tabel,kunci,aksi,nilai_lama,nilai_baru,oleh_nama,pada")
      .order("pada", { ascending: false })
      .limit(RIWAYAT_TAMPIL);
    setRiwayat((data ?? []) as unknown as RiwayatRef[]);
  }, []);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const [i, o, pi, po] = await Promise.all([
        supabaseBrowser.from("hargardu_item_ref").select("*").order("urutan"),
        supabaseBrowser
          .from("hargardu_opsi_ref")
          .select("*")
          .order("item_kode")
          .order("urutan"),
        supabaseBrowser.from("hargardu_item_pemakaian").select("*"),
        supabaseBrowser.from("hargardu_opsi_pemakaian").select("*"),
      ]);
      if (i.error) throw new Error(i.error.message);
      if (o.error) throw new Error(o.error.message);

      // Angka pemakaian yang gagal dibaca TIDAK boleh diam. Tanpa angka itu
      // layar menawarkan tombol Hapus untuk semua baris — penjaga di database
      // tetap menolak, tapi orang terlanjur menekan dan yang terbaca cuma
      // "gagal". Biasanya sebabnya satu: `scripts/hargardu-view.sql` belum
      // dijalankan ulang.
      if (pi.error || po.error) {
        toast.error(
          "Daftar pemakaian item belum ada — jalankan ulang scripts/hargardu-view.sql di Supabase. Sampai itu, tombol hapus tidak bisa dijaga dari layar.",
        );
      }

      setItem((i.data ?? []) as unknown as ItemRef[]);
      setOpsi((o.data ?? []) as unknown as OpsiRef[]);
      setPakaiItem(
        Object.fromEntries(
          (pi.data ?? []).map((r) => [r.item_kode as string, Number(r.dipakai ?? 0)]),
        ),
      );
      setPakaiOpsi(
        Object.fromEntries(
          (po.data ?? []).map((r) => [`${r.item_kode}/${r.opsi_kode}`, Number(r.dipakai ?? 0)]),
        ),
      );
      await muatRiwayat();
    } catch (e) {
      toast.error(`Gagal memuat daftar isian: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }, [toast, muatRiwayat]);

  useEffect(() => {
    void muat();
  }, [muat]);

  /**
   * Baris yang baru disimpan dibaca ULANG dari database, bukan ditebak dari
   * isian layar: fungsi penyimpannya memangkas spasi dan menurunkan huruf kode,
   * jadi menyalin masukan mentah ke state membuat layar sedikit berbeda dari isi
   * sebenarnya — beda yang baru ketahuan setelah halaman dimuat ulang.
   */
  const ambilItem = useCallback(async (kode: string) => {
    const { data } = await supabaseBrowser
      .from("hargardu_item_ref")
      .select("*")
      .eq("kode", kode)
      .maybeSingle();
    if (!data) return;
    const baris = data as unknown as ItemRef;
    setItem((prev) => {
      const ada = prev.some((x) => x.kode === baris.kode);
      const baru = ada ? prev.map((x) => (x.kode === baris.kode ? baris : x)) : [...prev, baris];
      return baru.sort((a, b) => a.urutan - b.urutan);
    });
  }, []);

  const ambilOpsi = useCallback(async (itemKode: string, kode: string) => {
    const { data } = await supabaseBrowser
      .from("hargardu_opsi_ref")
      .select("*")
      .eq("item_kode", itemKode)
      .eq("kode", kode)
      .maybeSingle();
    if (!data) return;
    const baris = data as unknown as OpsiRef;
    setOpsi((prev) => {
      const ada = prev.some((x) => x.item_kode === baris.item_kode && x.kode === baris.kode);
      const baru = ada
        ? prev.map((x) => (x.item_kode === baris.item_kode && x.kode === baris.kode ? baris : x))
        : [...prev, baris];
      return baru.sort((a, b) => a.item_kode.localeCompare(b.item_kode) || a.urutan - b.urutan);
    });
  }, []);

  const simpanItem = useCallback(
    async (v: ItemRef) => {
      const { error } = await supabaseBrowser.rpc("simpan_item_hargardu", {
        p_kode: v.kode,
        p_nama: v.nama,
        p_kelompok: v.kelompok,
        p_dimensi: v.dimensi,
        p_tipe: v.tipe,
        p_satuan: v.satuan,
        p_wajib: v.wajib,
        p_urutan: v.urutan,
        p_aktif: v.aktif,
        p_tampil_dashboard: v.tampil_dashboard,
        p_keterangan: v.keterangan,
        p_oleh: oleh,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      await Promise.all([ambilItem(v.kode.trim().toLowerCase()), muatRiwayat()]);
      return true;
    },
    [oleh, toast, ambilItem, muatRiwayat],
  );

  const hapusItem = useCallback(
    async (kode: string) => {
      const { error } = await supabaseBrowser.rpc("hapus_item_hargardu", {
        p_kode: kode,
        p_oleh: oleh,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      setItem((prev) => prev.filter((x) => x.kode !== kode));
      setOpsi((prev) => prev.filter((x) => x.item_kode !== kode));
      await muatRiwayat();
      toast.success("Item dihapus.");
      return true;
    },
    [oleh, toast, muatRiwayat],
  );

  const simpanOpsi = useCallback(
    async (v: OpsiRef) => {
      const { error } = await supabaseBrowser.rpc("simpan_opsi_hargardu", {
        p_item: v.item_kode,
        p_kode: v.kode,
        p_label: v.label,
        p_normal: v.normal,
        p_urutan: v.urutan,
        p_aktif: v.aktif,
        p_oleh: oleh,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      await Promise.all([ambilOpsi(v.item_kode, v.kode.trim().toLowerCase()), muatRiwayat()]);
      return true;
    },
    [oleh, toast, ambilOpsi, muatRiwayat],
  );

  const hapusOpsi = useCallback(
    async (itemKode: string, kode: string) => {
      const { error } = await supabaseBrowser.rpc("hapus_opsi_hargardu", {
        p_item: itemKode,
        p_kode: kode,
        p_oleh: oleh,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      setOpsi((prev) => prev.filter((x) => !(x.item_kode === itemKode && x.kode === kode)));
      await muatRiwayat();
      toast.success("Pilihan dihapus.");
      return true;
    },
    [oleh, toast, muatRiwayat],
  );

  /** Item dikelompokkan seperti urutan orang memeriksa gardu, bukan menurut abjad. */
  const kelompok = useMemo(() => {
    const m = new Map<string, ItemRef[]>();
    for (const i of item) {
      const daftar = m.get(i.kelompok) ?? [];
      daftar.push(i);
      m.set(i.kelompok, daftar);
    }
    return [...m]
      .map(([nama, daftar]) => ({
        nama,
        daftar,
        urutan: Math.min(...daftar.map((d) => d.urutan)),
      }))
      .sort((a, b) => a.urutan - b.urutan);
  }, [item]);

  const opsiPer = useCallback(
    (itemKode: string) => opsi.filter((o) => o.item_kode === itemKode),
    [opsi],
  );

  return {
    kelompok,
    opsiPer,
    pakaiItem,
    pakaiOpsi,
    riwayat,
    loading,
    muat,
    simpanItem,
    hapusItem,
    simpanOpsi,
    hapusOpsi,
  };
}
