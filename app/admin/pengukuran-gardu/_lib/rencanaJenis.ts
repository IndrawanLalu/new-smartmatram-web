import { supabaseBrowser } from "@/lib/supabase-browser";
import type { JenisRencana } from "@/app/admin/_hooks/useRencanaGardu";
import { DEFAULT_WO_SETTINGS, type WoSettings } from "./kandidatWo";

/**
 * Rencana Pengukuran (`scripts/rencana-pengukuran.sql`, keputusan user 5 Okt
 * 2026) — pola Rencana Pemeliharaan. Rencana adalah DASAR; aturan umur di
 * Pengaturan WO tetap jadi pengingat "sudah masuk waktu ukur".
 */

/** Berapa kali minimal dalam 12 bulan supaya jarak ukur tidak melewati batas. */
const minimalSetahun = (batasBulan: number) => Math.ceil(12 / batasBulan);

export const RENCANA_PENGUKURAN: JenisRencana<WoSettings> = {
  templat: {
    penanda: "SMART-RENCANA-UKUR",
    nama: "Rencana Pengukuran",
    judul: "RENCANA PENGUKURAN BEBAN GARDU",
    kerja: "diukur",
    lokasi: "Pengukuran Gardu → WO Pengukuran → Rencana Pengukuran",
    bantuUkur: true,
  },
  tabel: "rencana_pengukuran",
  tabelWo: "wo_pengukuran",
  rpcSimpan: "simpan_rencana_pengukuran",
  rpcHapus: "hapus_rencana_pengukuran",
  skrip: "scripts/rencana-pengukuran.sql",
  // Sama dengan settingsUntuk(): miliknya, lalu 'ALL', lalu bawaan.
  muatSetelan: async (ulp) => {
    const { data, error } = await supabaseBrowser
      .from("wo_pengukuran_settings")
      .select("ulp,ambang_beban_pct,bulan_beban_tinggi,bulan_beban_rendah,kuota_per_bulan,sertakan_belum_pernah,hanya_gardu_aktif,terbit_otomatis")
      .in("ulp", [...ulp, "ALL"]);
    if (error) throw new Error(error.message);
    const ada = new Map((data ?? []).map((s) => [s.ulp as string, { ...(s as WoSettings), ambang_beban_pct: Number(s.ambang_beban_pct) }]));
    return new Map(ulp.map((u) => [u, ada.get(u) ?? ada.get("ALL") ?? DEFAULT_WO_SETTINGS]));
  },
  aturan: (s) => ({
    kuota: s.kuota_per_bulan,
    hanyaAktif: s.hanya_gardu_aktif,
    periksa: (perGardu, master) => {
      const beban = new Map(master.map((g) => [g.kode.toUpperCase(), g.persen_beban ?? 0]));
      const nTinggi = minimalSetahun(s.bulan_beban_tinggi);
      const nRendah = minimalSetahun(s.bulan_beban_rendah);
      let tinggi = 0;
      let rendah = 0;
      for (const [kode, n] of perGardu) {
        const t = Math.round(beban.get(kode) ?? 0) >= s.ambang_beban_pct;
        if (t && n < nTinggi) tinggi++;
        else if (!t && n < nRendah) rendah++;
      }
      return [
        ...(tinggi
          ? [`${tinggi} gardu berbeban ≥ ${s.ambang_beban_pct}% ditandai kurang dari ${nTinggi}× — batas ukur ulangnya ${s.bulan_beban_tinggi} bulan.`]
          : []),
        ...(rendah
          ? [`${rendah} gardu berbeban < ${s.ambang_beban_pct}% ditandai kurang dari ${nRendah}× — batas ukur ulangnya ${s.bulan_beban_rendah} bulan.`]
          : []),
      ];
    },
  }),
};
