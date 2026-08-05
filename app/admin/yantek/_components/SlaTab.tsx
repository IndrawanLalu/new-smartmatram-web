"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronRight, Settings2, Timer, TriangleAlert } from "lucide-react";
import StatTile from "@/app/admin/_components/StatTile";
import { BTN_GHOST, CARD, EYEBROW } from "@/app/admin/_ui";
import {
  buildDurasiPerPetugas, durasiSah, hariDalamBulan, median, medianPerHari, rata,
  type YantekRow,
} from "../_lib/yantek";
import type { SlaAktif } from "../_hooks/useYantekSla";
import { WARNA_RECOVERY, WARNA_RESPONSE, type SlaPoint } from "./SlaChart";
import PetugasDetailModal from "./PetugasDetailModal";

const SlaChart = dynamic(() => import("./SlaChart"), {
  ssr: false,
  loading: () => <div className={`${CARD} h-full min-h-[280px] animate-pulse`} />,
});

interface SlaTabProps {
  /** Baris bulan yang sedang dilihat (sudah tersaring ULP). */
  rows: YantekRow[];
  /** Baris bulan sebelumnya — hanya untuk garis pembanding. */
  rowsLalu: YantekRow[];
  /** "YYYY-MM" bulan yang sedang dilihat. */
  bulanKey: string;
  sla: SlaAktif;
  bisaAtur: boolean;
  onAturSla: () => void;
}

interface Pelanggar {
  nama: string;
  totalWo: number;
  lewatResponse: number;
  lewatRecovery: number;
  medianResponse: number;
  medianRecovery: number;
  hariAktif: number;
  rataPerHari: number;
  /** Seluruh WO petugas ini — modal detail memerlukannya utuh, bukan hanya
   *  yang melanggar, supaya angkanya bisa dilihat dalam konteks. */
  rows: YantekRow[];
}

const SUMBER_LABEL: Record<SlaAktif["sumber"], string> = {
  ulp: "khusus ULP ini",
  all: "default semua ULP",
  default: "bawaan aplikasi — belum diatur",
};

