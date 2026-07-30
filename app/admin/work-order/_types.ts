// Tipe Manajemen Work Order — dipakai web (dan nanti dicocokkan di mobile).

export type WoColumnType = "text" | "number" | "date";
export type WoStatus = "Belum" | "Selesai";

/** Tahap turunan alur persetujuan. */
export type WoStage = "Belum" | "Dikerjakan" | "Diverifikasi" | "Disetujui";

/** Definisi satu kolom kustom pada sebuah batch WO. */
export interface WoColumn {
  key: string;          // stabil, posisional: "c0", "c1", ...
  label: string;        // header tampilan
  type: WoColumnType;
  hidden?: boolean;     // disembunyikan dari tabel (data tetap tersimpan)
}

/** Header / batch WO bulanan. */
export interface WoBatch {
  id: string;
  ulp: string;
  bulan: number;
  tahun: number;
  judul: string;
  columns: WoColumn[];
  regu_column: string | null;    // key kolom sumber regu (informasional)
  verifier_column: string | null; // key kolom sumber verifikator (informasional)
  title_column: string | null;   // key kolom untuk judul kartu mobile
  measure_column: string | null; // key kolom ukuran/volume (mis. panjang) untuk realisasi kms
  measure_unit: string | null;   // satuan ukuran, mis. "kms"
  sheet_id: string | null;       // spreadsheet sumber (tulis-balik)
  sheet_tab: string | null;
  sheet_sync: WoSheetSync | null;
  created_by: string | null;
  created_at: string;
}

/** Konfigurasi tulis-balik ke Sheet. */
export interface WoSheetSync {
  keyCols: string[];              // kolom kunci baris di Sheet (mis. ["NO_WO","NO"])
  write: Record<string, string>; // { "kolom Sheet": "field wo_item", mis. { "TGL REALISASI": "tgl_realisasi" } }
}

/** Field batch yang boleh diubah setelah WO dibuat (lihat EditBatchModal). */
export interface UpdateBatchInput {
  judul: string;
  bulan: number;
  tahun: number;
  columns: WoColumn[];
  reguColumn: string | null;
  verifierColumn: string | null;
  titleColumn: string | null;
  measureColumn: string | null;
  measureUnit: string | null;
}

/** Batch + agregat progres, dipakai di daftar. */
export interface WoBatchWithStats extends WoBatch {
  total: number;
  selesai: number;
}

/** Satu baris pekerjaan. */
export interface WoItem {
  id: string;
  batch_id: string;
  data: Record<string, string>;  // nilai sel kustom, keyed by WoColumn.key
  regu: string | null;           // eksekutor role
  status: WoStatus;
  tgl_realisasi: string | null;  // ISO date
  foto_bukti_url: string | null;
  catatan_petugas: string | null;
  selesai_by: string | null;     // nama petugas yang menyelesaikan (dari mobile)
  selesai_lat: number | null;    // tagging lokasi
  selesai_lng: number | null;
  selesai_alamat: string | null; // hasil reverse-geocode (desa/dusun/jalan)
  selesai_geo: Record<string, unknown> | null; // komponen alamat mentah
  // Alur persetujuan
  verifier_role: string | null;  // role yang boleh memverifikasi baris ini
  verified_by: string | null;
  verified_role: string | null;
  verified_at: string | null;
  sla_ok: boolean | null;        // true=sesuai, false=tidak, null=belum
  verified_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sheet_key: Record<string, string> | null;  // nilai kunci baris di Sheet
  sheet_synced_at: string | null;             // terakhir ditulis-balik
  urutan: number;
}

/** Field minimum untuk menurunkan tahap — dipenuhi oleh WoItem maupun baris dashboard. */
export interface WoStageSource {
  status: string;
  verified_at: string | null;
  approved_at: string | null;
}

/** Turunkan tahap dari field item. */
export function woStage(item: WoStageSource): WoStage {
  if (item.approved_at) return "Disetujui";
  if (item.verified_at) return "Diverifikasi";
  if (item.status === "Selesai") return "Dikerjakan";
  return "Belum";
}
