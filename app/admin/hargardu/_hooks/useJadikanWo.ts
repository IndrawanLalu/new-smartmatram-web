"use client";

import { useState, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { WoColumn } from "@/app/admin/work-order/_types";
import type { BarisPerbaikan } from "./usePerluPerbaikan";

/**
 * Temuan tertunda → Work Order.
 *
 * Yang disimpan cuma PENUGASANNYA (`tindak_lanjut_gardu`). Temuannya sendiri
 * tetap tinggal di catatan pemeliharaan dan daftar tertunda tetap diturunkan
 * dari sana — jadi begitu pemeliharaan berikutnya mencatat itemnya normal,
 * barisnya hilang sendiri tanpa ada yang perlu menutup apa pun.
 */

/** Satu WO tindak lanjut per ULP per bulan — bukan satu WO per penekanan tombol. */
export const JUDUL_WO = "Tindak Lanjut Gardu";

/**
 * Kolomnya tetap, tidak ditempelkan ke WO bulanan yang sudah ada.
 * WO hasil paste punya kolom karangan masing-masing; menjejalkan temuan gardu
 * ke sana berarti menebak kolom mana yang berarti "gardu".
 */
const KOLOM_WO: WoColumn[] = [
  { key: "c0", label: "Gardu", type: "text" },
  { key: "c1", label: "Penyulang", type: "text" },
  { key: "c2", label: "Temuan", type: "text" },
  { key: "c3", label: "Bagian", type: "text" },
  { key: "c4", label: "Keterangan", type: "text" },
];

export interface OpsiWo {
  bulan: number;
  tahun: number;
  regu: string;
  catatan: string;
  oleh: string;
  olehId: string;
}

const bagianTampil = (b: string) => (b && b !== "-" ? b : "");

const keterangan = (b: BarisPerbaikan) =>
  [b.catatan, b.pr_keterangan].filter((t) => t && t.trim()).join(" · ");

export function useJadikanWo() {
  const [memproses, setMemproses] = useState(false);

  /** Cari WO tindak lanjut bulan itu, buat kalau belum ada. */
  const batchUntuk = useCallback(
    async (ulp: string, o: OpsiWo): Promise<string> => {
      const { data, error } = await supabaseBrowser
        .from("wo_batch")
        .select("id")
        .eq("ulp", ulp)
        .eq("bulan", o.bulan)
        .eq("tahun", o.tahun)
        .eq("judul", JUDUL_WO)
        .limit(1);
      if (error) throw new Error(error.message);
      if (data?.length) return data[0].id as string;

      const id = crypto.randomUUID();
      const { error: buat } = await supabaseBrowser.from("wo_batch").insert({
        id,
        ulp,
        bulan: o.bulan,
        tahun: o.tahun,
        judul: JUDUL_WO,
        columns: KOLOM_WO,
        regu_column: null,
        verifier_column: null,
        title_column: "c0",
        measure_column: null,
        measure_unit: null,
        created_by: o.olehId,
      });
      if (buat) throw new Error(buat.message);
      return id;
    },
    [],
  );

  const kirim = useCallback(
    async (baris: BarisPerbaikan[], o: OpsiWo): Promise<{ jumlah: number; woIds: string[] }> => {
      setMemproses(true);
      try {
        const perUlp = new Map<string, BarisPerbaikan[]>();
        for (const b of baris) perUlp.set(b.ulp, [...(perUlp.get(b.ulp) ?? []), b]);

        const woIds: string[] = [];
        let jumlah = 0;

        for (const [ulp, rows] of perUlp) {
          const batchId = await batchUntuk(ulp, o);
          woIds.push(batchId);

          // Baris baru menyambung di bawah yang sudah ada, bukan menimpanya.
          const { data: akhir } = await supabaseBrowser
            .from("wo_item")
            .select("urutan")
            .eq("batch_id", batchId)
            .order("urutan", { ascending: false })
            .limit(1);
          const mulai = ((akhir?.[0]?.urutan as number | undefined) ?? -1) + 1;

          const items = rows.map((b, i) => ({
            id: crypto.randomUUID(),
            batch_id: batchId,
            data: {
              c0: [b.gardu_kode, b.gardu_nama].filter(Boolean).join(" — "),
              c1: b.penyulang ?? "",
              c2: `${b.item_nama}: ${b.nilai_label ?? b.nilai ?? "—"}`,
              c3: bagianTampil(b.bagian),
              c4: [keterangan(b), o.catatan].filter((t) => t && t.trim()).join(" · "),
            },
            regu: o.regu,
            verifier_role: null,
            status: "Belum",
            urutan: mulai + i,
          }));

          const { error } = await supabaseBrowser.from("wo_item").insert(items);
          if (error) throw new Error(error.message);

          // Penghubung tipis: gardu + item + bagian → wo_item. Tanpa ini baris
          // WO-nya ada tapi daftar tertunda tidak tahu temuannya sudah ditugaskan.
          for (let i = 0; i < rows.length; i++) {
            const b = rows[i];
            const { error: tautan } = await supabaseBrowser.rpc("tandai_tindak_lanjut", {
              p_gardu: b.gardu_kode,
              p_ulp: b.ulp,
              p_item: b.item_kode,
              p_bagian: b.bagian,
              p_wo_item: items[i].id,
              p_nama: o.oleh,
              p_catatan: o.catatan || null,
            });
            if (tautan) throw new Error(tautan.message);
          }

          jumlah += rows.length;
        }

        return { jumlah, woIds };
      } finally {
        setMemproses(false);
      }
    },
    [batchUntuk],
  );

  return { kirim, memproses };
}
