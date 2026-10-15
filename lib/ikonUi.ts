import {
  Activity, BadgeCheck, Cable, CalendarDays, Camera, CircleCheck, CircleDot, ClipboardList, Clock, FileText, Flag,
  Gauge, GitFork, Hash, House, Info, Mail, MapPin, MapPinned, MessageSquareText, Ruler, SearchCheck,
  ShieldCheck, Spline, Star, Tag, Target, Thermometer, TrendingUp, UserRound, Users, UsersRound, UtilityPole, Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Kamus ikon (rencana-ui-baru.md §3): SATU konsep = SATU ikon di semua
 * halaman — kepala kolom tabel, saringan, kartu. Ikon yang berganti-ganti untuk
 * hal yang sama membuat mata berhenti memakainya sebagai penanda.
 *
 * Gaya bersama: lucide, `strokeWidth` IKON_STROKE; ukuran 14 tabel/chip · 16
 * tombol/field · 18 sidebar · 22 kepala halaman.
 */

export const IKON_STROKE = 1.75;

export const IKON: Record<
  "penyulang" | "segmen" | "panjang" | "wo" | "tanggal" | "regu" | "petugas" | "status" | "gardu" | "ulp",
  LucideIcon
> = {
  penyulang: Zap,
  segmen: Spline,
  panjang: Ruler,
  wo: ClipboardList,
  tanggal: CalendarDays,
  regu: Users,
  petugas: UserRound,
  status: CircleDot,
  gardu: House,
  ulp: MapPin,
};

/**
 * Kata kepala kolom → ikon (15 Okt 2026). Dipakai `_kit/IkonKolom` untuk
 * memberi ikon kepala tabel lama tanpa memilihnya satu per satu: kata PERTAMA
 * yang dikenal menentukan ("No. Gardu" → gardu, "Tgl WO" → tanggal). Kolom
 * yang tak dikenal (Aksi, No, R/S/T …) sengaja tanpa ikon. Kata baru
 * DITAMBAHKAN di sini — satu konsep tetap satu ikon.
 */
const KATA_KOLOM: Record<string, LucideIcon> = {
  penyulang: IKON.penyulang,
  segmen: IKON.segmen,
  gardu: IKON.gardu,
  tiang: UtilityPole,
  jurusan: GitFork, jur: GitFork,
  tgl: IKON.tanggal, tanggal: IKON.tanggal, bulan: IKON.tanggal, hari: IKON.tanggal, periode: IKON.tanggal,
  dibuat: IKON.tanggal, disimpan: IKON.tanggal, ditemukan: IKON.tanggal, terakhir: IKON.tanggal,
  jam: Clock, durasi: Clock, umur: Clock, median: Clock,
  regu: IKON.regu, tim: IKON.regu, team: IKON.regu, group: IKON.regu,
  petugas: IKON.petugas, inspektor: IKON.petugas, eksekutor: IKON.petugas, verifikator: IKON.petugas, korektor: IKON.petugas,
  status: IKON.status, keadaan: IKON.status, tahap: IKON.status, kondisi: IKON.status,
  ulp: IKON.ulp,
  wo: IKON.wo, work: IKON.wo,
  panjang: IKON.panjang, kms: IKON.panjang, km: IKON.panjang, gawang: IKON.panjang,
  alamat: MapPinned, lokasi: MapPinned, gps: MapPinned, titik: MapPinned, rute: MapPinned,
  kva: Gauge, beban: Gauge,
  arus: Activity,
  suhu: Thermometer,
  temuan: SearchCheck,
  kategori: Tag, jenis: Tag, objek: Tag, sifat: Tag,
  keterangan: Info, rincian: Info,
  catatan: MessageSquareText, alasan: MessageSquareText, penyebab: MessageSquareText, sebab: MessageSquareText,
  foto: Camera, bukti: Camera,
  rating: Star,
  target: Target, rencana: Target, sla: Target,
  realisasi: CircleCheck, dikerjakan: CircleCheck,
  disetujui: BadgeCheck,
  pelanggan: UsersRound, plgn: UsersRound,
  kabel: Cable, penghantar: Cable, ukuran: Cable,
  email: Mail,
  role: ShieldCheck,
  laporan: FileText,
  kode: Hash,
  prioritas: Flag,
  capaian: TrendingUp,
};

export function ikonKolom(teks: string): LucideIcon | null {
  for (const kata of teks.toLowerCase().split(/[^a-z]+/)) {
    const ikon = KATA_KOLOM[kata];
    if (ikon) return ikon;
  }
  return null;
}
