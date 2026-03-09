export interface Gardu {
  kode: string;
  nama: string;
  alamat: string | null;
  feeder: string | null;
  daya: number | null;
  merk: string | null;
  status: string | null;
  tgl_update: string | null;
  lat: number;
  lng: number;
  beban_kva: number | null;
  beban_persen: number | null;
  beban_total: number | null;
  ulp: string | null;
  // Dari pengukuran_gardu (latest)
  tgl_pengukuran?: string | null;
  kva_trafo?: number | null;
  pengukuran_arus_r?: number | null;
  pengukuran_arus_s?: number | null;
  pengukuran_arus_t?: number | null;
}

export interface Jalur {
  id: string;
  nama: string | null;
  feeder: string | null;
  penghantar: string | null;
  jarak: number | null;
  status: string | null;
  warna: string | null;
  ulp: string | null;
  koordinat: [number, number][]; // assembled dari jalur_koordinat
}

export interface Tiang {
  id: string;
  kode: string;
  jenis: string | null;
  tinggi: number | null;
  kondisi: string | null;
  feeder: string | null;
  jalur_id: string | null;
  alamat: string | null;
  lat: number;
  lng: number;
  ulp: string | null;
  tgl_pasang: string | null;
  catatan: string | null;
}

export interface TiangRef {
  id: string;
  kode: string;
  lat: number;
  lng: number;
  feeder: string | null;
  alamat: string | null;
}

export type DrawingTool = "select" | "addGardu" | "addTiang" | "drawJalur" | "measure";
export type FeatureType = "gardu" | "jalur" | "tiang";

export interface SelectedFeature {
  type: FeatureType;
  id: string; // kode untuk gardu, uuid untuk jalur/tiang
  data: Gardu | Jalur | Tiang;
}

export interface PetaFilter {
  search: string;
  feeder: string;
  ulp: string;
  status: string;
  showGardu: boolean;
  showJalur: boolean;
  showTiang: boolean;
}

export interface PetaStats {
  garduCount: number;
  jalurCount: number;
  jalurKm: number;
  tiangCount: number;
}
