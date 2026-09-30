"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Isian & pilihan Inspeksi JTM — dikelola dari web, seperti Pengaturan JTR.
 *
 * Berbeda dengan JTR, item JTM bukan kolom tabel: jawabannya disimpan per
 * `item_kode`. Jadi item BARU pun bisa ditambah dari sini tanpa rilis aplikasi
 * — HP menyusun formulirnya dari tabel ini.
 *
 * Yang sengaja tidak bisa diubah: KODE item dan kode pilihan. Keduanya tertulis
 * di ribuan baris jawaban; mengganti labelnya saja yang aman.
 */

export type Milik = "tiang" | "sirkit";

export interface ItemIsian {
  kode: string;
  nama: string;
  kelompok: string;
  tipe: "pilihan" | "angka" | "teks";
  dimensi: "tunggal" | "fasa" | "sirkit";
  tier: string;
  milik: Milik;
  wajib: boolean;
  aktif: boolean;
  urutan: number;
  sumberOpsi: string | null;
  syaratItem: string | null;
  syaratNilai: string[];
  syaratNegasi: boolean;
}

export interface OpsiIsian {
  itemKode: string;
  kode: string;
  label: string;
  normal: boolean;
  aktif: boolean;
  urutan: number;
  /** Disalin dari daftar Pengaturan (mis. ukuran penghantar) — labelnya diatur di sana. */
  dariRef: boolean;
}

export interface Syarat {
  item: string | null;
  nilai: string[];
  negasi: boolean;
}

export interface ItemBaru {
  nama: string;
  kelompok: string;
  tipe: ItemIsian["tipe"];
  dimensi: "tunggal" | "fasa";
  milik: Milik;
  syarat: Syarat;
}

/** "Kondisi Aksesoris MVTIC" → "kondisi_aksesoris_mvtic". */
export const jadiKode = (teks: string) =>
  teks
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const KOLOM_ITEM =
  "kode,nama,kelompok,tipe,dimensi,tier,milik,wajib,aktif,urutan,sumber_opsi,syarat_item,syarat_nilai,syarat_negasi";

