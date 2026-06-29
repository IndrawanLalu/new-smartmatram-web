import { fetchSheetData } from "@/lib/sheets";

// Jurnal APKT — sheet LOMBOK (spreadsheet terpisah), dicocokkan
// no_laporan ↔ kolom "NO. GANGGUAN TM".
const JURNAL_SPREADSHEET_ID = "15cD8aT9HL3ZraphmFxwlY8DpmHIP6ozTuyoOqIMIwt8";
const JURNAL_SHEET = "LOMBOK";
const JURNAL_RANGE = "A:AO";

export interface JurnalApkt {
  section: string;
  ulp: string;
  durasi_padam: string;
  anomali_kode_j: string;
  action: string;
  justifikasi: string;
  status_koreksi: string;
  kategori_cleansing: string;
  keterangan_cleansing: string;
}

// "J4426010100009*" → "J4426010100009" (untuk cocok dengan no_laporan APKT)
export function normNoLaporan(v: string) {
  return v.replace(/\*+$/, "").trim().toUpperCase();
}

function toJurnal(m: Record<string, string>): JurnalApkt {
  return {
    section:              m["SECTION"] ?? "",
    ulp:                  m["ULP"] ?? "",
    durasi_padam:         m["DURASI PADAM"] ?? "",
    anomali_kode_j:       m["ANOMALI KODE J"] ?? "",
    action:               m["ACTION"] ?? "",
    justifikasi:          m["JUSTIFIKASI"] ?? "",
    status_koreksi:       m["STATUS KOREKSI / CLEANSING"] ?? "",
    kategori_cleansing:   m["KATEGORI CLEANSING YANG DIKECUALIKAN"] ?? "",
    keterangan_cleansing: m["KETERANGAN CLEANSING YANG DIKECUALIKAN"] ?? "",
  };
}

// Map<normNoLaporan, JurnalApkt> — untuk join massal di tabel.
// fetchSheetData punya cache 5 menit, jadi aman dipanggil dari page & modal.
export async function fetchJurnalMap(): Promise<Map<string, JurnalApkt>> {
  const rows = await fetchSheetData(JURNAL_SHEET, JURNAL_RANGE, JURNAL_SPREADSHEET_ID);
  const map = new Map<string, JurnalApkt>();
  for (const r of rows) {
    const key = normNoLaporan(r["NO. GANGGUAN TM"] ?? "");
    if (key) map.set(key, toJurnal(r));
  }
  return map;
}
