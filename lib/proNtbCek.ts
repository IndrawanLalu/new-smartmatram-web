import { supabaseAdmin } from "@/lib/supabase-admin";
import { bacaSheetPro } from "@/lib/proNtbSheet";
import { ambilBarisBulan, barisDariData } from "@/app/admin/kinerja-yantek/_lib/ambilProNtb";
import { bandingkan, ringkasPerKunci, type RingkasKunci } from "@/app/admin/kinerja-yantek/_lib/cekProNtb";

/**
 * Cek PRO NTB satu ULP & bulan, lalu simpan ringkasannya (scripts/pro-ntb-cek.sql).
 * Sama persis dengan layar "Cek ke spreadsheet": baris WO + realisasi (pro_ntb_baris)
 * dibandingkan dengan tab WO spreadsheet ULP (kode SMART dulu, lalu lokasi).
 * Rentang: tanggal 1 s.d. hari ini (bulan berjalan) / akhir bulan (bulan lalu).
 */

export type SumberCek = "malam" | "kirim" | "tombol";

const hariIniWita = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function rentang(bulan: string) {
  const [y, m] = bulan.split("-").map(Number);
  const akhir = `${bulan}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const hari = hariIniWita();
  return { dari: `${bulan}-01`, sampai: hari < akhir ? hari : akhir };
}

export async function cekProNtb(ulp: string, bulan: string, sumber: SumberCek, oleh: string | null): Promise<{ ringkas: RingkasKunci[]; galat: string | null }> {
  const { dari, sampai } = rentang(bulan);
  let ringkas: RingkasKunci[] = [];
  let galat: string | null = null;
  try {
    const { data: s, error } = await supabaseAdmin.from("pro_ntb_sheet").select("spreadsheet_id").eq("ulp", ulp).maybeSingle();
    if (error) throw new Error(error.message);
    if (!s) throw new Error("Spreadsheet PRO NTB ULP ini belum diatur.");
    const [sheet, data] = await Promise.all([bacaSheetPro(s.spreadsheet_id, dari, sampai), ambilBarisBulan(supabaseAdmin, ulp, bulan)]);
    ringkas = ringkasPerKunci(bandingkan(barisDariData(data), sheet).baris);
  } catch (e) {
    galat = (e as Error).message;
  }

  const { error: e1 } = await supabaseAdmin.from("pro_ntb_cek_ulp")
    .upsert({ ulp, bulan, sampai, dicek_at: new Date().toISOString(), sumber, galat, oleh });
  if (e1) throw new Error(e1.message);
  // Cek gagal = angka lama TIDAK dihapus; yang tampil tetap hasil terakhir + galatnya.
  if (!galat) {
    const { error: e2 } = await supabaseAdmin.from("pro_ntb_cek").delete().eq("ulp", ulp).eq("bulan", bulan);
    if (e2) throw new Error(e2.message);
    if (ringkas.length) {
      const { error: e3 } = await supabaseAdmin.from("pro_ntb_cek").insert(ringkas.map((r) => ({ ulp, bulan, ...r })));
      if (e3) throw new Error(e3.message);
    }
  }
  return { ringkas, galat };
}

/** ULP yang spreadsheet PRO NTB-nya sudah diatur. */
export async function ulpBerSheet(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from("pro_ntb_sheet").select("ulp");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.ulp as string);
}
