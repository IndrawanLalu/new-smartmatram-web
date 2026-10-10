"use client";

import { Fragment, useState } from "react";
import { ChevronRight, Download, Inbox, Loader2 } from "lucide-react";
import { BTN_GHOST, CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW } from "@/app/admin/_ui";
import { UNITS, type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { useRekapData, type BarisRekap, type Kelompok, type TotalRekap } from "../_hooks/useRekapData";

/**
 * Rekap Data — tabel per penyulang, klik untuk membuka per segmen (10 Okt 2026).
 * HANYA dari tiang yang sudah diinspeksi (inspeksi Selesai/Diverifikasi):
 * panjang ketikan impor dan inspeksi yang masih berjalan tidak dihitung.
 */

const fmtKms = (v: number | undefined) =>
  v ? v.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–";
const fmtJml = (v: number | undefined) => (v ? v.toLocaleString("id-ID") : "–");

const TH = "px-2.5 py-2 font-semibold text-center whitespace-nowrap border-l border-white/15";
const TD = "px-2.5 py-2 text-right tabular-nums whitespace-nowrap border-l border-line";
const PISAH = "!border-l-2 !border-l-navy-200";

type Sel = Pick<BarisRekap, "kms" | "tiang" | "gardu" | "gardu_kva" | "ukuran" | "jenis" | "jenis_tiang" | "peralatan">;

function SelAngka({ b, kelompok }: { b: Sel; kelompok: Kelompok[] }) {
  return (
    <>
      <td className={`${TD} ${PISAH} font-bold text-navy-700`}>{fmtKms(b.kms)}</td>
      <td className={TD}>{fmtJml(b.tiang)}</td>
      {kelompok.map((k) =>
        k.kolom.map((c, i) => (
          <td key={`${k.kunci}-${c.kode}`} className={`${TD} ${i === 0 ? PISAH : ""} ${b[k.kunci][c.kode] ? "" : "text-ink-muted/50"}`}>
            {k.satuan === "kms" ? fmtKms(b[k.kunci][c.kode]) : fmtJml(b[k.kunci][c.kode])}
          </td>
        )),
      )}
      <td className={`${TD} ${PISAH}`}>{fmtJml(b.gardu)}</td>
      <td className={TD}>{fmtJml(b.gardu_kva)}</td>
    </>
  );
}

export default function RekapData({ user }: { user: CurrentUser }) {
  const bolehSemua = canSeeAllUnits(user.role);
  const [ulp, setUlp] = useState(bolehSemua ? "" : (user.unit ?? ""));
  const { penyulang, kelompok, total, loading, galat } = useRekapData(ulp);
  const [buka, setBuka] = useState<Set<string>>(new Set());
  const [mengunduh, setMengunduh] = useState(false);

  const kunci = (p: BarisRekap) => `${p.ulp}|${p.penyulang}`;
  const semuaTerbuka = penyulang.length > 0 && penyulang.every((p) => buka.has(kunci(p)));
  const alih = (k: string) =>
    setBuka((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const unduh = async () => {
    setMengunduh(true);
    try {
      const { unduhRekapData } = await import("../_lib/rekapDataExcel");
      await unduhRekapData(penyulang, kelompok, total, ulp || "Semua ULP");
    } finally {
      setMengunduh(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Rekap data JTM</p>
        <p className="text-xs text-ink-soft mt-1 max-w-3xl">
          Hanya dari tiang yang <b>sudah diinspeksi</b> (inspeksi Selesai atau Diverifikasi). Panjang ketikan dari impor dan
          inspeksi yang masih berjalan tidak dihitung. Klik penyulang untuk melihat per segmen.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {bolehSemua &&
            [{ value: "", label: "Semua ULP" }, ...UNITS].map((u) => (
              <button key={u.value || "semua"} onClick={() => setUlp(u.value)} className={`${CHIP} ${ulp === u.value ? CHIP_ON : CHIP_OFF}`}>
                {u.label}
              </button>
            ))}
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setBuka(semuaTerbuka ? new Set() : new Set(penyulang.map(kunci)))}
              disabled={!penyulang.length}
              className={BTN_GHOST}
            >
              {semuaTerbuka ? "Tutup semua" : "Buka semua segmen"}
            </button>
            <button onClick={() => void unduh()} disabled={!penyulang.length || mengunduh} className={BTN_GHOST}>
              {mengunduh ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Unduh Excel
            </button>
          </div>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-ink-soft text-sm">
            <Loader2 size={18} className="animate-spin" /> Menghitung rekap…
          </div>
        ) : galat ? (
          <p className="p-5 text-sm text-red-600">{galat}</p>
        ) : !penyulang.length ? (
          <div className="flex flex-col items-center py-16 gap-2 text-ink-muted text-sm">
            <Inbox size={22} /> Belum ada inspeksi JTM yang selesai{ulp ? ` di ${ulp}` : ""}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] text-ink">
              <thead>
                <tr className="bg-navy-600 text-white">
                  <th rowSpan={2} className={`${TH} text-left sticky left-0 z-10 bg-navy-600 min-w-[240px] !border-l-0`}>Penyulang / segmen</th>
                  <th rowSpan={2} className={TH}>ULP</th>
                  <th rowSpan={2} className={`${TH} ${PISAH}`}>kms</th>
                  <th rowSpan={2} className={TH}>Tiang</th>
                  {kelompok.map((k) => (
                    <th key={k.kunci} colSpan={k.kolom.length} className={`${TH} ${PISAH} border-b border-white/20`}>{k.judul}</th>
                  ))}
                  <th colSpan={2} className={`${TH} ${PISAH} border-b border-white/20`}>Gardu</th>
                </tr>
                <tr className="bg-navy-50 text-navy-700 border-b border-navy-100">
                  {kelompok.map((k) =>
                    k.kolom.map((c, i) => (
                      <th key={`${k.kunci}-${c.kode}`} className={`${TH} !border-l-navy-100 ${i === 0 ? PISAH : ""}`}>{c.label}</th>
                    )),
                  )}
                  <th className={`${TH} ${PISAH}`}>Jumlah</th>
                  <th className={`${TH} !border-l-navy-100`}>kVA</th>
                </tr>
              </thead>
              <tbody>
                {penyulang.map((p) => {
                  const k = kunci(p);
                  const terbuka = buka.has(k);
                  return (
                    <Fragment key={k}>
                      <tr onClick={() => alih(k)} className={`border-b border-line cursor-pointer font-medium ${terbuka ? "bg-navy-50/60" : "bg-white hover:bg-navy-50/40"}`}>
                        <td className={`px-2.5 py-2 font-semibold text-ink sticky left-0 ${terbuka ? "bg-navy-50" : "bg-white"}`}>
                          <span className="inline-flex items-center gap-1">
                            <ChevronRight size={14} className={`text-ink-muted transition-transform ${terbuka ? "rotate-90" : ""}`} />
                            {p.penyulang}
                            <span className="text-ink-soft font-normal text-xs">· {p.segmenDaftar.length} segmen</span>
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-ink border-l border-line">{p.ulp}</td>
                        <SelAngka b={p} kelompok={kelompok} />
                      </tr>
                      {terbuka &&
                        p.segmenDaftar.map((s) => (
                          <tr key={s.segmen_id} className="border-b border-line bg-white text-ink">
                            <td className="pl-8 pr-2.5 py-2 sticky left-0 bg-white max-w-[340px] truncate text-ink" title={s.segmen ?? ""}>
                              └ {s.segmen}
                            </td>
                            <td className="border-l border-line" />
                            <SelAngka b={s} kelompok={kelompok} />
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <BarisTotal total={total} kelompok={kelompok} />
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BarisTotal({ total, kelompok }: { total: TotalRekap; kelompok: Kelompok[] }) {
  return (
    <tr className="bg-navy-50 font-bold text-navy-800 border-t-2 border-navy-200">
      <td className="px-2.5 py-2.5 sticky left-0 bg-navy-50">Jumlah</td>
      <td className="border-l border-line" />
      <SelAngka b={total} kelompok={kelompok} />
    </tr>
  );
}
