"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { useToast } from "@/app/admin/_components/Toast";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

/** Jenis titik ujung segmen. Yang MEMOTONG jaringan ditandai — pengambilan
 *  tidak memotong, dia percabangan di dalam segmen. */
export const JENIS_TITIK = [
  { kode: "GI", label: "GI", memotong: true },
  { kode: "PMT", label: "PMT", memotong: true },
  { kode: "PLTD", label: "PLTD", memotong: true },
  { kode: "REC", label: "Recloser", memotong: true },
  { kode: "LBS", label: "LBS", memotong: true },
  { kode: "PENG", label: "Pengambilan", memotong: false },
  { kode: "TIANG", label: "Tiang percabangan", memotong: false },
  { kode: "GARDU", label: "Gardu", memotong: false },
  { kode: "UJUNG", label: "Ujung jaringan", memotong: false },
] as const;

export interface SegmenBaris {
  segmen_id: string;
  nama: string;
  penyulang: string;
  ulp: string;
  status: string;
  induk_segmen_id: string | null;
  induk_nama: string | null;
  jumlah_anak: number;
  jumlah_tiang: number;
  jumlah_gawang: number;
  panjang_km: number;
  gawang_tanpa_titik: number;
  gawang_terpanjang_m: number | null;
  tiang_bersama: number;
  titik_awal_jenis: string;
  titik_awal_nama: string;
  titik_akhir_jenis: string;
  titik_akhir_nama: string;
  penghantar_jenis: string | null;
  penghantar_ukuran: number | null;
  sumber: string;
  dikonfirmasi_at: string | null;
  created_at: string;
  tanpa_batas_hubung: boolean;
}

export interface SegmenBaru {
  penyulang: string;
  ulp: string;
  titik_awal_jenis: string;
  titik_awal_nama: string;
  titik_akhir_jenis: string;
  titik_akhir_nama: string;
  penghantar_jenis: string | null;
  penghantar_ukuran: number | null;
  catatan: string | null;
}

/** Nama segmen dibentuk database, tapi layar perlu memperlihatkannya sebelum
 *  disimpan — kalau tidak, orang baru tahu namanya setelah terlanjur. */
export const namaSegmen = (
  awalJenis: string,
  awalNama: string,
  akhirJenis: string,
  akhirNama: string,
) => {
  const label = (jenis: string, nama: string) => {
    const n = nama.trim().toUpperCase();
    if (jenis === "UJUNG" && !n) return "UJUNG";
    return ["REC", "LBS", "PENG", "PMT"].includes(jenis) ? `${jenis}. ${n}` : `${jenis} ${n}`;
  };
  return `${label(awalJenis, awalNama)} - ${label(akhirJenis, akhirNama)}`;
};

/** Tiang yang belum masuk segmen mana pun — tidak terlihat regu saat menyapu. */
interface TiangLepas {
  id: string;
  penyulang: string;
  segmen_tiang: { segmen_id: string }[] | null;
}

export function useSegmen(user: CurrentUser, ulpPilihan: string) {
  const toast = useToast();
  const [baris, setBaris] = useState<SegmenBaris[]>([]);
  const [penyulangList, setPenyulangList] = useState<string[]>([]);
  const [lepas, setLepas] = useState<{ jumlah: number; penyulang: string[] }>({
    jumlah: 0,
    penyulang: [],
  });
  const [loading, setLoading] = useState(true);

  const unit = canSeeAllUnits(user.role) ? ulpPilihan || null : (user.unit ?? null);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAllRows<SegmenBaris>(() => {
        const q = supabaseBrowser
          .from("segmen_ringkas")
          .select("*")
          .eq("status", "aktif")
          .order("penyulang")
          .order("nama");
        return unit ? q.eq("ulp", unit) : q;
      });
      setBaris(rows);

      const { data } = await supabaseBrowser
        .from("penyulang_ref")
        .select("penyulang,ulp")
        .order("penyulang");
      setPenyulangList(
        (data ?? [])
          .filter((p) => !unit || String(p.ulp ?? "").toUpperCase() === unit.toUpperCase())
          .map((p) => String(p.penyulang)),
      );

      // Tiang yang sudah ada di master tapi belum masuk segmen mana pun. Dia
      // tidak muncul di penyapuan — regu menyapu per segmen — jadi keadaan ini
      // harus KELIHATAN, bukan cuma terbaca sebagai "segmennya kosong".
      const tiang = await fetchAllRows<TiangLepas>(() => {
        const q = supabaseBrowser
          .from("tiang")
          .select("id,penyulang,segmen_tiang(segmen_id)")
          .not("penyulang", "is", null)
          .is("gardu_kode", null)
          .eq("status_hidup", "aktif")
          .order("id");
        return unit ? q.eq("ulp", unit) : q;
      });
      const tanpa = tiang.filter((t) => (t.segmen_tiang?.length ?? 0) === 0);
      setLepas({
        jumlah: tanpa.length,
        penyulang: [...new Set(tanpa.map((t) => t.penyulang))].sort(),
      });
    } catch (e) {
      toast.error(`Gagal memuat segmen: ${e instanceof Error ? e.message : e}`);
      setBaris([]);
    } finally {
      setLoading(false);
    }
  }, [unit, toast]);

  useEffect(() => {
    void muat();
  }, [muat]);

  /** Mengembalikan ID segmen baru (bukan sekadar true) supaya layar peta bisa
   *  langsung menjadikannya tujuan — segmen yang baru dibuat hampir selalu
   *  segmen yang sedang ingin diisi. */
  const buat = useCallback(
    async (v: SegmenBaru): Promise<string | null> => {
      // `nama` dan `induk_segmen_id` sengaja TIDAK dikirim — keduanya dibentuk
      // trigger. Mengirimnya dari layar berarti dua tempat yang bisa berselisih.
      const { data, error } = await supabaseBrowser.from("segmen").insert({
        penyulang: v.penyulang.trim(),
        ulp: v.ulp.toUpperCase(),
        titik_awal_jenis: v.titik_awal_jenis,
        titik_awal_nama: v.titik_awal_nama.trim(),
        titik_akhir_jenis: v.titik_akhir_jenis,
        titik_akhir_nama: v.titik_akhir_nama.trim(),
        penghantar_jenis: v.penghantar_jenis,
        penghantar_ukuran: v.penghantar_ukuran,
        catatan: v.catatan,
        sumber: "manual",
      }).select("id").maybeSingle();
      if (error) {
        toast.error(
          error.message.includes("segmen_nama_unik")
            ? "Segmen dengan nama itu sudah ada di penyulang ini."
            : error.message,
        );
        return null;
      }
      toast.success("Segmen dibuat.");
      await muat();
      return (data?.id as string) ?? null;
    },
    [toast, muat],
  );

  const gabung = useCallback(
    async (dari: string, ke: string) => {
      const { data, error } = await supabaseBrowser.rpc("gabung_segmen", {
        p_dari: dari,
        p_ke: ke,
        p_oleh: user.name || user.email,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success(`${data ?? 0} tiang dipindahkan, segmen asal dinonaktifkan.`);
      await muat();
      return true;
    },
    [toast, muat, user.name, user.email],
  );

  const total = useMemo(
    () => ({
      segmen: baris.length,
      tiang: baris.reduce((s, b) => s + Number(b.jumlah_tiang ?? 0), 0),
      km: baris.reduce((s, b) => s + Number(b.panjang_km ?? 0), 0),
      bersama: baris.reduce((s, b) => s + Number(b.tiang_bersama ?? 0), 0),
    }),
    [baris],
  );

  return { baris, penyulangList, lepas, total, loading, muat, buat, gabung };
}
