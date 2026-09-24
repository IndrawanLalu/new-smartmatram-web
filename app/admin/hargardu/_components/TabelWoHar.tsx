"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Search } from "lucide-react";
import { CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { LABEL_ALASAN } from "../_lib/kandidatWo";
import { STATUS_WO_HAR, statusWo, type BarisWoHar, type StatusWoHar } from "../_hooks/useWoHargardu";

const PAGE_SIZE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";

const NADA: Record<StatusWoHar, string> = {
  "Belum dikerjakan": "bg-slate-100 text-slate-600 border-slate-200",
  "Sedang dikerjakan": "bg-sky-50 text-sky-700 border-sky-200",
  "Menunggu persetujuan": "bg-amber-50 text-amber-700 border-amber-200",
  Disetujui: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (iso: string | null) => {
  if (!iso) return "—";
  const t = new Date(iso);
  return `${t.getDate()} ${BLN[t.getMonth()]} ${t.getFullYear()}`;
};

/** Baris WO Pemeliharaan bulan terpilih — status diturunkan dari pemeliharaannya. */
export default function TabelWoHar({ rows }: { rows: BarisWoHar[] }) {
  const [status, setStatus] = useState<"SEMUA" | StatusWoHar>("SEMUA");
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);

  const dasar = useMemo(() => {
    const k = cari.trim().toUpperCase();
    return k
      ? rows.filter((r) => [r.gardu_kode, r.nama ?? "", r.penyulang ?? "", r.petugas_nama ?? ""].some((v) => v.toUpperCase().includes(k)))
      : rows;
  }, [rows, cari]);
  const hitung = useMemo(() => {
    const h = Object.fromEntries(STATUS_WO_HAR.map((s) => [s, 0])) as Record<StatusWoHar, number>;
    for (const r of dasar) h[statusWo(r)] += 1;
    return h;
  }, [dasar]);
  const baris = status === "SEMUA" ? dasar : dasar.filter((r) => statusWo(r) === status);

  const total = Math.max(1, Math.ceil(baris.length / PAGE_SIZE));
  const hal = Math.min(halaman, total);
  const tampil = baris.slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setStatus("SEMUA"); setHalaman(1); }} className={`${CHIP} ${status === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>Semua</button>
        {STATUS_WO_HAR.map((s) => (
          <button key={s} onClick={() => { setStatus(s); setHalaman(1); }} className={`${CHIP} ${status === s ? CHIP_ON : CHIP_OFF}`}>
            {s} <span className="opacity-70">{hitung[s]}</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={cari}
            onChange={(e) => { setCari(e.target.value); setHalaman(1); }}
            placeholder="Cari gardu / penyulang / petugas"
            className={`${FIELD} w-[240px] pl-8`}
          />
        </div>
      </div>

      {baris.length === 0 ? (
        <div className={`${CARD} p-8 text-center text-sm text-ink-soft`}>
          {rows.length === 0 ? "Belum ada WO terbit untuk bulan ini." : "Tidak ada baris yang cocok."}
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className={`${TH} text-right`}>No</th>
                  <th className={TH}>Gardu</th>
                  <th className={TH}>Penyulang</th>
                  <th className={TH}>Alasan masuk WO</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Tgl dikerjakan</th>
                  <th className={TH}>Petugas</th>
                </tr>
              </thead>
              <tbody>
                {tampil.map((r) => {
                  const s = statusWo(r);
                  return (
                    <tr key={r.id} className="hover:bg-navy-50/40">
                      <td className={`${TD} text-xs text-right tabular-nums text-ink-muted`}>{r.urutan}</td>
                      <td className={TD}>
                        <p className="font-semibold text-ink flex items-center gap-1.5">
                          {r.gardu_kode}
                          {r.lat !== null && r.lng !== null && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-navy-600 hover:text-navy-500"
                              title="Buka titik gardu di Google Maps"
                            >
                              <MapPin size={12} />
                            </a>
                          )}
                        </p>
                        <p className="text-[11px] text-ink-muted max-w-56 truncate">{r.nama ?? "—"} · {r.ulp}</p>
                      </td>
                      <td className={`${TD} text-xs text-ink-soft`}>{r.penyulang ?? "—"}</td>
                      <td className={`${TD} text-xs text-ink-soft`}>
                        {LABEL_ALASAN[r.alasan]}
                        {r.tgl_pelihara_terakhir && (
                          <p className="text-[11px] text-ink-muted">terakhir {tgl(r.tgl_pelihara_terakhir)} · {r.umur_bulan} bln</p>
                        )}
                      </td>
                      <td className={TD}>
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA[s]}`}>{s}</span>
                      </td>
                      <td className={`${TD} text-xs text-ink-soft whitespace-nowrap`}>{tgl(r.tgl_realisasi)}</td>
                      <td className={`${TD} text-xs text-ink-soft`}>{r.petugas_nama ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
            <span>{(hal - 1) * PAGE_SIZE + 1}–{Math.min(hal * PAGE_SIZE, baris.length)} dari {baris.length} gardu</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setHalaman(hal - 1)} disabled={hal <= 1} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman sebelumnya">
                <ChevronLeft size={15} />
              </button>
              <span>{hal} / {total}</span>
              <button onClick={() => setHalaman(hal + 1)} disabled={hal >= total} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman berikutnya">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
