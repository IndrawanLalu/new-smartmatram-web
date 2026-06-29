// Pengaturan default koreksi (durasi tiap tahap + korektor), tersimpan di localStorage.

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
}

const KEY = "apkt_koreksi_settings";

export function loadSettings(): KoreksiSettings {
  if (typeof window === "undefined") return { durs: [...DEFAULT_DURS], korektor: "" };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<KoreksiSettings>;
      const durs = Array.isArray(p.durs) && p.durs.length === STEPS.length
        ? p.durs.map((n) => Number(n) || 0)
        : [...DEFAULT_DURS];
      return { durs, korektor: typeof p.korektor === "string" ? p.korektor : "" };
    }
  } catch { /* abaikan */ }
  // fallback ke korektor lama bila ada
  return { durs: [...DEFAULT_DURS], korektor: localStorage.getItem("apkt_korektor") ?? "" };
}

export function saveSettings(s: KoreksiSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}
