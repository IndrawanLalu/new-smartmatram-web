"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, ListChecks, PencilLine, TrendingDown } from "lucide-react";
import StatTile from "@/app/admin/_components/StatTile";
import { CARD, DISPLAY, EYEBROW } from "@/app/admin/_ui";
import { fmtMenit, type KoreksiRow } from "../_lib/gangguan";
import Paginasi from "./Paginasi";

interface GangguanLite {
  no_laporan?: string;
  durasi_response_time?: number | null; // detik (asli)
  durasi_recovery_time?: number | null; // detik (asli)
}

interface Props {
  rows: GangguanLite[]; // semua laporan Non CT
  koreksiMap: Map<string, KoreksiRow>;
}

/** Daftar koreksi ikut tumbuh seumur pemakaian — jangan dirender sekaligus. */
const PER_HALAMAN = 50;

const TH =
  "py-2.5 px-2 text-left bg-navy-50 text-navy-600 font-semibold border-b border-line whitespace-nowrap";

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

  const [halaman, setHalaman] = useState(1);
  // Dijepit, bukan direset lewat efek: daftar bisa menyusut saat koreksi
  // dimuat ulang, dan halaman yang melewati ujung akan tampil kosong.
  const halamanAman = Math.min(
    halaman,
    Math.max(1, Math.ceil(koreksiList.length / PER_HALAMAN)),
  );
  const halamanIni = useMemo(
    () => koreksiList.slice((halamanAman - 1) * PER_HALAMAN, halamanAman * PER_HALAMAN),
    [koreksiList, halamanAman],
  );

  return (
    <div className="space-y-3">
      {/* Kartu jumlah */}
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total Non CT" value={total} icon={ListChecks} hint="laporan" />
        <StatTile
          label="Sudah Dikoreksi"
          value={corrected}
          tone="green"
          icon={CheckCircle2}
          hint={`${pct}% selesai`}
        />
        <StatTile
          label="Belum Dikoreksi"
          value={belum}
          tone={belum > 0 ? "attention" : "green"}
          icon={PencilLine}
          hint="laporan"
        />
        <StatTile label="Progres" value={`${pct}%`} hint="dari seluruh Non CT" />
      </div>

      {/* Rata-rata sebelum vs sesudah (seluruh Non CT) */}
      <div className="grid gap-3 md:grid-cols-2">
        <CompareCard title="Rata-rata RPT (Response)" before={stat.rpt.before} after={stat.rpt.after} n={stat.rpt.n} corrected={corrected} />
        <CompareCard title="Rata-rata RCT (Recovery)" before={stat.rct.before} after={stat.rct.after} n={stat.rct.n} corrected={corrected} />
      </div>

      {/* Tabel per laporan terkoreksi */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-line text-sm font-semibold text-ink">
          Detail Koreksi ({koreksiList.length})
        </div>
        {koreksiList.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-ink-muted">
            <PencilLine className="w-9 h-9 opacity-25" />
            <p className="text-sm">Belum ada laporan yang dikoreksi</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[55vh]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  {["#", "No Laporan", "RPT Asli", "RPT Koreksi", "RCT Asli", "RCT Koreksi", "Korektor", "Tgl Koreksi"].map((h) => (
                    <th key={h} className={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {halamanIni.map((k, i) => (
                  <tr key={k.no_laporan} className="border-t border-line hover:bg-surface transition-colors">
                    <td className="py-2 px-2 text-ink-muted text-right tabular-nums">{(halamanAman - 1) * PER_HALAMAN + i + 1}</td>
                    <td className="py-2 px-2 font-mono text-ink whitespace-nowrap">{k.no_laporan}</td>
                    <td className="py-2 px-2 text-ink-muted line-through whitespace-nowrap">{fmtMenit(Number(k.rpt_asli) || 0)}</td>
                    <td className="py-2 px-2 font-semibold text-green-700 whitespace-nowrap">{fmtMenit(Number(k.rpt_koreksi) || 0)}</td>
                    <td className="py-2 px-2 text-ink-muted line-through whitespace-nowrap">{fmtMenit(Number(k.rct_asli) || 0)}</td>
                    <td className="py-2 px-2 font-semibold text-green-700 whitespace-nowrap">{fmtMenit(Number(k.rct_koreksi) || 0)}</td>
                    <td className="py-2 px-2 text-ink whitespace-nowrap">{k.korektor || "—"}</td>
                    <td className="py-2 px-2 text-ink-soft whitespace-nowrap">
                      {k.tgl_koreksi ? new Date(k.tgl_koreksi).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Paginasi
          total={koreksiList.length}
          halaman={halamanAman}
          perHalaman={PER_HALAMAN}
          onGanti={setHalaman}
          satuan="koreksi"
        />
      </div>
    </div>
  );
}

function CompareCard({ title, before, after, n, corrected }: {
  title: string; before: number; after: number; n: number; corrected: number;
}) {
  const delta = before - after;
  const pct = before > 0 ? Math.round((delta / before) * 100) : 0;
  return (
    <div className={`${CARD} p-4`}>
      <p className="flex items-center gap-1.5 mb-2">
        <Clock className="w-3.5 h-3.5 text-navy-600 shrink-0" />
        <span className={EYEBROW}>{title}</span>
        <span className="ml-auto text-[10px] text-ink-muted">{n} laporan · {corrected} dikoreksi</span>
      </p>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm text-ink-muted line-through">{fmtMenit(before)}</span>
        <span className="text-ink-muted">→</span>
        <span className={`${DISPLAY} text-xl font-bold text-green-700`}>{fmtMenit(after)}</span>
      </div>
      <p className="text-[11px] text-ink-soft mt-1.5 flex items-center gap-1">
        <TrendingDown className="w-3.5 h-3.5 text-green-700 shrink-0" />
        Turun rata-rata <b className="text-green-700">{fmtMenit(Math.abs(delta))}</b> ({pct}%)
      </p>
    </div>
  );
}