const pctStr = (n: number) => `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
const mnt = (n: number) => `${Math.round(n)} mnt`;

export default function SlaTab({
  rows, rowsLalu, bulanKey, sla, bisaAtur, onAturSla,
}: SlaTabProps) {
  const [terbuka, setTerbuka] = useState<string | null>(null);

  const jumlahHari = hariDalamBulan(bulanKey);

  const resp = useMemo(() => durasiSah(rows, "durasi_menit_response"), [rows]);
  const reco = useMemo(() => durasiSah(rows, "durasi_menit_recovery"), [rows]);

  const patuhResponse = resp.length ? (resp.filter((v) => v <= sla.response).length / resp.length) * 100 : 0;
  const patuhRecovery = reco.length ? (reco.filter((v) => v <= sla.recovery).length / reco.length) * 100 : 0;

  const dataResponse = useMemo<SlaPoint[]>(() => {
    const kini = medianPerHari(rows, "durasi_menit_response", jumlahHari);
    const lalu = medianPerHari(rowsLalu, "durasi_menit_response", 31);
    return Array.from({ length: jumlahHari }, (_, i) => ({
      label: String(i + 1),
      nilai: kini.get(i + 1) ?? null,
      nilaiLalu: lalu.get(i + 1) ?? null,
      jumlahWo: 0,
    }));
  }, [rows, rowsLalu, jumlahHari]);

  const dataRecovery = useMemo<SlaPoint[]>(() => {
    const kini = medianPerHari(rows, "durasi_menit_recovery", jumlahHari);
    const lalu = medianPerHari(rowsLalu, "durasi_menit_recovery", 31);
    return Array.from({ length: jumlahHari }, (_, i) => ({
      label: String(i + 1),
      nilai: kini.get(i + 1) ?? null,
      nilaiLalu: lalu.get(i + 1) ?? null,
      jumlahWo: 0,
    }));
  }, [rows, rowsLalu, jumlahHari]);

  /** Petugas yang punya minimal satu WO melewati ambang. Yang bersih tidak
   *  ditampilkan — daftar ini alat tindak lanjut, bukan peringkat. */
  const pelanggar = useMemo<Pelanggar[]>(() => {
    const durasi = buildDurasiPerPetugas(rows, sla);
    return [...durasi.entries()]
      .map(([nama, d]) => ({
        nama,
        totalWo: d.rows.length,
        lewatResponse: d.lewatRpt,
        lewatRecovery: d.lewatRct,
        medianResponse: d.medRpt,
        medianRecovery: d.medRct,
        hariAktif: d.hariAktif,
        rataPerHari: d.rataPerHari,
        rows: d.rows,
      }))
      .filter((p) => p.lewatResponse > 0 || p.lewatRecovery > 0)
      .sort((a, b) => (b.lewatResponse + b.lewatRecovery) - (a.lewatResponse + a.lewatRecovery));
  }, [rows, sla]);

  return (
    <div className="space-y-3">
      {/* Ambang berlaku + tombol atur */}
      <div className={`${CARD} px-4 py-3 flex flex-wrap items-center gap-3`}>
        <Timer size={15} className="text-navy-600 shrink-0" />
        <div className="min-w-0">
          <p className={EYEBROW}>Ambang SLA berlaku</p>
          <p className="text-sm text-ink">
            Response <b>{sla.response} mnt</b> · Recovery <b>{sla.recovery} mnt</b>
            <span className="text-ink-muted font-normal"> — {SUMBER_LABEL[sla.sumber]}</span>
          </p>
        </div>
        <div className="flex-1" />
        {bisaAtur && (
          <button onClick={onAturSla} className={BTN_GHOST}>
            <Settings2 size={14} /> Atur SLA
          </button>
        )}
      </div>

      {/* KPI */}
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Median Response"
          value={mnt(median(resp))}
          tone={median(resp) <= sla.response ? "green" : "attention"}
          hint={`rata-rata ${mnt(rata(resp))}`}
        />
        <StatTile
          label="Memenuhi SLA Response"
          value={pctStr(patuhResponse)}
          tone={patuhResponse >= 80 ? "green" : "attention"}
          hint={`${resp.filter((v) => v <= sla.response).length} dari ${resp.length} WO`}
        />
        <StatTile
          label="Median Recovery"
          value={mnt(median(reco))}
          tone={median(reco) <= sla.recovery ? "green" : "attention"}
          hint={`rata-rata ${mnt(rata(reco))}`}
        />
        <StatTile
          label="Memenuhi SLA Recovery"
          value={pctStr(patuhRecovery)}
          tone={patuhRecovery >= 80 ? "green" : "attention"}
          hint={`${reco.filter((v) => v <= sla.recovery).length} dari ${reco.length} WO`}
        />
      </div>

      {/* Grafik */}
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
        <SlaChart judul="Response Time" data={dataResponse} target={sla.response} warna={WARNA_RESPONSE} hatchId="arsirResp" />
        <SlaChart judul="Recovery Time" data={dataRecovery} target={sla.recovery} warna={WARNA_RECOVERY} hatchId="arsirReco" />
      </div>

      {/* Pelanggar */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
          <TriangleAlert size={14} className="text-attention" />
          <p className="text-xs font-semibold text-ink">Petugas dengan WO Melewati SLA</p>
          <span className="text-xs text-ink-muted ml-auto">
            {pelanggar.length} petugas · WO/Hari dihitung per hari bertugas masing-masing
          </span>
        </div>

        {pelanggar.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-ink-muted">
            <Timer className="w-9 h-9 opacity-25" />
            <p className="text-sm">Tidak ada WO yang melewati ambang pada bulan ini</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {["#", "Nama Petugas", "Total WO", "WO/Hari", "Lewat Response", "Lewat Recovery", "Median Resp", "Median Reco", ""].map((h, i) => (
                    <th
                      key={i}
                      title={h === "WO/Hari" ? "Rata-rata gangguan per hari BERTUGAS petugas itu sendiri, bukan per hari kalender" : undefined}
                      className={`py-2.5 px-3 bg-navy-50 text-navy-600 font-semibold border-b border-line whitespace-nowrap ${i >= 2 && i <= 7 ? "text-center" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pelanggar.map((p, i) => {
                  return (
                    <tr
                      key={p.nama}
                      onClick={() => setTerbuka(p.nama)}
                      className="border-t border-line hover:bg-surface transition-colors cursor-pointer"
                    >
                        <td className="py-2.5 px-3 text-ink-muted text-right tabular-nums">{i + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-ink whitespace-nowrap">{p.nama}</td>
                        <td className="py-2.5 px-3 text-center font-mono text-ink">{p.totalWo}</td>
                        <td
                          className="py-2.5 px-3 text-center font-mono text-ink-soft tabular-nums"
                          title={`${p.totalWo} WO dibagi ${p.hariAktif} hari bertugas`}
                        >
                          {p.hariAktif > 0 ? p.rataPerHari.toFixed(1) : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Lencana nilai={p.lewatResponse} total={p.totalWo} />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Lencana nilai={p.lewatRecovery} total={p.totalWo} />
                        </td>
                        <td className={`py-2.5 px-3 text-center font-mono ${p.medianResponse > sla.response ? "text-red-600 font-bold" : "text-ink"}`}>
                          {Math.round(p.medianResponse)}
                        </td>
                        <td className={`py-2.5 px-3 text-center font-mono ${p.medianRecovery > sla.recovery ? "text-red-600 font-bold" : "text-ink"}`}>
                          {Math.round(p.medianRecovery)}
                        </td>
                      <td className="py-2.5 px-3 text-right">
                        <ChevronRight size={13} className="inline text-ink-muted" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {terbuka && (
        <PetugasDetailModal
          nama={terbuka}
          rows={pelanggar.find((p) => p.nama === terbuka)?.rows ?? []}
          sla={sla}
          bulanKey={bulanKey}
          onClose={() => setTerbuka(null)}
        />
      )}
    </div>
  );
}

function Lencana({ nilai, total }: { nilai: number; total: number }) {
  if (nilai === 0) return <span className="text-ink-muted">—</span>;
  const pct = total > 0 ? (nilai / total) * 100 : 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-bold">{nilai}</span>
      <span className="text-[10px] text-ink-muted tabular-nums">{pct.toFixed(0)}%</span>
    </span>
  );
}
