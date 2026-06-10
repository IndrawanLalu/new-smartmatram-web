import type { PengukuranGardu, JurusanData } from "../_hooks/usePengukuranGardu";

export interface AnomalySettings {
  max_beban_trafo_pct: number | null;  // NULL = kriteria nonaktif
  max_arus_jurusan_a:  number | null;
  max_unbalance_pct:   number | null;
  max_suhu_trafo_c:    number | null;
}

export const DEFAULT_SETTINGS: AnomalySettings = {
  max_beban_trafo_pct: null,
  max_arus_jurusan_a:  null,
  max_unbalance_pct:   null,
  max_suhu_trafo_c:    null,
};

export interface AnomalyResult {
  isAnomali: boolean;
  reasons: string[];
}

// Hitung persentase unbalance antar fasa R/S/T (NEMA formula)
export function calcUnbalancePct(r: number, s: number, t: number): number {
  const avg = (r + s + t) / 3;
  if (avg === 0) return 0;
  const maxDev = Math.max(Math.abs(r - avg), Math.abs(s - avg), Math.abs(t - avg));
  return (maxDev / avg) * 100;
}

export function detectAnomali(
  row: PengukuranGardu,
  settings: AnomalySettings
): AnomalyResult {
  const reasons: string[] = [];

  // 1. Beban trafo %
  if (settings.max_beban_trafo_pct !== null && row.persen_beban >= settings.max_beban_trafo_pct) {
    reasons.push(`Beban trafo ${Math.round(row.persen_beban)}% (>${settings.max_beban_trafo_pct}%)`);
  }

  // 2. Suhu trafo
  if (settings.max_suhu_trafo_c !== null && row.suhu_trafo > settings.max_suhu_trafo_c) {
    reasons.push(`Suhu ${row.suhu_trafo}°C (>${settings.max_suhu_trafo_c}°C)`);
  }

  // 3. Arus jurusan > threshold
  if (settings.max_arus_jurusan_a !== null) {
    const perjurusan = (row.perjurusan ?? {}) as Record<string, JurusanData>;
    for (const [nama, jurusan] of Object.entries(perjurusan)) {
      if (!jurusan?.arus) continue;
      const { R = 0, S = 0, T = 0 } = jurusan.arus;
      const maxArus = Math.max(R, S, T);
      if (maxArus > settings.max_arus_jurusan_a) {
        reasons.push(`Jurusan ${nama}: ${Math.round(maxArus)}A (>${settings.max_arus_jurusan_a}A)`);
      }
    }
  }

  // 4. Unbalance antar fasa (dari total arus trafo)
  if (settings.max_unbalance_pct !== null) {
    const ub = calcUnbalancePct(row.total_arus_r, row.total_arus_s, row.total_arus_t);
    if (ub > settings.max_unbalance_pct) {
      reasons.push(`Unbalance ${ub.toFixed(1)}% (>${settings.max_unbalance_pct}%)`);
    }
  }

  return { isAnomali: reasons.length > 0, reasons };
}

// Apakah setidaknya satu kriteria aktif
export function hasActiveCriteria(s: AnomalySettings): boolean {
  return (
    s.max_beban_trafo_pct !== null ||
    s.max_arus_jurusan_a  !== null ||
    s.max_unbalance_pct   !== null ||
    s.max_suhu_trafo_c    !== null
  );
}
