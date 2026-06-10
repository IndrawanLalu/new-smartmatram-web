import type { PengukuranGardu, JurusanData } from "../_hooks/usePengukuranGardu";

export interface AnomalySettings {
  max_beban_trafo_pct: number | null;  // NULL = kriteria nonaktif
  max_arus_jurusan_a:  number | null;
  max_unbalance_pct:   number | null;
  max_suhu_trafo_c:    number | null;
  min_kva_trafo:       number | null;  // range filter — hanya evaluasi gardu dalam rentang KVA ini
  max_kva_trafo:       number | null;
}

export const DEFAULT_SETTINGS: AnomalySettings = {
  max_beban_trafo_pct: null,
  max_arus_jurusan_a:  null,
  max_unbalance_pct:   null,
  max_suhu_trafo_c:    null,
  min_kva_trafo:       null,
  max_kva_trafo:       null,
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
  const failed: string[]  = [];   // kriteria aktif yang TIDAK terpenuhi

  // 0. KVA range filter — jika aktif, gardu di luar rentang KVA diabaikan (bukan anomali)
  const kvaRangeActive = settings.min_kva_trafo !== null || settings.max_kva_trafo !== null;
  if (kvaRangeActive) {
    const inRange =
      (settings.min_kva_trafo === null || row.kva_trafo >= settings.min_kva_trafo) &&
      (settings.max_kva_trafo === null || row.kva_trafo <= settings.max_kva_trafo);
    if (!inRange) failed.push("kva_range");
  }

  // 1. Beban trafo %
  if (settings.max_beban_trafo_pct !== null) {
    if (row.persen_beban >= settings.max_beban_trafo_pct) {
      reasons.push(`Beban trafo ${Math.round(row.persen_beban)}% (≥${settings.max_beban_trafo_pct}%)`);
    } else {
      failed.push("beban_trafo");
    }
  }

  // 2. Suhu trafo
  if (settings.max_suhu_trafo_c !== null) {
    if (row.suhu_trafo > settings.max_suhu_trafo_c) {
      reasons.push(`Suhu ${row.suhu_trafo}°C (>${settings.max_suhu_trafo_c}°C)`);
    } else {
      failed.push("suhu_trafo");
    }
  }

  // 3. Arus jurusan > threshold — terpenuhi jika minimal 1 jurusan melebihi
  if (settings.max_arus_jurusan_a !== null) {
    const perjurusan = (row.perjurusan ?? {}) as Record<string, JurusanData>;
    let jurusanHit = false;
    for (const [nama, jurusan] of Object.entries(perjurusan)) {
      if (!jurusan?.arus) continue;
      const { R = 0, S = 0, T = 0 } = jurusan.arus;
      const maxArus = Math.max(R, S, T);
      if (maxArus > settings.max_arus_jurusan_a) {
        reasons.push(`Jurusan ${nama}: ${Math.round(maxArus)}A (>${settings.max_arus_jurusan_a}A)`);
        jurusanHit = true;
      }
    }
    if (!jurusanHit) failed.push("arus_jurusan");
  }

  // 4. Unbalance antar fasa
  if (settings.max_unbalance_pct !== null) {
    const ub = calcUnbalancePct(row.total_arus_r, row.total_arus_s, row.total_arus_t);
    if (ub > settings.max_unbalance_pct) {
      reasons.push(`Unbalance ${ub.toFixed(1)}% (>${settings.max_unbalance_pct}%)`);
    } else {
      failed.push("unbalance");
    }
  }

  // Anomali hanya jika SEMUA kriteria aktif terpenuhi (AND logic)
  return { isAnomali: reasons.length > 0 && failed.length === 0, reasons };
}

// Apakah setidaknya satu kriteria aktif
export function hasActiveCriteria(s: AnomalySettings): boolean {
  return (
    s.max_beban_trafo_pct !== null ||
    s.max_arus_jurusan_a  !== null ||
    s.max_unbalance_pct   !== null ||
    s.max_suhu_trafo_c    !== null ||
    s.min_kva_trafo       !== null ||
    s.max_kva_trafo       !== null
  );
}
