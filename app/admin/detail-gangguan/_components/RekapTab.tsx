"use client";

import { useMemo } from "react";
import { CheckCircle2, Clock, TrendingDown } from "lucide-react";
import type { KoreksiRow } from "./KoreksiModal";

interface GangguanLite {
  no_laporan?: string;
  durasi_response_time?: number | null; // detik (asli)
  durasi_recovery_time?: number | null; // detik (asli)
}

interface Props {
  rows: GangguanLite[]; // semua laporan Non CT
  koreksiMap: Map<string, KoreksiRow>;
}

function jam(min: number): string {
  const t = Math.max(0, Math.round(min));
  const h = Math.floor(t / 60);
  const m = t % 60;
  if (h === 0) return `${m} mnt`;
  if (m === 0) return `${h} jam`;
  return `${h} j ${m} m`;
}

export default function RekapTab({ rows, koreksiMap }: Props) {
  const total = rows.length;
  const corrected = useMemo(
    () => rows.filter((r) => koreksiMap.has(String(r.no_laporan ?? ""))).length,
    [rows, koreksiMap],
  );
  const belum = Math.max(0, total - corrected);
  const pct = total > 0 ? Math.round((corrected / total) * 100) : 0;

  // Rata-rata SEBELUM (asli) vs SESUDAH (koreksi bila ada, asli bila belum),
  // atas seluruh laporan Non CT yang punya nilai waktu (asli > 0).
  const stat = useMemo(() => {
    function calc(detikKey: "durasi_response_time" | "durasi_recovery_time", korKey: "rpt_koreksi" | "rct_koreksi") {
      let n = 0, before = 0, after = 0;
      for (const r of rows) {
        const asliMin = (Number(r[detikKey]) || 0) / 60; // detik → menit
        if (asliMin <= 0) continue;
        n++;
        before += asliMin;
        const kor = koreksiMap.get(String(r.no_laporan ?? ""));
        const korVal = kor ? Number(kor[korKey]) : NaN;
        after += Number.isFinite(korVal) && korVal > 0 ? korVal : asliMin;
      }
      return { n, before: n ? before / n : 0, after: n ? after / n : 0 };
    }
    return {
      rpt: calc("durasi_response_time", "rpt_koreksi"),
      rct: calc("durasi_recovery_time", "rct_koreksi"),
    };
  }, [rows, koreksiMap]);

  const koreksiList = useMemo(() => [...koreksiMap.values()], [koreksiMap]);

  return (
    <div className="space-y-4">
      {/* Kartu jumlah */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total Non CT" value={total} sub="laporan" />
        <Stat label="Sudah Dikoreksi" value={corrected} sub={`${pct}% selesai`} accent="emerald" icon={<CheckCircle2 className="w-4 h-4" />} />
        <Stat label="Belum Dikoreksi" value={belum} sub="laporan" accent="amber" />
        <Stat label="Progres" value={pct} sub="% dari Non CT" />
      </div>

      {/* Rata-rata sebelum vs sesudah (seluruh Non CT) */}
      <div className="grid md:grid-cols-2 gap-3">
        <CompareCard title="Rata-rata RPT (Response)" before={stat.rpt.before} after={stat.rpt.after} n={stat.rpt.n} corrected={corrected} />
        <CompareCard title="Rata-rata RCT (Recovery)" before={stat.rct.before} after={stat.rct.after} n={stat.rct.n} corrected={corrected} />
      </div>

      {/* Tabel per laporan terkoreksi */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0] text-sm font-semibold text-[#1B2631]">
          Detail Koreksi ({koreksiList.length})
        </div>
        {koreksiList.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#94a3b8]">Belum ada laporan yang dikoreksi</div>
        ) : (
          <div className="overflow-auto max-h-[55vh]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0">
                <tr>
                  {["#", "No Laporan", "RPT Asli", "RPT Koreksi", "RCT Asli", "RCT Koreksi", "Korektor", "Tgl Koreksi"].map((h) => (
                    <th key={h} className="py-2.5 px-2 text-left bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {koreksiList.map((k, i) => (
                  <tr key={k.no_laporan} className="border-t border-[#E2E8F0] hover:bg-[#F4F6F8]">
                    <td className="py-2 px-2 text-[#94a3b8] text-right tabular-nums">{i + 1}</td>
                    <td className="py-2 px-2 font-mono text-[#1B2631] whitespace-nowrap">{k.no_laporan}</td>
                    <td className="py-2 px-2 text-[#94a3b8] line-through whitespace-nowrap">{jam(Number(k.rpt_asli) || 0)}</td>
                    <td className="py-2 px-2 font-semibold text-emerald-700 whitespace-nowrap">{jam(Number(k.rpt_koreksi) || 0)}</td>
                    <td className="py-2 px-2 text-[#94a3b8] line-through whitespace-nowrap">{jam(Number(k.rct_asli) || 0)}</td>
                    <td className="py-2 px-2 font-semibold text-emerald-700 whitespace-nowrap">{jam(Number(k.rct_koreksi) || 0)}</td>
                    <td className="py-2 px-2 text-[#1B2631] whitespace-nowrap">{k.korektor || "—"}</td>
                    <td className="py-2 px-2 text-[#64748b] whitespace-nowrap">
                      {k.tgl_koreksi ? new Date(k.tgl_koreksi).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent, icon }: {
  label: string; value: number; sub?: string; accent?: "emerald" | "amber"; icon?: React.ReactNode;
}) {
  const color = accent === "emerald" ? "text-emerald-600" : accent === "amber" ? "text-amber-600" : "text-[#1B2631]";
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4">
      <p className="text-xs text-[#94a3b8] mb-1 flex items-center gap-1">{icon}{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-[#94a3b8] mt-0.5">{sub}</p>}
    </div>
  );
}

function CompareCard({ title, before, after, n, corrected }: {
  title: string; before: number; after: number; n: number; corrected: number;
}) {
  const delta = before - after;
  const pct = before > 0 ? Math.round((delta / before) * 100) : 0;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4">
      <p className="text-xs text-[#64748b] mb-2 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-[#00897B]" /> {title}
        <span className="ml-auto text-[10px] text-[#94a3b8]">{n} laporan · {corrected} dikoreksi</span>
      </p>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm text-[#94a3b8] line-through">{jam(before)}</span>
        <span className="text-[#94a3b8]">→</span>
        <span className="text-xl font-bold text-emerald-600">{jam(after)}</span>
      </div>
      <p className="text-[11px] text-[#64748b] mt-1.5 flex items-center gap-1">
        <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
        Turun rata-rata <b className="text-emerald-700">{jam(Math.abs(delta))}</b> ({pct}%)
      </p>
    </div>
  );
}
