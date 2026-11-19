// Pengaturan default koreksi (durasi tiap tahap + korektor + batas RPT), tersimpan di localStorage.

export const STEPS = [
  { key: "d_lapor_penugasan",       label: "Lapor → Penugasan",            def: 2 },
  { key: "d_penugasan_perjalanan",  label: "Penugasan → Perjalanan",       def: 2 },
  { key: "d_perjalanan_pengerjaan", label: "Perjalanan → Pengerjaan",      def: 15 },
  { key: "d_pengerjaan_nyalasmt",   label: "Pengerjaan → Nyala Sementara", def: 35 },
  { key: "d_nyalasmt_nyala",        label: "Nyala Sementara → Nyala",      def: 3 },
  { key: "d_nyala_selesai",         label: "Nyala → Selesai",              def: 2 },
] as const;

export const DEFAULT_DURS: number[] = STEPS.map((s) => s.def);

export interface KoreksiSettings {
  durs: number[];
  korektor: string;
  /** Keputusan user 19 Nov 2026: hanya laporan dengan RPT ASLI DI ATAS batas ini
   *  (menit) yang dikoreksi. 0 = semua. */
  minRpt: number;
}

const KEY = "apkt_koreksi_settings";

export function loadSettings(): KoreksiSettings {
  if (typeof window === "undefined") return { durs: [...DEFAULT_DURS], korektor: "", minRpt: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<KoreksiSettings>;
      const durs = Array.isArray(p.durs) && p.durs.length === STEPS.length
        ? p.durs.map((n) => Number(n) || 0)
        : [...DEFAULT_DURS];
      return {
        durs,
        korektor: typeof p.korektor === "string" ? p.korektor : "",
        minRpt: Math.max(0, Number(p.minRpt) || 0),
      };
    }
  } catch { /* abaikan */ }
  // fallback ke korektor lama bila ada
  return { durs: [...DEFAULT_DURS], korektor: localStorage.getItem("apkt_korektor") ?? "", minRpt: 0 };
}

export function saveSettings(s: KoreksiSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}
