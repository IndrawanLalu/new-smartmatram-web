"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BarChart3, List } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { CHIP, CHIP_OFF, CHIP_ON, EYEBROW } from "@/app/admin/_ui";
import type { SlaAktif } from "../_hooks/useYantekSla";
import {
  durasiSah, hariDalamBulan, jumlahHariBerdata, jumlahPerHari, median, medianPerHari,
  type YantekRow,
} from "../_lib/yantek";
import type { PetugasChartPoint } from "./PetugasChart";

const PetugasChart = dynamic(() => import("./PetugasChart"), {
  ssr: false,
  loading: () => <div className="h-[280px] rounded-xl bg-surface animate-pulse" />,
});

interface PetugasDetailModalProps {
  nama: string;
  rows: YantekRow[];
  sla: SlaAktif;
  /** "YYYY-MM" — menentukan panjang sumbu tanggal pada grafik. */
  bulanKey: string;
  /** Saringan awal daftar WO. Dari tabel pelanggar yang dicari memang WO yang
   *  melanggar; dari papan juara justru sebaliknya — membuka profil pemenang
   *  langsung pada daftar pelanggarannya terbaca seperti tuduhan. */
  awalHanyaLanggar?: boolean;
  onClose: () => void;
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? String(Math.round(v)) : "—";

export default function PetugasDetailModal({
  nama, rows, sla, bulanKey, awalHanyaLanggar = true, onClose,
}: PetugasDetailModalProps) {
  const [tab, setTab] = useState<"detail" | "grafik">("detail");
  // Seluruh WO selalu bisa dilihat lewat chip di atas tabel — saringan awal ini
  // hanya menentukan mana yang tampil lebih dulu.
  const [hanyaLanggar, setHanyaLanggar] = useState(awalHanyaLanggar);

  const jumlahHari = bulanKey ? hariDalamBulan(bulanKey) : 31;

  /** Grafik memakai SELURUH gangguan petugas ini, bukan hanya yang melanggar —
   *  bentuk beban hariannya baru terlihat kalau semuanya ikut digambar. */
  const chart = useMemo<PetugasChartPoint[]>(() => {
    const jml = jumlahPerHari(rows, jumlahHari);
    const rpt = medianPerHari(rows, "durasi_menit_response", jumlahHari);
    const rct = medianPerHari(rows, "durasi_menit_recovery", jumlahHari);
    return Array.from({ length: jumlahHari }, (_, i) => ({
      label: String(i + 1),
      jumlah: jml.get(i + 1) ?? 0,
      rpt: rpt.get(i + 1) ?? null,
      rct: rct.get(i + 1) ?? null,
    }));
  }, [rows, jumlahHari]);

  const ringkas = useMemo(() => {
    const hariAktif = jumlahHariBerdata(rows);
    return {
      hariAktif,
      rataPerHari: hariAktif > 0 ? rows.length / hariAktif : 0,
      medRpt: median(durasiSah(rows, "durasi_menit_response")),
      medRct: median(durasiSah(rows, "durasi_menit_recovery")),
      terbanyak: Math.max(0, ...chart.map((c) => c.jumlah)),
    };
  }, [rows, chart]);

  const dinilai = useMemo(
    () =>
      rows.map((r) => {
        const rpt = typeof r.durasi_menit_response === "number" ? r.durasi_menit_response : null;
        const rct = typeof r.durasi_menit_recovery === "number" ? r.durasi_menit_recovery : null;
        return {
          row: r,
          rpt,
          rct,
          langgarRpt: rpt !== null && rpt > sla.response,
          langgarRct: rct !== null && rct > sla.recovery,
        };
      }),
    [rows, sla],
  );

  const tampil = useMemo(() => {
    const dasar = hanyaLanggar ? dinilai.filter((d) => d.langgarRpt || d.langgarRct) : dinilai;
    // Pelanggaran terparah di atas — yang perlu ditindak lebih dulu.
    return [...dasar].sort((a, b) => (b.rpt ?? 0) - (a.rpt ?? 0));
  }, [dinilai, hanyaLanggar]);

  const jmlLanggar = dinilai.filter((d) => d.langgarRpt || d.langgarRct).length;

  return (
    <ModalShell
      onClose={onClose}
      title={nama}
      subtitle={`${rows.length} WO · ${jmlLanggar} melewati SLA · ambang ${sla.response}/${sla.recovery} mnt`}
      maxWidth="max-w-5xl"
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setTab("detail")} className={`${CHIP} ${tab === "detail" ? CHIP_ON : CHIP_OFF}`}>
            <List className="w-3.5 h-3.5" /> Detail Gangguan
          </button>
          <button onClick={() => setTab("grafik")} className={`${CHIP} ${tab === "grafik" ? CHIP_ON : CHIP_OFF}`}>
            <BarChart3 className="w-3.5 h-3.5" /> Grafik Harian
          </button>
          <span className={`${EYEBROW} ml-auto`}>RPT / RCT dalam menit</span>
        </div>

        {tab === "grafik" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Ringkas label="Total gangguan" nilai={String(rows.length)} />
              <Ringkas label="Hari ada gangguan" nilai={`${ringkas.hariAktif} hari`} />
              <Ringkas label="Rata-rata / hari" nilai={ringkas.rataPerHari.toFixed(1)} tebal />
              <Ringkas
                label="Median RPT"
                nilai={`${Math.round(ringkas.medRpt)} mnt`}
                merah={ringkas.medRpt > sla.response}
              />
              <Ringkas
                label="Median RCT"
                nilai={`${Math.round(ringkas.medRct)} mnt`}
                merah={ringkas.medRct > sla.recovery}
              />
            </div>

            <div className="rounded-xl border border-line p-2">
              <PetugasChart
                data={chart}
                slaResponse={sla.response}
                slaRecovery={sla.recovery}
                rataGangguan={ringkas.rataPerHari}
              />
            </div>

            <p className="text-[11px] text-ink-muted">
              Batang = jumlah gangguan (sumbu kiri) · garis = median RPT dan RCT (sumbu kanan, menit).
              Garis putus-putus abu = rata-rata gangguan harian; dua garis tipis berwarna = ambang SLA.
              Rata-rata dibagi <b>{ringkas.hariAktif} hari yang benar-benar ada gangguannya</b>, bukan
              seluruh hari kalender.
            </p>
          </>
        )}

