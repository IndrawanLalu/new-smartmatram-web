import { supabaseBrowser } from "@/lib/supabase-browser";
import type { JenisRencana } from "@/app/admin/_hooks/useRencanaGardu";
import { DEFAULT_WO_HAR, type WoHarSettings } from "./kandidatWo";

/**
 * Rencana Pemeliharaan (`scripts/rencana-hargardu.sql`) sebagai satu jenis
 * rencana gardu bersama (`RencanaGardu`). Penanda templat sengaja tetap sama
 * dengan sebelum komponen ini dibagi — templat yang sudah diunduh ULP tetap sah.
 */
export const RENCANA_HARGARDU: JenisRencana<WoHarSettings> = {
  templat: {
    penanda: "SMART-RENCANA-HARGARDU",
    nama: "Rencana Pemeliharaan",
    judul: "RENCANA PEMELIHARAAN GARDU",
    kerja: "dipelihara",
    lokasi: "Pemeliharaan Gardu → WO Pemeliharaan → Rencana Pemeliharaan",
  },
  tabel: "rencana_hargardu",
  tabelWo: "wo_hargardu",
  rpcSimpan: "simpan_rencana_hargardu",
  rpcHapus: "hapus_rencana_hargardu",
  skrip: "scripts/rencana-hargardu.sql",
  muatSetelan: async (ulp) => {
    const { data, error } = await supabaseBrowser
      .from("wo_hargardu_settings")
      .select("ulp,frekuensi_per_tahun,kuota_per_bulan,hanya_gardu_aktif,terbit_otomatis")
      .in("ulp", ulp);
    if (error) throw new Error(error.message);
    const ada = new Map((data ?? []).map((s) => [s.ulp as string, s as WoHarSettings]));
    return new Map(ulp.map((u) => [u, ada.get(u) ?? DEFAULT_WO_HAR]));
  },
  aturan: (s) => ({
    kuota: s.kuota_per_bulan,
    hanyaAktif: s.hanya_gardu_aktif,
    periksa: (perGardu) => {
      const beda = [...perGardu.values()].filter((n) => n !== s.frekuensi_per_tahun).length;
      return beda
        ? [`${beda} gardu direncanakan tidak ${s.frekuensi_per_tahun}× setahun (frekuensi di pengaturan ULP).`]
        : [];
    },
  }),
};
