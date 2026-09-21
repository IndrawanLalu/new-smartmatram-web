"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Katalog field isian tiang JTR beserta daftar pilihannya — dibaca di sini
 * hanya untuk menyetel JAWABAN BAWAAN, yaitu isian yang dipasang tombol
 * "Tiang baik" di HP petugas.
 *
 * Padanan `useJtmItem` untuk JTM, dan bedanya cuma satu: pilihan JTR
 * dikelompokkan per KATEGORI, bukan per field. Tiga field aksesoris —
 * suspension, large angle, dead end — memakai daftar `kondisi_aksesoris` yang
 * sama, dan menyalinnya tiga kali berarti tiga tempat yang harus disunting
 * setiap kali ada pilihan baru.
 *
 * `nilaiBawaan` SENGAJA TERPISAH dari `jtr_ref.normal`, dan bedanya
 * menentukan gunanya masing-masing:
 *
 *   `normal`       menjawab "apakah jawaban ini sebuah temuan". Satu field boleh
 *                  punya banyak jawaban yang sama-sama bukan temuan — tiang
 *                  beton normal, besi juga normal.
 *
 *   `nilaiBawaan`  menjawab "kalau tiangnya biasa saja, isinya apa". Hanya satu,
 *                  dan tidak bisa disimpulkan dari yang di atas: itu keputusan
 *                  orang yang tahu tiang di wilayahnya kebanyakan bentuknya apa.
 */

export interface ItemJtr {
  field: string;
  nama: string;
  kelompok: string;
  urutan: number;
  tipe: "pilihan" | "angka" | "boolean";
  /** Kategori di `jtr_ref`. Kosong untuk tipe angka dan boolean. */
  kategori: string | null;
  satuan: string | null;
  /** NULL = tidak diisi otomatis → petugas wajib memilih sendiri. */
  nilaiBawaan: string | null;
  aktif: boolean;
  /** Isian ini hanya ditanyakan kalau jawaban `syaratItem` ada di `syaratNilai`. */
  syaratItem: string | null;
  syaratNilai: string[];
  /** true = tampil kalau jawaban penentu BUKAN salah satu `syaratNilai`. */
  syaratNegasi: boolean;
}

export interface OpsiJtr {
  kategori: string;
  kode: string;
  label: string;
  normal: boolean;
}

export function useJtrItem() {
  const toast = useToast();
  const [item, setItem] = useState<ItemJtr[]>([]);
  const [opsi, setOpsi] = useState<OpsiJtr[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        supabaseBrowser
          .from("jtr_item_ref")
          // Yang nonaktif ikut dibaca: halaman Pengaturan harus bisa
          // menghidupkannya lagi, dan itu mustahil kalau dia tidak pernah muncul.
          .select(
            "field,nama,kelompok,urutan,tipe,kategori,satuan,nilai_bawaan,aktif,syarat_item,syarat_nilai,syarat_negasi",
          )
          .order("urutan"),
        supabaseBrowser
          .from("jtr_ref")
          .select("kategori,kode,label,normal,urutan")
          .eq("aktif", true)
          .order("urutan"),
      ]);
      if (a.error) throw new Error(a.error.message);
      if (b.error) throw new Error(b.error.message);

      setItem(
        (a.data ?? []).map((r) => ({
          field: r.field as string,
          nama: r.nama as string,
          kelompok: r.kelompok as string,
          urutan: Number(r.urutan ?? 0),
          tipe: r.tipe as ItemJtr["tipe"],
          kategori: (r.kategori as string) ?? null,
          satuan: (r.satuan as string) ?? null,
          nilaiBawaan: (r.nilai_bawaan as string) ?? null,
          aktif: r.aktif !== false,
          syaratItem: (r.syarat_item as string) ?? null,
          syaratNilai: (r.syarat_nilai as string[]) ?? [],
          syaratNegasi: !!r.syarat_negasi,
        })),
      );
      setOpsi(
        (b.data ?? []).map((r) => ({
          kategori: r.kategori as string,
          kode: r.kode as string,
          label: r.label as string,
          normal: !!r.normal,
        })),
      );
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      // Tabelnya baru — kalau skripnya belum dijalankan, katakan apa adanya
      // daripada membiarkan layar kosong tanpa sebab.
      toast.error(
        pesan.includes("does not exist")
          ? "Tabel jtr_item_ref belum ada — jalankan scripts/jtr-baik.sql di Supabase."
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
    (kategori: string | null) => (kategori ? opsi.filter((o) => o.kategori === kategori) : []),
    [opsi],
  );

  /** Dikelompokkan sesuai urutan halamannya di HP, supaya yang dilihat admin
   *  di sini susunannya sama dengan yang dilihat petugas di lapangan. */
  const kelompok = useMemo(() => {
    const m = new Map<string, ItemJtr[]>();
    for (const i of item.filter((x) => x.aktif)) {
      const d = m.get(i.kelompok) ?? [];
      d.push(i);
      m.set(i.kelompok, d);
    }
    return [...m.entries()];
  }, [item]);

  const setBawaan = useCallback(
    async (field: string, nilai: string | null) => {
      // Ditulis dulu ke layar, baru ke server: dropdown yang menunggu jaringan
      // sebelum berubah terasa seperti klik yang tidak terjadi.
      const sebelum = item;
      setItem((s) => s.map((i) => (i.field === field ? { ...i, nilaiBawaan: nilai } : i)));

      const { error } = await supabaseBrowser
        .from("jtr_item_ref")
        .update({ nilai_bawaan: nilai })
        .eq("field", field);

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

  /** Semua isian termasuk yang nonaktif, untuk halaman Pengaturan. */
  const kelompokSemua = useMemo(() => {
    const m = new Map<string, ItemJtr[]>();
    for (const i of item) {
      const d = m.get(i.kelompok) ?? [];
      d.push(i);
      m.set(i.kelompok, d);
    }
    return [...m.entries()];
  }, [item]);

  /**
   * Ganti nama atau status isian.
   *
   * `field` TIDAK ikut berubah — dia kunci yang menyambungkan isian ini dengan
   * kolom database dan dengan kode aplikasi. Yang diganti di sini cuma yang
   * dibaca orang, dan tiap unit berhak memakai istilah regunya sendiri.
   */
  const setIsian = useCallback(
    async (field: string, patch: { nama?: string; aktif?: boolean; urutan?: number }) => {
      const sebelum = item;
      setItem((s) =>
        s.map((i) =>
          i.field === field
            ? {
                ...i,
                nama: patch.nama ?? i.nama,
                aktif: patch.aktif ?? i.aktif,
                urutan: patch.urutan ?? i.urutan,
              }
            : i,
        ),
      );

      const { error } = await supabaseBrowser
        .from("jtr_item_ref")
        .update(patch)
        .eq("field", field);

      if (error) {
        toast.error(error.message);
        setItem(sebelum);
        return false;
      }
      return true;
    },
    [item, toast],
  );

  return { item, kelompok, kelompokSemua, opsiPer, loading, muat, setBawaan, setIsian };
}
