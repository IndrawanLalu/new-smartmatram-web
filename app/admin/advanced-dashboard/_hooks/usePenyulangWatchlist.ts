"use client";

import { useMemo } from "react";
import type { ComputedData } from "./useAdvancedDashboard";

export type RiskLevel = "DARURAT" | "KRITIS" | "WASPADA";

export interface RiskReason {
  label: string;
  detail: string;
  type: "repeat" | "critical" | "mtbf" | "pareto";
}

export interface PenyulangRisk {
  penyulang: string;
  ulp: string;
  score: number;
  level: RiskLevel;
  reasons: RiskReason[];
  recommendation: string;
  count: number;
  mtbfDays?: number;
  maxIn7Days?: number;
  avgDurMin?: number;
  paretoRank?: number;
}

type Acc = {
  ulp: string;
  score: number;
  reasons: RiskReason[];
  count: number;
  mtbfDays?: number;
  maxIn7Days?: number;
  avgDurMin?: number;
  paretoRank?: number;
};

function generateRec(reasons: RiskReason[]): string {
  const types = new Set(reasons.map((r) => r.type));
  const has = (t: RiskReason["type"]) => types.has(t);

  if (has("repeat") && has("critical"))
    return "Prioritas utama: inspeksi total dan perbaikan permanen. Pola gangguan berulang dengan durasi panjang mengindikasikan kerusakan fundamental — restore saja tidak cukup.";
  if (has("repeat") && has("mtbf"))
    return "Gangguan sangat sering dan berulang dalam periode pendek. Investigasi penyebab sistemik dan lakukan perbaikan tuntas, bukan sekadar pemulihan cepat.";
  if (has("critical") && has("mtbf"))
    return "Jaringan terlalu sering terganggu dan butuh waktu lama dipulihkan. Jadwalkan pemeliharaan preventif komprehensif dan evaluasi kondisi fisik jaringan segera.";
  if (has("repeat"))
    return "Gangguan berulang dalam jendela waktu singkat — masalah belum terselesaikan. Jangan hanya restore, temukan dan perbaiki akar penyebabnya secara permanen.";
  if (has("critical") && has("pareto"))
    return "Kontributor terbesar gangguan sekaligus paling boros waktu pemulihan. Masukkan dalam prioritas tertinggi program rehabilitasi jaringan periode ini.";
  if (has("mtbf") && has("pareto"))
    return "Frekuensi gangguan sangat tinggi pada penyulang utama. Inspeksi menyeluruh kondisi jaringan, peralatan proteksi, dan ROW untuk menemukan penyebab sistemik.";
  if (has("critical"))
    return "Evaluasi kondisi jaringan dan peralatan secara menyeluruh. Durasi pemulihan yang panjang bisa dipersingkat dengan kesiapan material dan perbaikan prosedur switching.";
  if (has("mtbf"))
    return "Frekuensi gangguan di atas batas wajar. Jadwalkan inspeksi fisik jaringan, peralatan proteksi, vegetasi ROW, dan pastikan tidak ada masalah tersembunyi.";
  if (has("pareto"))
    return "Penyulang ini menyumbang proporsi besar total gangguan. Fokuskan anggaran pemeliharaan di sini untuk dampak paling signifikan terhadap keandalan sistem.";
  return "Monitor dan jadwalkan pemeliharaan preventif. Penyulang ini berada di atas rata-rata dalam kontribusi gangguan.";
}

export function usePenyulangWatchlist(computed: ComputedData | null): PenyulangRisk[] {
  return useMemo(() => {
    if (!computed || computed.isEmpty) return [];

    const map: Record<string, Acc> = {};

    const ensure = (name: string, ulp: string, count: number) => {
      if (!map[name]) map[name] = { ulp, score: 0, reasons: [], count };
    };

    // ── Rule 1: Repeat Offender (bobot tertinggi) ─────────────────────────
    computed.recurrenceItems.forEach((r) => {
      ensure(r.penyulang, r.ulp, r.count);
      const pts = r.maxIn7Days >= 5 ? 6 : 4;
      map[r.penyulang].score += pts;
      map[r.penyulang].maxIn7Days = r.maxIn7Days;
      map[r.penyulang].reasons.push({
        type: "repeat",
        label: "Repeat Offender",
        detail: `${r.maxIn7Days}× dalam 7 hari — ${r.worstWindowLabel}`,
      });
    });

    // ── Rule 2: Kuadran Kritis (freq tinggi + durasi panjang) ─────────────
    computed.matrixPoints
      .filter((p) => p.quadrant === "critical")
      .forEach((p) => {
        ensure(p.penyulang, p.ulp, p.freq);
        map[p.penyulang].score += 3;
        map[p.penyulang].avgDurMin = p.avgDurMin;
        map[p.penyulang].reasons.push({
          type: "critical",
          label: "Kuadran Kritis",
          detail: `${p.freq}× gangguan, rata-rata ${p.avgDurMin} mnt/kejadian`,
        });
      });

    // ── Rule 3: MTBF rendah ───────────────────────────────────────────────
    computed.mtbfItems
      .filter((m) => m.mtbfDays < 14)
      .forEach((m) => {
        ensure(m.penyulang, m.ulp, m.count);
        const pts = m.mtbfDays < 7 ? 4 : 2;
        map[m.penyulang].score += pts;
        map[m.penyulang].mtbfDays = m.mtbfDays;
        map[m.penyulang].reasons.push({
          type: "mtbf",
          label: m.mtbfDays < 7 ? "MTBF < 7 Hari" : "MTBF < 14 Hari",
          detail: `Rata-rata gangguan setiap ${m.mtbfDays} hari`,
        });
      });

    // ── Rule 4: Top Pareto contributors ──────────────────────────────────
    const paretoTop = Math.max(3, Math.ceil(computed.paretoItems.length * 0.25));
    computed.paretoItems.slice(0, paretoTop).forEach((p, idx) => {
      ensure(p.penyulang, p.ulp, p.count);
      const pts = idx === 0 ? 3 : idx < 3 ? 2 : 1;
      map[p.penyulang].score += pts;
      map[p.penyulang].paretoRank = idx + 1;
      map[p.penyulang].count = Math.max(map[p.penyulang].count, p.count);
      map[p.penyulang].reasons.push({
        type: "pareto",
        label: `Pareto #${idx + 1}`,
        detail: `${p.count} gangguan (${p.cumPct}% kumulatif)`,
      });
    });

    return Object.entries(map)
      .filter(([, d]) => d.score >= 2)
      .map(([penyulang, d]): PenyulangRisk => ({
        penyulang,
        ulp: d.ulp,
        score: d.score,
        level: d.score >= 9 ? "DARURAT" : d.score >= 5 ? "KRITIS" : "WASPADA",
        reasons: d.reasons,
        recommendation: generateRec(d.reasons),
        count: d.count,
        mtbfDays: d.mtbfDays,
        maxIn7Days: d.maxIn7Days,
        avgDurMin: d.avgDurMin,
        paretoRank: d.paretoRank,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 9);
  }, [computed]);
}