        {tab === "detail" && (
        <>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setHanyaLanggar(true)}
            className={`${CHIP} ${hanyaLanggar ? CHIP_ON : CHIP_OFF}`}
          >
            Lewat SLA ({jmlLanggar})
          </button>
          <button
            onClick={() => setHanyaLanggar(false)}
            className={`${CHIP} ${!hanyaLanggar ? CHIP_ON : CHIP_OFF}`}
          >
            Semua WO ({rows.length})
          </button>
        </div>

        <div className="overflow-auto max-h-[55vh] rounded-xl border border-line">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                {[
                  ["#", "text-right w-10"],
                  ["No Gangguan", "text-left"],
                  ["Waktu Lapor", "text-left"],
                  ["RPT", "text-center w-16"],
                  ["RCT", "text-center w-16"],
                  ["Tindakan", "text-left"],
                ].map(([h, cls]) => (
                  <th
                    key={h}
                    className={`py-2 px-3 bg-navy-50 text-navy-600 font-semibold border-b border-line whitespace-nowrap ${cls}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tampil.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-ink-muted">
                    Tidak ada WO yang melewati ambang SLA
                  </td>
                </tr>
              ) : (
                tampil.map((d, i) => (
                  <tr key={`${d.row.no_laporan}-${i}`} className="border-t border-line hover:bg-surface transition-colors">
                    <td className="py-2 px-3 text-right text-ink-muted tabular-nums">{i + 1}</td>
                    <td className="py-2 px-3 font-mono text-ink whitespace-nowrap">{d.row.no_laporan ?? "—"}</td>
                    <td className="py-2 px-3 text-ink-soft whitespace-nowrap">{d.row.waktu_lapor ?? "—"}</td>
                    <td className={`py-2 px-3 text-center font-mono tabular-nums ${d.langgarRpt ? "text-red-600 font-bold" : "text-ink"}`}>
                      {num(d.rpt)}
                    </td>
                    <td className={`py-2 px-3 text-center font-mono tabular-nums ${d.langgarRct ? "text-red-600 font-bold" : "text-ink"}`}>
                      {num(d.rct)}
                    </td>
                    <td className="py-2 px-3 text-ink">{d.row.tindakan ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>
    </ModalShell>
  );
}

function Ringkas({ label, nilai, tebal, merah }: {
  label: string; nilai: string; tebal?: boolean; merah?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink-muted truncate">{label}</p>
      <p className={`text-sm ${tebal ? "font-bold" : "font-semibold"} ${merah ? "text-red-600" : "text-ink"}`}>
        {nilai}
      </p>
    </div>
  );
}
