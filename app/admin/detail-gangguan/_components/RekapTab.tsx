"use client";

import { useMemo, useState } from "react";
import { Ban, CheckCircle2, ClipboardList, Clock, ListChecks, PencilLine, TrendingDown } from "lucide-react";
import StatTile from "@/app/admin/_components/StatTile";
import { CARD, DISPLAY, EYEBROW } from "@/app/admin/_ui";
import { fmtMenit, type KoreksiRow } from "../_lib/gangguan";
import { statusKoreksi, type AturanKoreksi } from "../_lib/koreksiHitung";
import Paginasi from "./Paginasi";
import IkonKolom from "@/app/admin/_kit/IkonKolom";

interface GangguanLite {
  no_laporan?: string;
  waktu_lapor?: string;
  durasi_response_time?: number | null; // detik (asli)
  durasi_recovery_time?: number | null; // detik (asli)
}

interface Props {
  rows: GangguanLite[]; // semua laporan Non CT
  koreksiMap: Map<string, KoreksiRow>;
  aturan: AturanKoreksi;
}

/** Daftar koreksi ikut tumbuh seumur pemakaian — jangan dirender sekaligus. */
const PER_HALAMAN = 50;

const TH =
  "py-2.5 px-2 text-left bg-navy-50 text-navy-600 font-semibold border-b border-line whitespace-nowrap";

export default function RekapTab({ rows, koreksiMap, aturan }: Props) {
  const total = rows.length;
  // Istilah user 19 Nov: "Sudah dikoreksi" = tersimpan di APKT (apkt_masuk_at);
  // "Masuk antrian" = dikoreksi di Smart, belum di APKT.
  // "Tidak perlu koreksi" = tanpa waktu response/recovery (Dibatalkan, Pemadaman
  // meluas, …) — bukan pekerjaan koreksi, jadi bukan penyebut progres.
  const { corrected, antrian, tidakPerlu, belum } = useMemo(() => {
    const n = { sudah: 0, antrian: 0, tidak: 0, belum: 0 };
    for (const r of rows) n[statusKoreksi(r, koreksiMap.get(String(r.no_laporan ?? "")), aturan).status]++;
    return { corrected: n.sudah, antrian: n.antrian, tidakPerlu: n.tidak, belum: n.belum };
  }, [rows, koreksiMap, aturan]);
  const perlu = Math.max(0, total - tidakPerlu);
  const pct = perlu > 0 ? Math.round((corrected / perlu) * 100) : 0;

  // Rata-rata SEBELUM (asli) vs SESUDAH (koreksi bila sudah di APKT, asli bila
  // belum/masih antrian), atas seluruh laporan Non CT yang punya nilai waktu (asli > 0).
  const stat = useMemo(() => {
    function calc(detikKey: "durasi_response_time" | "durasi_recovery_time", korKey: "rpt_koreksi" | "rct_koreksi") {
      let n = 0, before = 0, after = 0;
      for (const r of rows) {
        const kor = koreksiMap.get(String(r.no_laporan ?? ""));
        // Asli yang dibekukan saat koreksi dibuat menang atas baris laporan:
        // unduhan sesudah APKT menyetujui koreksi sudah berisi waktu terkoreksi.
        const beku = Number(kor?.[detikKey === "durasi_response_time" ? "rpt_asli" : "rct_asli"]);
        const asliMin = beku > 0 ? beku : (Number(r[detikKey]) || 0) / 60; // detik → menit
        if (asliMin <= 0) continue;
        n++;
        before += asliMin;
        const korVal = kor?.apkt_masuk_at ? Number(kor[korKey]) : NaN;
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
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <StatTile label="Total Non CT" value={total} icon={ListChecks} hint="laporan" />
        <StatTile
          label="Sudah dikoreksi"
          value={corrected}
          tone="green"
          icon={CheckCircle2}
          hint={`${pct}% · tersimpan di APKT`}
        />
        <StatTile
          label="Masuk antrian"
          value={antrian}
          tone={antrian > 0 ? "attention" : "green"}
          icon={ClipboardList}
          hint="dikoreksi di Smart, belum di APKT"
        />
        <StatTile
          label="Belum dikoreksi"
          value={belum}
          tone={belum > 0 ? "attention" : "green"}
          icon={PencilLine}
          hint="laporan"
        />
        <StatTile
          label="Tidak perlu koreksi"
          value={tidakPerlu}
          icon={Ban}
          hint="tanpa waktu, waktu asli sudah lebih cepat, atau RPT di bawah batas"
        />
        <StatTile label="Progres" value={`${pct}%`} hint={`sudah dikoreksi dari ${perlu} yang perlu koreksi`} />
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
              <thead className="kepala-kit sticky top-0 z-10">
                <tr>
                  {["#", "No Laporan", "Status", "RPT Asli", "RPT Koreksi", "RCT Asli", "RCT Koreksi", "Korektor", "Tgl Koreksi"].map((h) => (
                    <th key={h} className={TH}><IkonKolom teks={h} />{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {halamanIni.map((k, i) => (
                  <tr key={k.no_laporan} className="border-t border-line hover:bg-surface transition-colors">
                    <td className="py-2 px-2 text-ink-muted text-right tabular-nums">{(halamanAman - 1) * PER_HALAMAN + i + 1}</td>
                    <td className="py-2 px-2 font-mono text-ink whitespace-nowrap">{k.no_laporan}</td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      {k.apkt_masuk_at
                        ? <span className="text-green-700 font-semibold">Sudah dikoreksi</span>
                        : <span className="text-attention font-semibold">Masuk antrian</span>}
                    </td>
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
        <span className="ml-auto text-[10px] text-ink-muted">{n} laporan · {corrected} sudah dikoreksi</span>
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
