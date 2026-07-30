import { woStage, type WoStage, type WoStageSource } from "../_types";

/** Nilai ukuran satu baris beserta satuannya (mis. 1,2 kms). */
export interface Measure {
  unit: string;
  value: number;
}

export interface VolAgg {
  total: number;
  selesai: number;
}

export interface ReguStat {
  regu: string;
  total: number;
  selesai: number;
  vol: Map<string, VolAgg>;
}

export interface WoStats {
  total: number;
  selesai: number;
  belum: number;
  pct: number;
  /** Jumlah baris per tahap (eksklusif — satu baris hanya masuk satu tahap). */
  byStage: Record<WoStage, number>;
  /**
   * Jumlah baris yang SUDAH MENCAPAI tahap tsb (kumulatif, menurun) —
   * dasar funnel: baris "Disetujui" tentu sudah melewati "Dikerjakan".
   */
  reached: Record<WoStage, number>;
  verified: number;
  approved: number;
  approvedPct: number;
  slaOk: number;
  slaNot: number;
  /** Satuan volume yang muncul pada data, urut kemunculan. */
  units: string[];
  volByUnit: Map<string, VolAgg>;
  byRegu: ReguStat[];
}

const REGU_KOSONG = "Belum ditugaskan";

/**
 * Agregasi tunggal untuk dashboard periode maupun dashboard per-WO.
 * `measureOf` mengembalikan volume + satuan baris, atau null bila WO-nya
 * tidak memakai kolom ukuran.
 */
export function buildWoStats<T extends WoStageSource & { regu: string | null; sla_ok: boolean | null }>(
  items: T[],
  measureOf: (item: T) => Measure | null,
): WoStats {
  const byStage: Record<WoStage, number> = { Belum: 0, Dikerjakan: 0, Diverifikasi: 0, Disetujui: 0 };
  const volByUnit = new Map<string, VolAgg>();
  const reguMap = new Map<string, ReguStat>();
  let selesai = 0;
  let verified = 0;
  let approved = 0;
  let slaOk = 0;
  let slaNot = 0;

  for (const it of items) {
    byStage[woStage(it)] += 1;

    const done = it.status === "Selesai";
    if (done) selesai += 1;
    if (it.verified_at) {
      verified += 1;
      if (it.sla_ok === true) slaOk += 1;
      else if (it.sla_ok === false) slaNot += 1;
    }
    if (it.approved_at) approved += 1;

    const key = it.regu ?? REGU_KOSONG;
    const r = reguMap.get(key) ?? { regu: key, total: 0, selesai: 0, vol: new Map<string, VolAgg>() };
    r.total += 1;
    if (done) r.selesai += 1;

    const m = measureOf(it);
    if (m) {
      const g = volByUnit.get(m.unit) ?? { total: 0, selesai: 0 };
      g.total += m.value;
      if (done) g.selesai += m.value;
      volByUnit.set(m.unit, g);

      const rv = r.vol.get(m.unit) ?? { total: 0, selesai: 0 };
      rv.total += m.value;
      if (done) rv.selesai += m.value;
      r.vol.set(m.unit, rv);
    }

    reguMap.set(key, r);
  }

  const total = items.length;
  const reached: Record<WoStage, number> = {
    Belum: total,
    Dikerjakan: byStage.Dikerjakan + byStage.Diverifikasi + byStage.Disetujui,
    Diverifikasi: byStage.Diverifikasi + byStage.Disetujui,
    Disetujui: byStage.Disetujui,
  };

  return {
    total,
    selesai,
    belum: total - selesai,
    pct: total ? Math.round((selesai / total) * 100) : 0,
    byStage,
    reached,
    verified,
    approved,
    approvedPct: total ? Math.round((approved / total) * 100) : 0,
    slaOk,
    slaNot,
    units: [...volByUnit.keys()],
    volByUnit,
    byRegu: [...reguMap.values()].sort((a, b) => b.total - a.total),
  };
}

export { REGU_KOSONG };
