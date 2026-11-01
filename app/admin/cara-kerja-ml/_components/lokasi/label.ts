import type { JenisGangguan } from "@/lib/prediksiGangguan/arus";
import type { BarisTemuan } from "@/lib/prediksiGangguan/temuan";

export const LABEL_JENIS: Record<JenisGangguan, { singkat: string; panjang: string; kelas: string }> = {
  OC2: { singkat: "OC 2 fasa", panjang: "Gangguan antar fasa (OC), 2 fasa", kelas: "bg-red-50 text-red-700" },
  OC3: { singkat: "OC 3 fasa", panjang: "Gangguan antar fasa (OC), 3 fasa", kelas: "bg-red-50 text-red-700" },
  EF: { singkat: "EF", panjang: "Gangguan tanah (EF)", kelas: "bg-amber-50 text-amber-700" },
  TAK_JELAS: { singkat: "Tak terbaca", panjang: "Jenis tidak terbaca dari arus", kelas: "bg-slate-100 text-slate-600" },
};

/** Ringkas hasil penilaian satu lokasi temuan. */
export function teksRapor(t: BarisTemuan): string {
  if (!t.dinilai_at) return "Belum dinilai";
  if (t.seksi_ke != null) return `Saran ke-${t.seksi_ke} dari ${t.jumlah_seksi}`;
  if (t.jenis === "OC2" || t.jenis === "OC3") return t.masuk_zona ? "Di zona, tidak masuk calon" : "Di luar zona";
  return t.masuk_zona ? "Di zona" : "Di luar zona";
}
