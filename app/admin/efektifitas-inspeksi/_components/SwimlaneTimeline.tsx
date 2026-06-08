"use client";

import { useMemo, useState } from "react";
import type { PenyulangEffectiveness, InspeksiDetail, GangguanEvent } from "../_hooks/useInspeksiEffectiveness";

// ── Constants ─────────────────────────────────────────────────────────────────

const VB_W    = 760;
const PAD_L   = 70;
const PAD_R   = 16;
const CHART_W = VB_W - PAD_L - PAD_R;

const R_G     = 7;    // gangguan circle radius
const S_I     = 8;    // inspeksi diamond half-size
const S_E     = 6;    // eksekusi square half-size

// Geometry: normal vs fullscreen
const GEOM_NORMAL = { VB_H: 260, Y_G: 44,  Y_I: 128, Y_E: 204, Y_AXIS: 232 };
const GEOM_FS     = { VB_H: 360, Y_G: 60,  Y_I: 180, Y_E: 290, Y_AXIS: 330 };

const MONTH_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMs(d: string): number {
  return new Date(d + "T12:00:00").getTime();
}

function fmtDate(s: string): string {
  const d = new Date(s + "T12:00:00");
  return `${d.getDate()} ${MONTH_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function absDays(a: string, b: string): number {
  return Math.abs(Math.round((toMs(b) - toMs(a)) / 86400000));
}

// ── Grouped types ─────────────────────────────────────────────────────────────

interface GangguanGroup {
  date: string;
  count: number;
  keypoints: string[];
  penyebabs: string[];
}

interface InspeksiGroup {
  date: string;
  records: InspeksiDetail[];
  jaringan: number;
  pohon: number;
}

interface EksekusiGroup {
  date: string;
  records: InspeksiDetail[];
  jaringan: number;
  pohon: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { data: PenyulangEffectiveness; fullscreen?: boolean }
interface HoverInfo { x: number; y: number; lines: string[] }

export default function SwimlaneTimeline({ data, fullscreen }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const { gangguanEvents, inspeksiList, ligaExekusiDates } = data;

  const { VB_H, Y_G, Y_I, Y_E, Y_AXIS } = fullscreen ? GEOM_FS : GEOM_NORMAL;
  const MID_GI = (Y_G + Y_I) / 2;
  const MID_IE = (Y_I + Y_E) / 2;

  // ── Group gangguan by date ──────────────────────────────────────────────────
  const gangguanGroups = useMemo((): GangguanGroup[] => {
    const map = new Map<string, GangguanEvent[]>();
    gangguanEvents.forEach(e => {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, evts]) => ({
        date,
        count: evts.length,
        keypoints: [...new Set(evts.map(e => e.keypoint).filter(Boolean) as string[])],
        penyebabs: [...new Set(evts.map(e => e.penyebab).filter(Boolean) as string[])],
      }));
  }, [gangguanEvents]);

  // ── Group inspeksi by tgl_inspeksi ─────────────────────────────────────────
  const inspeksiGroups = useMemo((): InspeksiGroup[] => {
    const map = new Map<string, InspeksiDetail[]>();
    inspeksiList.forEach(ins => {
      if (!map.has(ins.tgl_inspeksi)) map.set(ins.tgl_inspeksi, []);
      map.get(ins.tgl_inspeksi)!.push(ins);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, records]) => ({
        date,
        records,
        jaringan: records.filter(r => r.type === "jaringan").length,
        pohon:    records.filter(r => r.type === "pohon").length,
      }));
  }, [inspeksiList]);

  // ── Group eksekusi by tgl_eksekusi ─────────────────────────────────────────
  const eksekusiGroups = useMemo((): EksekusiGroup[] => {
    const map = new Map<string, InspeksiDetail[]>();
    inspeksiList.filter(i => i.tgl_eksekusi).forEach(ins => {
      const d = ins.tgl_eksekusi!;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(ins);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, records]) => ({
        date,
        records,
        jaringan: records.filter(r => r.type === "jaringan").length,
        pohon:    records.filter(r => r.type === "pohon").length,
      }));
  }, [inspeksiList]);

  // ── Inspeksi → Eksekusi deduped links ──────────────────────────────────────
  const inspEksLinks = useMemo(() => {
    const seen = new Set<string>();
    const links: { xi: string; xe: string; days: number }[] = [];
    inspeksiList.filter(i => i.tgl_eksekusi).forEach(i => {
      const key = `${i.tgl_inspeksi}→${i.tgl_eksekusi}`;
      if (!seen.has(key)) {
        seen.add(key);
        links.push({ xi: i.tgl_inspeksi, xe: i.tgl_eksekusi!, days: absDays(i.tgl_inspeksi, i.tgl_eksekusi!) });
      }
    });
    return links;
  }, [inspeksiList]);

  // ── LIGA groups (inspeksi & eksekusi ber-category LIGA) ───────────────────
  const ligaInspeksiGroups = useMemo((): InspeksiGroup[] => {
    const map = new Map<string, InspeksiDetail[]>();
    inspeksiList.filter(i => i.category === "LIGA").forEach(ins => {
      if (!map.has(ins.tgl_inspeksi)) map.set(ins.tgl_inspeksi, []);
      map.get(ins.tgl_inspeksi)!.push(ins);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, records]) => ({
        date, records,
        jaringan: records.filter(r => r.type === "jaringan").length,
        pohon:    records.filter(r => r.type === "pohon").length,
      }));
  }, [inspeksiList]);

  const ligaEksekusiGroups = useMemo((): EksekusiGroup[] => {
    const map = new Map<string, InspeksiDetail[]>();
    inspeksiList.filter(i => i.category === "LIGA" && i.tgl_eksekusi).forEach(ins => {
      const d = ins.tgl_eksekusi!;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(ins);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, records]) => ({
        date, records,
        jaringan: records.filter(r => r.type === "jaringan").length,
        pohon:    records.filter(r => r.type === "pohon").length,
      }));
  }, [inspeksiList]);

  // ── Today + last gangguan ─────────────────────────────────────────────────
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const lastGangguanDate = gangguanGroups.length > 0
    ? gangguanGroups[gangguanGroups.length - 1].date
    : null;

  const daysSinceLast = lastGangguanDate
    ? Math.floor((toMs(today) - toMs(lastGangguanDate)) / 86400000)
    : null;

  // Warna berdasarkan rentang: hijau = aman lama, kuning = sedang, merah = baru
  const sinceColor = daysSinceLast === null ? "#94a3b8"
    : daysSinceLast >= 30 ? "#22c55e"
    : daysSinceLast >= 14 ? "#84cc16"
    : daysSinceLast >= 7  ? "#f59e0b"
    : "#ef4444";

  // ── All dates for axis range — selalu include hari ini ────────────────────
  const allDates = useMemo(() => {
    return [
      ...gangguanGroups.map(g => g.date),
      ...inspeksiGroups.map(g => g.date),
      ...eksekusiGroups.map(g => g.date),
      ...ligaExekusiDates,
      today,
    ].sort();
  }, [gangguanGroups, inspeksiGroups, eksekusiGroups, ligaExekusiDates, today]);

  if (allDates.length === 0) {
    return (
      <div className="h-20 flex items-center justify-center text-xs text-[#64748b]">
        Tidak ada data untuk ditampilkan dalam periode ini
      </div>
    );
  }

  const minMs  = toMs(allDates[0]);
  const maxMs  = toMs(allDates[allDates.length - 1]);
  const spanMs = Math.max(maxMs - minMs, 86400000);

  function dateToX(d: string): number {
    return PAD_L + ((toMs(d) - minMs) / spanMs) * CHART_W;
  }

  // ── Month ticks ─────────────────────────────────────────────────────────────
  const monthTicks = useMemo(() => {
    const ticks: { label: string; x: number }[] = [];
    const start = new Date(allDates[0] + "T12:00:00");
    const end   = new Date(allDates[allDates.length - 1] + "T12:00:00");
    const cur   = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      const ds = cur.toISOString().split("T")[0];
      ticks.push({ label: MONTH_ID[cur.getMonth()], x: dateToX(ds) });
      cur.setMonth(cur.getMonth() + 1);
    }
    return ticks;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDates, minMs, spanMs]);

  // ── Gangguan → nearest inspeksi (unique dates) ─────────────────────────────
  const gangguanLinks = useMemo(() => {
    const iDates = inspeksiGroups.map(g => g.date);
    return gangguanGroups.map(({ date: gd }) => {
      const before = iDates.filter(d => d < gd).at(-1) ?? null;
      const after  = iDates.find(d => d > gd) ?? null;
      return { gd, before, after };
    });
  }, [gangguanGroups, inspeksiGroups]);

  function showHover(e: React.MouseEvent<SVGElement>, lines: string[]) {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    setHover({
      x: ((e.clientX - rect.left) / rect.width)  * VB_W,
      y: ((e.clientY - rect.top)  / rect.height) * VB_H,
      lines,
    });
  }

  const svgContent = (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className={`w-full${fullscreen ? " h-full" : ""}`}
      style={fullscreen ? undefined : { height: 260 }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Background */}
      <rect x={PAD_L} y={0} width={CHART_W} height={VB_H} fill="#0a1628" rx={4} />

      {/* Lane separators */}
      <line x1={PAD_L} y1={MID_GI} x2={PAD_L + CHART_W} y2={MID_GI} stroke="#1e3552" strokeWidth={0.5} strokeDasharray="4 3" />
      <line x1={PAD_L} y1={MID_IE} x2={PAD_L + CHART_W} y2={MID_IE} stroke="#1e3552" strokeWidth={0.5} strokeDasharray="4 3" />

        {/* Lane labels */}
        <text x={PAD_L - 6} y={Y_G + 4} textAnchor="end" fontSize={9} fill="#ef4444" fontWeight="600">Gangguan</text>
        <text x={PAD_L - 6} y={Y_I + 4} textAnchor="end" fontSize={9} fill="#5eead4" fontWeight="600">Inspeksi</text>
        <text x={PAD_L - 6} y={Y_E + 4} textAnchor="end" fontSize={9} fill="#34d399" fontWeight="600">Eksekusi</text>

        {/* Time axis */}
        <line x1={PAD_L} y1={Y_AXIS} x2={PAD_L + CHART_W} y2={Y_AXIS} stroke="#1e3552" strokeWidth={1} />
        {monthTicks.map((t, i) => (
          <g key={i}>
            <line x1={t.x} y1={Y_AXIS - 2} x2={t.x} y2={Y_AXIS + 2} stroke="#334155" strokeWidth={1} />
            <text x={t.x} y={Y_AXIS + 11} textAnchor="middle" fontSize={7.5} fill="#475569">{t.label}</text>
          </g>
        ))}

        {/* ── Connection: Gangguan ↔ nearest Inspeksi ── */}
        {gangguanLinks.map(({ gd, before, after }, i) => {
          const xg = dateToX(gd);
          return (
            <g key={`gl-${i}`}>
              {before && (() => {
                const xi   = dateToX(before);
                const days = absDays(before, gd);
                const midX = (xi + xg) / 2;
                return (
                  <g>
                    <path d={`M ${xi} ${Y_I - S_I} Q ${midX} ${MID_GI - 10} ${xg} ${Y_G + R_G}`}
                      fill="none" stroke="#fbbf24" strokeWidth={1.2} strokeDasharray="4 3" strokeOpacity={0.65} />
                    <text x={midX} y={MID_GI - 16} textAnchor="middle" fontSize={8} fill="#fbbf24" fontWeight="700">
                      {days}h
                    </text>
                  </g>
                );
              })()}
              {after && (() => {
                const xi   = dateToX(after);
                const days = absDays(gd, after);
                const midX = (xg + xi) / 2;
                return (
                  <g>
                    <path d={`M ${xg} ${Y_G + R_G} Q ${midX} ${MID_GI - 10} ${xi} ${Y_I - S_I}`}
                      fill="none" stroke="#86efac" strokeWidth={1.2} strokeDasharray="4 3" strokeOpacity={0.65} />
                    <text x={midX} y={MID_GI - 16} textAnchor="middle" fontSize={8} fill="#86efac" fontWeight="700">
                      {days}h
                    </text>
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* ── Connection: Inspeksi → Eksekusi ── */}
        {inspEksLinks.map((link, i) => {
          const xi   = dateToX(link.xi);
          const xe   = dateToX(link.xe);
          const midX = (xi + xe) / 2;
          return (
            <g key={`ie-${i}`}>
              <path d={`M ${xi} ${Y_I + S_I} Q ${midX} ${MID_IE + 10} ${xe} ${Y_E - S_E}`}
                fill="none" stroke="#5eead4" strokeWidth={1.2} strokeDasharray="4 3" strokeOpacity={0.55} />
              {link.days > 0 && (
                <text x={midX} y={MID_IE + 22} textAnchor="middle" fontSize={8} fill="#5eead4" fontWeight="700">
                  {link.days}h
                </text>
              )}
            </g>
          );
        })}

        {/* ── Gangguan dots + count badge ── */}
        {gangguanGroups.map(({ date, count, keypoints, penyebabs }) => {
          const x = dateToX(date);
          const tip = [
            `${fmtDate(date)}`,
            `${count} gangguan`,
            ...(keypoints.length > 0 ? [`Titik: ${keypoints.join(", ")}`] : []),
            ...(penyebabs.length > 0 ? [`Penyebab: ${penyebabs.join(", ")}`] : []),
          ];
          return (
            <g key={`g-${date}`} className="cursor-pointer" onMouseEnter={e => showHover(e, tip)}>
              <circle cx={x} cy={Y_G} r={R_G} fill="#ef4444" fillOpacity={0.9} stroke="#fca5a5" strokeWidth={1.5} />
              {/* count badge above */}
              <text x={x} y={Y_G - R_G - 3} textAnchor="middle" fontSize={8} fill="#ef4444" fontWeight="700">
                {count}
              </text>
            </g>
          );
        })}

        {/* ── Inspeksi diamonds + count badge + GH label ── */}
        {inspeksiGroups.map(({ date, records, jaringan, pohon }) => {
          const x     = dateToX(date);
          const count = records.length;
          const fill  = jaringan > 0 && pohon > 0 ? "#a78bfa" : jaringan > 0 ? "#5eead4" : "#a78bfa";
          const statuses = [...new Set(records.map(r => r.status))].join(", ");
          const ghNames  = [...new Set(records.map(r => r.gh))];
          const tip = [
            `${fmtDate(date)}`,
            `${count} inspeksi${jaringan > 0 ? ` · ${jaringan} jaringan` : ""}${pohon > 0 ? ` · ${pohon} pohon` : ""}`,
            ...ghNames.map(gh => `  ${gh}`),
            `Status: ${statuses}`,
          ];
          const s = S_I;
          // GH label: jika hanya 1 GH tampil singkatan, jika >1 tampil jumlah
          const ghLabel = ghNames.length === 1
            ? ghNames[0].split(" ").slice(-1)[0]   // kata terakhir saja
            : `${ghNames.length} GH`;
          return (
            <g key={`i-${date}`} className="cursor-pointer" onMouseEnter={e => showHover(e, tip)}>
              <polygon
                points={`${x},${Y_I - s} ${x + s},${Y_I} ${x},${Y_I + s} ${x - s},${Y_I}`}
                fill={fill} fillOpacity={0.9} stroke={fill} strokeWidth={1}
              />
              {/* count badge above */}
              <text x={x} y={Y_I - s - 3} textAnchor="middle" fontSize={8} fill={fill} fontWeight="700">
                {count}
              </text>
              {/* GH label below */}
              <text x={x} y={Y_I + s + 9} textAnchor="middle" fontSize={7} fill={fill} opacity={0.7}>
                {ghLabel}
              </text>
            </g>
          );
        })}

        {/* ── Eksekusi squares + count badge ── */}
        {eksekusiGroups.map(({ date, records, jaringan, pohon }) => {
          const x     = dateToX(date);
          const count = records.length;
          const statuses = [...new Set(records.map(r => r.status))].join(", ");
          const tip = [
            `${fmtDate(date)}`,
            `${count} eksekusi${jaringan > 0 ? ` · ${jaringan} jaringan` : ""}${pohon > 0 ? ` · ${pohon} pohon` : ""}`,
            `Status: ${statuses}`,
          ];
          const s = S_E;
          return (
            <g key={`e-${date}`} className="cursor-pointer" onMouseEnter={e => showHover(e, tip)}>
              <rect x={x - s} y={Y_E - s} width={s * 2} height={s * 2}
                fill="#34d399" fillOpacity={0.9} stroke="#6ee7b7" strokeWidth={1} rx={1} />
              {/* count badge above */}
              <text x={x} y={Y_E - s - 3} textAnchor="middle" fontSize={8} fill="#34d399" fontWeight="700">
                {count}
              </text>
            </g>
          );
        })}

        {/* ── Garis Hari Ini ── */}
        {(() => {
          const xToday = dateToX(today);
          return (
            <g>
              <line x1={xToday} y1={20} x2={xToday} y2={Y_AXIS}
                stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 3" strokeOpacity={0.7} />
              <rect x={xToday - 18} y={3} width={36} height={16} rx={4} fill="#0369a1" fillOpacity={0.9} />
              <text x={xToday} y={15} textAnchor="middle" fontSize={9} fill="#e0f2fe" fontWeight="bold">Hari Ini</text>
            </g>
          );
        })()}

        {/* ── Garis dari gangguan terakhir → hari ini ── */}
        {lastGangguanDate && daysSinceLast !== null && daysSinceLast > 0 && (() => {
          const xLast   = dateToX(lastGangguanDate);
          const xToday  = dateToX(today);
          const midX    = (xLast + xToday) / 2;
          const yLine   = Y_G + R_G + 6;
          return (
            <g>
              {/* Garis horizontal dashed */}
              <line
                x1={xLast + R_G} y1={yLine}
                x2={xToday}      y2={yLine}
                stroke={sinceColor} strokeWidth={1.5}
                strokeDasharray="5 3" strokeOpacity={0.75}
              />
              {/* Panah kecil di ujung */}
              <polygon
                points={`${xToday},${yLine - 3} ${xToday + 5},${yLine} ${xToday},${yLine + 3}`}
                fill={sinceColor} fillOpacity={0.85}
              />
              {/* Label dua baris — di bawah garis, kiri dari "Hari Ini" */}
              <rect x={xToday - 116} y={yLine + 4} width={112} height={22} rx={3}
                fill="#0d1b2a" stroke={sinceColor} strokeWidth={1} strokeOpacity={0.7} />
              <text x={xToday - 8} y={yLine + 14} textAnchor="end" fontSize={9}
                fill={sinceColor} fontWeight="bold">
                {daysSinceLast}h tidak gangguan
              </text>
              <text x={xToday - 8} y={yLine + 24} textAnchor="end" fontSize={8}
                fill={sinceColor} opacity={0.85}>
                sampai hari ini
              </text>
            </g>
          );
        })()}

        {/* ── LIGA vertical lines ── */}
        {ligaExekusiDates.map(date => {
          const x = dateToX(date);
          const tip = [`LIGA — ${fmtDate(date)}`, "Eksekusi pemadaman terencana"];
          return (
            <g key={`liga-line-${date}`} className="cursor-pointer" onMouseEnter={e => showHover(e, tip)}>
              <line x1={x} y1={20} x2={x} y2={Y_AXIS}
                stroke="#6366f1" strokeWidth={1.5} strokeDasharray="5 3" strokeOpacity={0.85} />
              {/* Badge label */}
              <rect x={x - 16} y={3} width={32} height={16} rx={4} fill="#4f46e5" fillOpacity={0.95} />
              <text x={x} y={15} textAnchor="middle" fontSize={10} fill="#e0e7ff" fontWeight="bold">LIGA</text>
            </g>
          );
        })}

        {/* ── LIGA inspeksi (indigo diamond, di atas normal) ── */}
        {ligaInspeksiGroups.map(({ date, records }) => {
          const x     = dateToX(date);
          const count = records.length;
          const tip   = [
            `LIGA Inspeksi — ${fmtDate(date)}`,
            `${count} titik`,
            ...[...new Set(records.map(r => r.gh))].map(gh => `  ${gh}`),
          ];
          const s = S_I + 1;
          return (
            <g key={`liga-i-${date}`} className="cursor-pointer" onMouseEnter={e => showHover(e, tip)}>
              <polygon
                points={`${x},${Y_I - s} ${x + s},${Y_I} ${x},${Y_I + s} ${x - s},${Y_I}`}
                fill="#6366f1" fillOpacity={0.9} stroke="#a5b4fc" strokeWidth={1.5}
              />
              <text x={x} y={Y_I - s - 3} textAnchor="middle" fontSize={8} fill="#818cf8" fontWeight="700">
                {count}L
              </text>
            </g>
          );
        })}

        {/* ── LIGA eksekusi (indigo square) ── */}
        {ligaEksekusiGroups.map(({ date, records }) => {
          const x     = dateToX(date);
          const count = records.length;
          const tip   = [
            `LIGA Eksekusi — ${fmtDate(date)}`,
            `${count} item selesai`,
            ...[...new Set(records.map(r => r.gh))].map(gh => `  ${gh}`),
          ];
          const s = S_E + 1;
          return (
            <g key={`liga-e-${date}`} className="cursor-pointer" onMouseEnter={e => showHover(e, tip)}>
              <rect x={x - s} y={Y_E - s} width={s * 2} height={s * 2}
                fill="#6366f1" fillOpacity={0.9} stroke="#a5b4fc" strokeWidth={1.5} rx={1} />
              <text x={x} y={Y_E - s - 3} textAnchor="middle" fontSize={8} fill="#818cf8" fontWeight="700">
                {count}L
              </text>
            </g>
          );
        })}

        {/* ── Tooltip ── */}
        {hover && (() => {
          const P  = 7;
          const lh = 12;
          const bw = Math.max(...hover.lines.map(l => l.length)) * 5.4 + P * 2;
          const bh = hover.lines.length * lh + P * 2;
          const tx = Math.min(hover.x + 10, VB_W - bw - 4);
          const ty = Math.max(hover.y - bh - 6, 2);
          return (
            <g>
              <rect x={tx} y={ty} width={bw} height={bh} rx={4} fill="#162334" stroke="#1e3552" strokeWidth={1} />
              {hover.lines.map((line, li) => (
                <text key={li} x={tx + P} y={ty + P + (li + 1) * lh - 2}
                  fontSize={9.5} fill={li === 0 ? "#e2e8f0" : "#94a3b8"} fontWeight={li === 0 ? "700" : "400"}>
                  {line}
                </text>
              ))}
            </g>
          );
        })()}
    </svg>
  );

  const legend = (
    <div className={`flex items-center gap-4 px-1 flex-wrap shrink-0${fullscreen ? " mt-3" : " mt-2"}`}>
      <LegendItem shape="circle"  color="#ef4444" label="Gangguan" />
      <LegendItem shape="diamond" color="#5eead4" label="Inspeksi Jaringan" />
      <LegendItem shape="diamond" color="#a78bfa" label="Inspeksi Pohon" />
      <LegendItem shape="square"  color="#34d399" label="Eksekusi" />
      <div className="flex items-center gap-3 ml-1 text-[10px] text-[#64748b]">
        <span><span className="text-amber-400 font-semibold">— —</span> sebelum gangguan</span>
        <span><span className="text-green-400 font-semibold">— —</span> setelah gangguan</span>
        <span><span className="text-teal-400 font-semibold">— —</span> inspeksi → eksekusi</span>
        <span>· angka = jumlah / hari</span>
      </div>
    </div>
  );

  return (
    <div
      className={`select-none${fullscreen ? " h-full flex flex-col" : " relative"}`}
      onMouseLeave={() => setHover(null)}
    >
      {fullscreen ? (
        <div className="flex-1 min-h-0 relative">{svgContent}</div>
      ) : (
        <div className="relative">{svgContent}</div>
      )}
      {legend}
    </div>
  );
}

// ── Legend helper ──────────────────────────────────────────────────────────────

function LegendItem({ shape, color, label }: { shape: "circle" | "diamond" | "square"; color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <svg width={12} height={12}>
        {shape === "circle"  && <circle cx={6} cy={6} r={5} fill={color} />}
        {shape === "diamond" && <polygon points="6,0 12,6 6,12 0,6" fill={color} />}
        {shape === "square"  && <rect x={1} y={1} width={10} height={10} fill={color} rx={1} />}
      </svg>
      <span className="text-[10px] text-[#94a3b8]">{label}</span>
    </div>
  );
}
