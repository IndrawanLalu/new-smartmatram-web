"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { TiangPeta } from "./usePetaIsi";

/**
 * Nilai satu isian inspeksi JTM (mis. ukuran konduktor) untuk tiang JTM yang
 * tampil di peta — supaya tiang yang "beda sendiri" terlihat sebelum dikoreksi
 * (10 Okt 2026). Sumber: `jtm_isian_terkini`.
 *
 * Disimpan per item; yang diambil hanya tiang yang belum pernah diambil, jadi
 * menggeser peta tidak mengambil ulang semuanya.
 */

export interface NilaiIsian { nilai: string; label: string }

/** Warna per nilai, urut pilihan di Pengaturan JTM. */
const PALET = ["#2563EB", "#16A34A", "#F59E0B", "#DC2626", "#9333EA", "#0891B2", "#DB2777", "#65A30D"];
const POTONG = 200;

interface Baris { tiang_id: string; sirkit_penyulang: string | null; nilai: string }

export function useIsianPeta(aktif: boolean, item: string, tiang: TiangPeta[]) {
  const [opsi, setOpsi] = useState<{ kode: string; label: string }[]>([]);
  // item → tiang_id → baris (bisa lebih dari satu kabel per tiang).
  const [simpanan, setSimpanan] = useState<Record<string, Map<string, Baris[]>>>({});
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!aktif) return;
    let hidup = true;
    supabaseBrowser
      .from("jtm_opsi_ref")
      .select("kode,label")
      .eq("item_kode", item)
      .order("urutan")
      .then(({ data }) => hidup && setOpsi((data ?? []) as { kode: string; label: string }[]));
    return () => { hidup = false; };
  }, [aktif, item]);

  const idJtm = useMemo(() => [...new Set(tiang.filter((t) => t.jaringan === "jtm").map((t) => t.id))], [tiang]);

  useEffect(() => {
    if (!aktif) return;
    const ada = simpanan[item];
    const kurang = idJtm.filter((id) => !ada?.has(id));
    if (!kurang.length) return;
    let hidup = true;
    void (async () => {
      const baru = new Map<string, Baris[]>(kurang.map((id) => [id, []]));
      for (let i = 0; i < kurang.length; i += POTONG) {
        const { data, error } = await supabaseBrowser
          .from("jtm_isian_terkini")
          .select("tiang_id,sirkit_penyulang,nilai")
          .eq("item_kode", item)
          .eq("bagian", "-")
          .in("tiang_id", kurang.slice(i, i + POTONG));
        if (!hidup) return;
        if (error) {
          setGalat(error.message);
          return;
        }
        for (const r of (data ?? []) as Baris[]) baru.get(r.tiang_id)?.push(r);
      }
      setGalat(null);
      setSimpanan((s) => ({ ...s, [item]: new Map([...(s[item] ?? new Map()), ...baru]) }));
    })();
    return () => { hidup = false; };
  }, [aktif, item, idJtm, simpanan]);

  const label = useMemo(() => new Map(opsi.map((o) => [o.kode, o.label])), [opsi]);
  const warna = useMemo(() => new Map(opsi.map((o, i) => [o.kode, PALET[i % PALET.length]])), [opsi]);

  /** Nilai tiang di lapisan penyulang `kelompok` (kabel penyulang itu bila per kabel). */
  const nilaiDi = (t: TiangPeta): NilaiIsian | null => {
    const rows = simpanan[item]?.get(t.id);
    if (!rows?.length) return null;
    const r = rows.find((x) => x.sirkit_penyulang?.toUpperCase() === t.kelompok.toUpperCase()) ?? rows[0];
    return { nilai: r.nilai, label: label.get(r.nilai) ?? r.nilai };
  };

  /** Legenda: nilai yang tampil di layar + jumlah tiangnya. */
  const legenda = useMemo(() => {
    const n = new Map<string, number>();
    const rowsItem = simpanan[item];
    for (const t of tiang) {
      if (t.jaringan !== "jtm") continue;
      const rows = rowsItem?.get(t.id);
      if (!rows?.length) continue;
      const r = rows.find((x) => x.sirkit_penyulang?.toUpperCase() === t.kelompok.toUpperCase()) ?? rows[0];
      n.set(r.nilai, (n.get(r.nilai) ?? 0) + 1);
    }
    return opsi.filter((o) => n.has(o.kode)).map((o) => ({ kode: o.kode, label: o.label, jumlah: n.get(o.kode) ?? 0, warna: warna.get(o.kode) ?? "#64748B" }));
  }, [simpanan, item, tiang, opsi, warna]);

  return { nilaiDi, warna, legenda, galat };
}
