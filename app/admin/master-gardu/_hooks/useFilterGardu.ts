"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { bangunKeadaanHar, bangunNilaiItem, type BarisHar, type BarisKondisi, type KeadaanHar } from "../_lib/kondisiGardu";
import type { GarduFilter, Kondisi, NilaiHar } from "../_lib/filterGardu";

const KOLOM_GARDU =
  "kode,ulp,nama,alamat,penyulang,kva_master,merk,status,kode_amg,lat,lng,event_date,persen_beban,belum_diukur";

/**
 * Data tab Filter gardu: master + pengukuran terakhir, tanggal pemeliharaan
 * terverifikasi terakhir, dan jawaban pemeliharaan HANYA untuk item yang
 * dipakai sebagai kondisi. Jawaban item disimpan per ULP — mengganti nilai
 * yang dicentang tidak menarik ulang apa pun.
 */
export function useFilterGardu(unit: string, kondisi: Kondisi[], aktif: boolean) {
  const [gardu, setGardu] = useState<GarduFilter[]>([]);
  const [har, setHar] = useState<Map<string, KeadaanHar>>(new Map());
  const [nilai, setNilai] = useState<{ unit: string; peta: NilaiHar }>({ unit, peta: new Map() });
  const [memuat, setMemuat] = useState(false);
  const [memuatItem, setMemuatItem] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!aktif) return;
    let hidup = true;
    (async () => {
      setMemuat(true);
      setGalat(null);
      try {
        const [g, h] = await Promise.all([
          fetchAllRows<GarduFilter>(() => {
            const q = supabaseBrowser.from("gardu_master_state").select(KOLOM_GARDU).order("kode").order("ulp");
            return unit ? q.eq("ulp", unit) : q;
          }),
          fetchAllRows<BarisHar>(() => {
            const q = supabaseBrowser.from("pemeliharaan_gardu").select("gardu_kode,ulp,status,tgl_selesai")
              .order("gardu_kode").order("ulp").order("id");
            // ilike: ejaan ULP catatan lapangan bisa beda huruf besar-kecil.
            return unit ? q.ilike("ulp", unit) : q;
          }),
        ]);
        if (!hidup) return;
        setGardu(g);
        setHar(bangunKeadaanHar(h));
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : "Gagal memuat data gardu");
      } finally {
        if (hidup) setMemuat(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [aktif, unit]);

  // Kunci teks stabil: hanya berubah kalau ITEM-nya berubah, bukan nilainya.
  const kunciItem = useMemo(
    () => [...new Set(kondisi.flatMap((k) => (k.jenis === "har" || k.jenis === "har-angka" ? [k.item] : [])))].sort().join(","),
    [kondisi],
  );

  useEffect(() => {
    if (!aktif) return;
    const peta = nilai.unit === unit ? nilai.peta : new Map();
    const kurang = kunciItem ? kunciItem.split(",").filter((i) => !peta.has(i)) : [];
    if (!kurang.length) {
      if (nilai.unit !== unit) setNilai({ unit, peta });
      setMemuatItem(false);
      return;
    }
    let hidup = true;
    (async () => {
      setMemuatItem(true);
      try {
        const hasil = await Promise.all(
          kurang.map(async (item) => {
            const rows = await fetchAllRows<BarisKondisi>(() => {
              const q = supabaseBrowser.from("gardu_kondisi_terakhir")
                .select("gardu_kode,ulp,bagian,nilai,nilai_label,nilai_angka,normal")
                .eq("item_kode", item).order("gardu_kode").order("ulp").order("bagian");
              return unit ? q.ilike("ulp", unit) : q;
            });
            return [item, bangunNilaiItem(rows)] as const;
          }),
        );
        if (hidup) setNilai({ unit, peta: new Map([...peta, ...hasil]) });
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : "Gagal memuat kondisi pemeliharaan");
      } finally {
        if (hidup) setMemuatItem(false);
      }
    })();
    return () => {
      hidup = false;
    };
    // `nilai` sengaja tidak ikut: efek ini yang mengisinya.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktif, unit, kunciItem]);

  return {
    gardu, har, nilaiHar: nilai.unit === unit ? nilai.peta : new Map() as NilaiHar,
    memuat, memuatItem, galat,
  };
}
