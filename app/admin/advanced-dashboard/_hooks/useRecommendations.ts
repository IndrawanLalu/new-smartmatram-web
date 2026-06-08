"use client";

import { useMemo } from "react";
import type { ComputedData } from "./useAdvancedDashboard";

export type Priority = "KRITIS" | "PENTING" | "PERHATIAN";
export type Category = "Pemeliharaan" | "Operasional" | "Infrastruktur" | "SDM";

export interface Recommendation {
  id: string;
  priority: Priority;
  category: Category;
  title: string;
  detail: string;
  action: string;
  assets?: string[];
}

const PRIORITY_ORDER: Record<Priority, number> = { KRITIS: 0, PENTING: 1, PERHATIAN: 2 };

const DIM_LABELS: Record<string, string> = {
  bebanGangguan:   "Bebas Gangguan",
  pemulihanCepat:  "Pemulihan Cepat",
  durasiPendek:    "Durasi Singkat",
  penyebabDikenal: "Penyebab Teridentifikasi",
  bebasUlang:      "Bebas Ulang",
};

function trendAvg(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function trendChange(values: number[]): number {
  if (values.length < 2) return 0;
  const half = Math.ceil(values.length / 2);
  const a1 = trendAvg(values.slice(0, half));
  const a2 = trendAvg(values.slice(half));
  if (a1 === 0) return 0;
  return Math.round(((a2 - a1) / a1) * 100);
}

export function useRecommendations(computed: ComputedData | null): Recommendation[] {
  return useMemo(() => {
    if (!computed || computed.isEmpty) return [];

    const recs: Recommendation[] = [];

    // ── KRITIS 1: Repeat offenders ───────────────────────────────────────────
    if (computed.recurrenceItems.length > 0) {
      const top = computed.recurrenceItems.slice(0, 3);
      recs.push({
        id: "repeat-offender",
        priority: "KRITIS",
        category: "Pemeliharaan",
        title: `${computed.recurrenceItems.length} penyulang dengan gangguan berulang kronis`,
        detail: `Terdeteksi penyulang yang mengalami ≥ 3 gangguan dalam jendela 7 hari — indikasi kerusakan struktural yang belum tertangani. Terparah: ${top.map((r) => `${r.penyulang} (${r.maxIn7Days}x / 7 hari)`).join(", ")}.`,
        action: "Jangan hanya restore — lakukan inspeksi menyeluruh dan perbaikan permanen. Temukan dan eliminasi akar masalah, bukan gejalanya.",
        assets: computed.recurrenceItems.map((r) => r.penyulang),
      });
    }

    // ── KRITIS 2: Critical quadrant ──────────────────────────────────────────
    const criticals = computed.matrixPoints
      .filter((p) => p.quadrant === "critical")
      .sort((a, b) => b.freq - a.freq)
      .slice(0, 5);
    if (criticals.length > 0) {
      recs.push({
        id: "critical-quadrant",
        priority: "KRITIS",
        category: "Pemeliharaan",
        title: `${criticals.length} penyulang frekuensi tinggi sekaligus durasi panjang`,
        detail: `Penyulang dengan gangguan di atas median frekuensi DAN di atas median durasi — paling menguras sumber daya. Teratas: ${criticals.slice(0, 3).map((p) => `${p.penyulang} (${p.freq}x, rata-rata ${p.avgDurMin} mnt)`).join(", ")}.`,
        action: "Prioritaskan program pemeliharaan preventif di sini. Investasi pada penyulang ini memberi dampak terbesar terhadap SAIDI/SAIFI.",
        assets: criticals.map((p) => p.penyulang),
      });
    }

    // ── PENTING 1: Pareto 80/20 ──────────────────────────────────────────────
    if (computed.paretoItems.length > 0) {
      const cutoff = computed.paretoItems.findIndex((i) => i.cumPct >= 80);
      const n80 = cutoff >= 0 ? cutoff + 1 : computed.paretoItems.length;
      const pct80 = Math.round((n80 / computed.paretoItems.length) * 100);
      const isConcentrated = pct80 <= 40;
      recs.push({
        id: "pareto",
        priority: isConcentrated ? "KRITIS" : "PENTING",
        category: "Infrastruktur",
        title: isConcentrated
          ? `Pareto kuat — hanya ${pct80}% penyulang menyebabkan 80% total gangguan`
          : `${n80} penyulang (${pct80}%) bertanggung jawab atas 80% total gangguan`,
        detail: `${n80} dari ${computed.paretoItems.length} penyulang menyebabkan 80% dari ${computed.totalGangguan} gangguan. ${isConcentrated ? "Distribusi sangat tidak merata — ini peluang besar." : "Distribusi cukup merata, namun penyulang teratas tetap layak diprioritaskan."} Teratas: ${computed.paretoItems.slice(0, 3).map((p) => `${p.penyulang} (${p.count}x)`).join(", ")}.`,
        action: "Fokuskan anggaran dan sumber daya pemeliharaan pada penyulang teratas. Perbaikan di sini memberi dampak terbesar terhadap total gangguan dengan alokasi minimal.",
        assets: computed.paretoItems.slice(0, n80).map((p) => p.penyulang),
      });
    }

    // ── PENTING 2: Low MTBF ──────────────────────────────────────────────────
    const lowMtbf = computed.mtbfItems.filter((m) => m.mtbfDays < 14).slice(0, 5);
    if (lowMtbf.length > 0) {
      recs.push({
        id: "low-mtbf",
        priority: "PENTING",
        category: "Pemeliharaan",
        title: `${lowMtbf.length} penyulang dengan interval gangguan di bawah 14 hari`,
        detail: `MTBF rendah berarti gangguan terjadi sangat sering. ${lowMtbf.map((m) => `${m.penyulang} (${m.mtbfDays} hari)`).join(", ")}. Makin pendek MTBF, makin mendesak kebutuhan pemeliharaan.`,
        action: "Jadwalkan inspeksi kondisi jaringan, peralatan, dan ROW (Right of Way) segera untuk penyulang-penyulang ini.",
        assets: lowMtbf.map((m) => m.penyulang),
      });
    }

    // ── PENTING 3: Weakest ULP ───────────────────────────────────────────────
    if (computed.ulpRadarData.length >= 2) {
      type DimKey = "bebanGangguan" | "pemulihanCepat" | "durasiPendek" | "penyebabDikenal" | "bebasUlang";
      const dims: DimKey[] = ["bebanGangguan", "pemulihanCepat", "durasiPendek", "penyebabDikenal", "bebasUlang"];
      const scored = computed.ulpRadarData.map((u) => ({
        ulp: u.ulp,
        avg: dims.reduce((s, k) => s + u[k], 0) / dims.length,
        weakestKey: dims.reduce((min, k) => u[k] < u[min] ? k : min, dims[0]),
        weakestVal: Math.min(...dims.map((k) => u[k])),
      }));
      const worst = scored.sort((a, b) => a.avg - b.avg)[0];
      recs.push({
        id: "weakest-ulp",
        priority: "PENTING",
        category: "Operasional",
        title: `ULP ${worst.ulp} memiliki skor performa keseluruhan terendah`,
        detail: `Skor rata-rata ULP ${worst.ulp}: ${Math.round(worst.avg)}/100. Dimensi terlemah: ${DIM_LABELS[worst.weakestKey]} (skor ${worst.weakestVal}).`,
        action: `Fokuskan evaluasi operasional ULP ${worst.ulp} pada aspek "${DIM_LABELS[worst.weakestKey]}". Benchmarking dengan ULP berkinerja terbaik.`,
        assets: [worst.ulp],
      });
    }

    // ── PENTING 4: Controllable causes ──────────────────────────────────────
    const CONTROLLABLE = ["Layangan", "Pohon / Vegetasi", "Binatang"];
    const ctrlRows = computed.heatmapRows.filter((r) => CONTROLLABLE.includes(r.penyebab));
    const ctrlTotal = ctrlRows.reduce((s, r) => s + r.total, 0);
    const ctrlPct = computed.totalGangguan > 0
      ? Math.round((ctrlTotal / computed.totalGangguan) * 100)
      : 0;
    if (ctrlPct >= 15) {
      recs.push({
        id: "controllable-causes",
        priority: "PENTING",
        category: "Infrastruktur",
        title: `${ctrlPct}% gangguan berasal dari penyebab yang bisa dicegah`,
        detail: `${ctrlTotal} gangguan dari penyebab non-teknis: ${ctrlRows.map((r) => `${r.penyebab} (${r.total}x)`).join(", ")}. Potensi pengurangan besar tanpa investasi alat mahal.`,
        action: "Pasang wildlife guard di titik rawan, percepat rabas vegetasi ROW secara rutin, koordinasi dengan pemda untuk penertiban layang-layang di area padat jaringan.",
        assets: ctrlRows.map((r) => r.penyebab),
      });
    }

    // ── PERHATIAN 1: Rising categories ──────────────────────────────────────
    if (computed.monthsInData.length >= 3) {
      const rising = computed.monthKategoriRows
        .map((r) => {
          const vals = computed.monthsInData.map((mk) => r.byMonth[mk] ?? 0);
          const chg = trendChange(vals);
          return { name: r.kategori, chg };
        })
        .filter((r) => r.chg >= 20)
        .sort((a, b) => b.chg - a.chg)
        .slice(0, 3);

      if (rising.length > 0) {
        recs.push({
          id: "rising-categories",
          priority: "PERHATIAN",
          category: "Operasional",
          title: `${rising.length} kategori penyebab menunjukkan tren meningkat`,
          detail: `Kategori yang naik signifikan (paruh awal vs paruh akhir periode): ${rising.map((r) => `${r.name} (+${r.chg}%)`).join(", ")}.`,
          action: "Waspadai pola musiman. Siapkan stok material dan jadwalkan inspeksi preventif sebelum musim puncak tiba.",
          assets: rising.map((r) => r.name),
        });
      }
    }

    // ── PERHATIAN 2: Low quick recovery ─────────────────────────────────────
    if (computed.quickRecoveryPct < 30) {
      recs.push({
        id: "slow-recovery",
        priority: "PERHATIAN",
        category: "SDM",
        title: `Kecepatan pemulihan rendah — hanya ${computed.quickRecoveryPct.toFixed(1)}% gangguan selesai ≤ 5 menit`,
        detail: `Mayoritas gangguan butuh lebih dari 5 menit untuk dipulihkan. Rata-rata durasi saat ini: ${Math.round(computed.avgDurMin)} menit per kejadian.`,
        action: "Evaluasi prosedur switching, ketersediaan petugas piket lapangan, kelengkapan peralatan, dan stok material cadangan di pos-pos strategis.",
      });
    }

    // ── PERHATIAN 3: Anomaly days ────────────────────────────────────────────
    const dailyAvg = computed.trendPoints.length > 0
      ? computed.trendPoints.reduce((s, p) => s + p.count, 0) / computed.trendPoints.length
      : 0;
    const anomalies = computed.trendPoints.filter((p) => p.count > dailyAvg * 2.5 && p.count > 2);
    if (anomalies.length > 0) {
      recs.push({
        id: "anomaly-days",
        priority: "PERHATIAN",
        category: "Operasional",
        title: `${anomalies.length} hari dengan lonjakan gangguan abnormal terdeteksi`,
        detail: `Hari dengan gangguan > 2.5× rata-rata harian (${dailyAvg.toFixed(1)}): ${anomalies.slice(0, 5).map((p) => `${p.label} (${p.count}x)`).join(", ")}${anomalies.length > 5 ? `, +${anomalies.length - 5} lainnya` : ""}.`,
        action: "Investigasi kondisi pada hari-hari puncak tersebut — cuaca ekstrem, kejadian besar, atau kegagalan sistemik yang bersamaan.",
        assets: anomalies.slice(0, 5).map((p) => p.label),
      });
    }

    return recs.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [computed]);
}
