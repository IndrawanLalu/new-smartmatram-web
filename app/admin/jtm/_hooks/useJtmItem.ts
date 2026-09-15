"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Item pemeriksaan JTM beserta pilihan jawabannya — dibaca di sini hanya untuk
 * menyetel JAWABAN BAWAAN, yaitu isian yang dipasang tombol "Tiang normal" di
 * HP petugas.
 *
 * `nilai_bawaan` SENGAJA TERPISAH dari `jtm_opsi_ref.normal`, dan bedanya
 * menentukan gunanya masing-masing:
 *
 *   `normal`       menjawab "apakah jawaban ini sebuah temuan". Satu item boleh
 *                  punya banyak jawaban yang sama-sama bukan temuan — tiang
 *                  beton 9 m normal, besi 11 m juga normal.
 *
 *   `nilai_bawaan` menjawab "kalau tiangnya biasa saja, isinya apa". Hanya satu,
 *                  dan tidak bisa disimpulkan dari yang di atas: itu keputusan
 *                  orang yang tahu tiang di wilayahnya kebanyakan bentuknya apa.
 */

export interface ItemRef {
  kode: string;
  nama: string;
  kelompok: string;
  tipe: "pilihan" | "angka" | "teks";
  dimensi: "tunggal" | "fasa" | "sirkit";
  tier: string;
  satuan: string | null;
  urutan: number;
  nilaiBawaan: string | null;
  /** Item ini hanya ditanyakan kalau jawaban `syaratItem` ada di `syaratNilai`.
   *  Arrester, FCO, skur, jumperan, gardu, keypoint — tidak satu pun ada di
   *  setiap tiang. */
  syaratItem: string | null;
  syaratNilai: string[];
  /** true = tampil kalau jawaban penentu BUKAN salah satu syaratNilai. */
  syaratNegasi: boolean;
}

export interface OpsiRef {
  itemKode: string;
  kode: string;
  label: string;
  normal: boolean;
}

export function useJtmItem() {
  const toast = useToast();
  const [item, setItem] = useState<ItemRef[]>([]);
  const [opsi, setOpsi] = useState<OpsiRef[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        supabaseBrowser
          .from("jtm_item_ref")
          .select("kode,nama,kelompok,tipe,dimensi,tier,satuan,urutan,nilai_bawaan,syarat_item,syarat_nilai,syarat_negasi")
          .eq("aktif", true)
          .order("urutan"),
        supabaseBrowser
          .from("jtm_opsi_ref")
          .select("item_kode,kode,label,normal,urutan")
          .eq("aktif", true)
          .order("urutan"),
      ]);
      if (a.error) throw new Error(a.error.message);
      if (b.error) throw new Error(b.error.message);

      setItem(
        (a.data ?? []).map((r) => ({
          kode: r.kode as string,
          nama: r.nama as string,
          kelompok: r.kelompok as string,
          tipe: r.tipe as ItemRef["tipe"],
          dimensi: r.dimensi as ItemRef["dimensi"],
          tier: r.tier as string,
          satuan: (r.satuan as string) ?? null,
          urutan: Number(r.urutan ?? 0),
          nilaiBawaan: (r.nilai_bawaan as string) ?? null,
          syaratItem: (r.syarat_item as string) ?? null,
          syaratNilai: (r.syarat_nilai as string[]) ?? [],
          syaratNegasi: !!r.syarat_negasi,
        })),
      );
      setOpsi(
        (b.data ?? []).map((r) => ({
          itemKode: r.item_kode as string,
          kode: r.kode as string,
          label: r.label as string,
          normal: !!r.normal,
        })),
      );
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      toast.error(
        pesan.includes("nilai_bawaan")
          ? "Kolom nilai_bawaan belum ada — jalankan scripts/jtm-normal.sql di Supabase."
          : pesan.includes("syarat_item")
            ? "Kolom syarat_item belum ada — jalankan scripts/jtm-syarat.sql di Supabase."
            : pesan,
      );
      setItem([]);
      setOpsi([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const opsiPer = useCallback(
    (itemKode: string) => opsi.filter((o) => o.itemKode === itemKode),
    [opsi],
  );

  /** Dikelompokkan sesuai urutan tampilnya di HP, supaya yang dilihat admin
   *  di sini susunannya sama dengan yang dilihat petugas di lapangan. */
  const kelompok = useMemo(() => {
    const m = new Map<string, ItemRef[]>();
    for (const i of item) {
      const d = m.get(i.kelompok) ?? [];
      d.push(i);
      m.set(i.kelompok, d);
    }
    return [...m.entries()];
  }, [item]);

  const setBawaan = useCallback(
    async (kode: string, nilai: string | null) => {
      // Ditulis dulu ke layar, baru ke server: dropdown yang menunggu jaringan
      // sebelum berubah terasa seperti klik yang tidak terjadi.
      const sebelum = item;
      setItem((s) => s.map((i) => (i.kode === kode ? { ...i, nilaiBawaan: nilai } : i)));

      const { error } = await supabaseBrowser
        .from("jtm_item_ref")
        .update({ nilai_bawaan: nilai, updated_at: new Date().toISOString() })
        .eq("kode", kode);

      if (error) {
        // Penjaga di database sudah menjelaskan sendiri kenapa ditolak —
        // teruskan apa adanya, dan kembalikan layar ke keadaan sebenarnya.
        toast.error(error.message);
        setItem(sebelum);
        return false;
      }
      return true;
    },
    [item, toast],
  );

  return { item, kelompok, opsiPer, loading, muat, setBawaan };
}