export function useJtmIsian() {
  const toast = useToast();
  const [item, setItem] = useState<ItemIsian[]>([]);
  const [opsi, setOpsi] = useState<OpsiIsian[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        supabaseBrowser.from("jtm_item_ref").select(KOLOM_ITEM).order("urutan"),
        supabaseBrowser.from("jtm_opsi_ref").select("item_kode,kode,label,normal,aktif,urutan,dari_ref").order("urutan"),
      ]);
      if (a.error) throw new Error(a.error.message);
      if (b.error) throw new Error(b.error.message);
      setItem(
        (a.data ?? []).map((r) => ({
          kode: r.kode,
          nama: r.nama,
          kelompok: r.kelompok,
          tipe: r.tipe,
          dimensi: r.dimensi,
          tier: r.tier,
          milik: r.milik,
          wajib: !!r.wajib,
          aktif: !!r.aktif,
          urutan: Number(r.urutan ?? 0),
          sumberOpsi: r.sumber_opsi ?? null,
          syaratItem: r.syarat_item ?? null,
          syaratNilai: r.syarat_nilai ?? [],
          syaratNegasi: !!r.syarat_negasi,
        })) as ItemIsian[],
      );
      setOpsi(
        (b.data ?? []).map((r) => ({
          itemKode: r.item_kode,
          kode: r.kode,
          label: r.label,
          normal: !!r.normal,
          aktif: !!r.aktif,
          urutan: Number(r.urutan ?? 0),
          dariRef: !!r.dari_ref,
        })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void muat();
  }, [muat]);

  /** Urutan tampil di HP: kelompok mengikuti item pertamanya. */
  const kelompok = useMemo(() => {
    const m = new Map<string, ItemIsian[]>();
    for (const i of item) m.set(i.kelompok, [...(m.get(i.kelompok) ?? []), i]);
    return [...m.entries()];
  }, [item]);

  const opsiPer = useCallback((kode: string) => opsi.filter((o) => o.itemKode === kode), [opsi]);

  /** Penjaga di database menerangkan sendiri kenapa ditolak — diteruskan apa adanya. */
  const jalankan = useCallback(
    async (kerja: PromiseLike<{ error: { message: string } | null }>, berhasil?: string) => {
      const { error } = await kerja;
      if (error) {
        toast.error(error.message);
        return false;
      }
      if (berhasil) toast.success(berhasil);
      await muat();
      return true;
    },
    [toast, muat],
  );

  const ubahItem = useCallback(
    (kode: string, patch: Partial<Record<string, unknown>>) =>
      jalankan(
        supabaseBrowser
          .from("jtm_item_ref")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("kode", kode),
      ),
    [jalankan],
  );

  const ubahSyarat = useCallback(
    (kode: string, s: Syarat) =>
      ubahItem(kode, {
        syarat_item: s.item,
        syarat_nilai: s.item ? s.nilai : null,
        syarat_negasi: s.item ? s.negasi : false,
      }),
    [ubahItem],
  );

  const tambahItem = useCallback(
    async (v: ItemBaru) => {
      const kode = jadiKode(v.nama);
      if (!kode) return false;
      if (item.some((i) => i.kode === kode)) {
        toast.error(`Item berkode "${kode}" sudah ada. Beri nama yang berbeda.`);
        return false;
      }
      // Ditaruh di ujung kelompoknya; kelompok baru di ujung formulir.
      const sekelompok = item.filter((i) => i.kelompok === v.kelompok);
      const urutan = (sekelompok.length ? Math.max(...sekelompok.map((i) => i.urutan)) : Math.max(0, ...item.map((i) => i.urutan))) + 1;
      return jalankan(
        supabaseBrowser.from("jtm_item_ref").insert({
          kode,
          nama: v.nama.trim(),
          kelompok: v.kelompok.trim(),
          tipe: v.tipe,
          dimensi: v.dimensi,
          milik: v.milik,
          tier: "12",
          wajib: true,
          urutan,
          // Item pilihan lahir NONAKTIF: tanpa pilihan, isian wajib di HP tidak
          // bisa dijawab dan menghalangi simpan. Diaktifkan sesudah pilihannya diisi.
          aktif: v.tipe !== "pilihan",
          syarat_item: v.syarat.item,
          syarat_nilai: v.syarat.item ? v.syarat.nilai : null,
          syarat_negasi: v.syarat.item ? v.syarat.negasi : false,
        }),
        v.tipe === "pilihan"
          ? "Item dibuat, masih nonaktif — tambahkan pilihannya lalu aktifkan."
          : "Item dibuat.",
      );
    },
    [item, jalankan, toast],
  );

  const simpanOpsi = useCallback(
    (o: Omit<OpsiIsian, "dariRef">) =>
      jalankan(
        supabaseBrowser.from("jtm_opsi_ref").upsert(
          { item_kode: o.itemKode, kode: o.kode, label: o.label, normal: o.normal, aktif: o.aktif, urutan: o.urutan },
          { onConflict: "item_kode,kode" },
        ),
      ),
    [jalankan],
  );

  const tambahOpsi = useCallback(
    (itemKode: string, label: string, normal: boolean) => {
      const kode = jadiKode(label);
      const ada = opsi.filter((o) => o.itemKode === itemKode);
      if (!kode) return Promise.resolve(false);
      if (ada.some((o) => o.kode === kode)) {
        toast.error(`Pilihan "${label}" sudah ada di item ini.`);
        return Promise.resolve(false);
      }
      const urutan = (ada.length ? Math.max(...ada.map((o) => o.urutan)) : 0) + 10;
      return simpanOpsi({ itemKode, kode, label: label.trim(), normal, aktif: true, urutan });
    },
    [opsi, simpanOpsi, toast],
  );

  const hapusOpsi = useCallback(
    (itemKode: string, kode: string) =>
      jalankan(supabaseBrowser.from("jtm_opsi_ref").delete().eq("item_kode", itemKode).eq("kode", kode), "Pilihan dihapus."),
    [jalankan],
  );

  return { item, kelompok, opsiPer, loading, ubahItem, ubahSyarat, tambahItem, simpanOpsi, tambahOpsi, hapusOpsi };
}
