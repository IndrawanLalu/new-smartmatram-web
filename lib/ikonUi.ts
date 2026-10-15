import {
  CalendarDays, CircleDot, ClipboardList, House, MapPin, Ruler, Spline, UserRound, Users, Zap,
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
