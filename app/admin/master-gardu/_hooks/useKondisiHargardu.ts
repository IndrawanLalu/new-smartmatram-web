"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import {
  lolosKondisi, bangunNilaiItem, bangunKeadaanHar,
  type SaringanKondisi, type NilaiKondisi, type BarisKondisi, type BarisHar,
  type KeadaanHar,
} from "../_lib/kondisiGardu";

// ── Bentuk data ───────────────────────────────────────────────────────────────

export interface OpsiKondisi {
  kode: string;
  label: string;
  normal: boolean;
}

export interface ItemKondisi {
  kode: string;
  nama: string;
  kelompok: string;
  dimensi: "tunggal" | "fasa" | "jurusan";
  tampilDashboard: boolean;
  urutan: number;
  opsi: OpsiKondisi[];
}

// ── Acuan item & pilihan ──────────────────────────────────────────────────────

/**
 * Daftar item beserta pilihannya, langsung dari tabel acuan.
 *
 * Tidak ada satu pun kode item yang ditulis di berkas ini. Begitu UP3 menambah
 * item atau pilihan baru dari halaman pengaturan, saringannya muncul sendiri —
 * kalau daftarnya dikeraskan di kode, item baru akan selamanya tidak bisa
 * disaring dan tidak ada galat apa pun yang memberi tahu.
 */
export function useAcuanKondisi(aktif: boolean) {
  const [item, setItem] = useState<ItemKondisi[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!aktif) return;
    let hidup = true;

    (async () => {
      setMemuat(true);
      setGalat(null);
      try {
        const [i, o] = await Promise.all([
          supabaseBrowser
            .from("hargardu_item_ref")
            .select("kode,nama,kelompok,dimensi,tampil_dashboard,urutan")
            .eq("aktif", true)
            .eq("tipe", "pilihan")
            .order("urutan"),
          supabaseBrowser
            .from("hargardu_opsi_ref")
            .select("item_kode,kode,label,normal")
            .eq("aktif", true)
            .order("urutan"),
        ]);
        if (i.error) throw new Error(i.error.message);
        if (o.error) throw new Error(o.error.message);
        if (!hidup) return;

        const perItem = new Map<string, OpsiKondisi[]>();
        for (const r of o.data ?? []) {
          const daftar = perItem.get(r.item_kode) ?? [];
          daftar.push({ kode: r.kode, label: r.label, normal: r.normal });
          perItem.set(r.item_kode, daftar);
        }

        setItem(
          (i.data ?? []).map((r) => ({
            kode: r.kode,
            nama: r.nama,
            kelompok: r.kelompok,
            dimensi: r.dimensi as ItemKondisi["dimensi"],
            tampilDashboard: r.tampil_dashboard,
            urutan: r.urutan,
            opsi: perItem.get(r.kode) ?? [],
          })),
        );
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : "Gagal memuat acuan kondisi");
      } finally {
        if (hidup) setMemuat(false);
      }
    })();

    return () => {
      hidup = false;
    };
  }, [aktif]);

  return { item, memuat, galat };
}

// ── Kondisi per gardu ─────────────────────────────────────────────────────────

/**
 * Menerjemahkan saringan kondisi jadi penilai per gardu.
 *
 * Yang ditarik dari server HANYA item yang sedang disaring, bukan seluruh
 * `gardu_kondisi_terakhir`. Bedanya besar: view itu berisi satu baris per item
 * per gardu — tiga puluh tiga item dikali dua setengah ribu gardu, dan sebagian
 * per jurusan. Menariknya utuh ke browser demi satu saringan tekep berarti
 * memindahkan ratusan ribu baris untuk membuang hampir semuanya.
 */
export function useKondisiHargardu(unit: string, saringan: SaringanKondisi, aktif: boolean) {
  const [harTerakhir, setHarTerakhir] = useState<Map<string, KeadaanHar>>(new Map());
  const [nilaiPerItem, setNilaiPerItem] = useState<Map<string, Map<string, NilaiKondisi[]>>>(
    new Map(),
  );
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Kunci teks yang stabil supaya efek tidak berjalan ulang tiap render hanya
  // karena objek saringannya dibuat baru.
  const kunciSaringan = useMemo(
    () =>
      Object.entries(saringan)
        .filter(([, v]) => v.length > 0)
        .map(([k, v]) => `${k}:${[...v].sort().join(",")}`)
        .sort()
        .join(";"),
    [saringan],
  );

  /** Tanggal pemeliharaan terverifikasi terakhir per gardu. */
  useEffect(() => {
    if (!aktif) return;
    let hidup = true;

    (async () => {
      try {
        const rows = await fetchAllRows<BarisHar>(() => {
          const q = supabaseBrowser
            .from("pemeliharaan_gardu")
            .select("gardu_kode,ulp,status,tgl_selesai")
            .order("gardu_kode")
            .order("ulp")
            .order("id");
          // `ilike` bukan `eq`: nama ULP di catatan pemeliharaan datang dari
          // aplikasi lapangan dan bisa berbeda huruf besar-kecilnya dari master.
          // Aman di sini karena tidak ada nama ULP yang memuat `%` atau `_`.
          return unit ? q.ilike("ulp", unit) : q;
        });
        if (!hidup) return;

        setHarTerakhir(bangunKeadaanHar(rows));
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : "Gagal memuat riwayat pemeliharaan");
      }
    })();

    return () => {
      hidup = false;
    };
  }, [aktif, unit]);

  /** Jawaban per gardu, hanya untuk item yang sedang disaring. */
  useEffect(() => {
    if (!aktif || !kunciSaringan) {
      setNilaiPerItem(new Map());
      return;
    }
    let hidup = true;
    const itemDipakai = kunciSaringan.split(";").map((g) => g.split(":")[0]);

    (async () => {
      setMemuat(true);
      setGalat(null);
      try {
        const hasil = await Promise.all(
          itemDipakai.map(async (itemKode) => {
            const rows = await fetchAllRows<BarisKondisi>(() => {
              const q = supabaseBrowser
                .from("gardu_kondisi_terakhir")
                .select("gardu_kode,ulp,bagian,nilai,nilai_label,normal")
                .eq("item_kode", itemKode)
                .order("gardu_kode")
                .order("ulp")
                .order("bagian");
              return unit ? q.ilike("ulp", unit) : q;
            });
            return [itemKode, bangunNilaiItem(rows)] as const;
          }),
        );
        if (!hidup) return;
        setNilaiPerItem(new Map(hasil));
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : "Gagal memuat kondisi gardu");
      } finally {
        if (hidup) setMemuat(false);
      }
    })();

    return () => {
      hidup = false;
    };
  }, [aktif, kunciSaringan, unit]);

  /** Penilai per gardu — aturannya di `_lib/kondisiGardu.ts`. */
  const lolos = useCallback(
    (kunci: string) => lolosKondisi(saringan, (item) => nilaiPerItem.get(item), kunci),
    [saringan, nilaiPerItem],
  );

  return { harTerakhir, nilaiPerItem, lolos, memuat, galat };
}
