"use client";

import { useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Suntingan admin dari peta (`scripts/peta-sunting.sql`). Penjaga hak ULP &
 * alasan ada di database; pesan tolaknya diteruskan apa adanya.
 */
export function useSuntingPeta(oleh: string) {
  const toast = useToast();

  const jalankan = useCallback(
    async <T,>(fn: string, arg: Record<string, unknown>, sukses: (d: T) => string) => {
      const { data, error } = await supabaseBrowser.rpc(fn, arg);
      if (error) {
        toast.error(
          error.message.includes("Could not find the function")
            ? "Fungsi sunting peta belum ada — jalankan scripts/peta-sunting.sql di Supabase."
            : error.message,
        );
        return false;
      }
      toast.success(sukses(data as T));
      return true;
    },
    [toast],
  );

  const geserTiang = (id: string, lat: number, lng: number, alasan: string) =>
    jalankan<{ kode: string; geser_m: number }>(
      "geser_titik_tiang",
      { p_id: id, p_lat: lat, p_lng: lng, p_alasan: alasan, p_oleh: oleh },
      (d) => `${d.kode} digeser ${d.geser_m} m.`,
    );

  const geserGardu = (kode: string, ulp: string, lat: number, lng: number, alasan: string) =>
    jalankan<{ kode: string; geser_m: number | null }>(
      "geser_titik_gardu",
      { p_kode: kode, p_ulp: ulp, p_lat: lat, p_lng: lng, p_alasan: alasan, p_oleh: oleh },
      (d) => (d.geser_m === null ? `Titik ${d.kode} diisi.` : `${d.kode} digeser ${d.geser_m} m.`),
    );

  const ubahAtribut = (id: string, isi: Record<string, string>) =>
    jalankan<number>("ubah_atribut_tiang", { p_id: id, p_isi: isi, p_oleh: oleh }, (n) =>
      n === 0 ? "Tidak ada yang berubah." : `${n} isian diperbarui.`,
    );

  const tandaiPercabangan = (id: string, nyala: boolean) =>
    jalankan<unknown>("tandai_percabangan_jtm", { p_tiang_id: id, p_nyala: nyala, p_oleh: oleh }, () =>
      nyala ? "Ditandai percabangan." : "Tanda percabangan dilepas.",
    );

  const ubahInduk = (id: string, indukId: string | null) =>
    jalankan<unknown>("ubah_induk_tiang_jtm", { p_tiang_id: id, p_induk_id: indukId, p_oleh: oleh }, () =>
      "Induk tiang diganti.",
    );

  const batalkan = (id: string, alasan: string) =>
    jalankan<unknown>("batalkan_tiang", { p_id: id, p_nama: oleh, p_alasan: alasan }, () =>
      "Tiang dibatalkan (salah input).",
    );

  return { geserTiang, geserGardu, ubahAtribut, tandaiPercabangan, ubahInduk, batalkan };
}
