"use client";

import { useMemo, useState } from "react";
import { Ban, ChevronLeft, ChevronRight, MapPin, Search } from "lucide-react";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
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

interface Props {
  rows: BarisWoHar[];
  bolehKelola: boolean;
  onKeluarkan: (itemId: string[], alasan: string) => Promise<{ keluar: number; dilewati: { objek: string; sebab: string }[] }>;
}

/**
 * Baris WO Pemeliharaan bulan terpilih — status diturunkan dari pemeliharaannya.
 * Centang = keluarkan beberapa gardu dari WO sekaligus; hanya yang BELUM
 * dikerjakan (`wo-batal-semua.sql`).
 */
export default function TabelWoHar({ rows, bolehKelola, onKeluarkan }: Props) {
  const toast = useToast();
  const [status, setStatus] = useState<"SEMUA" | StatusWoHar>("SEMUA");
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [keluarkan, setKeluarkan] = useState(false);
  const bisaPilih = (r: BarisWoHar) => bolehKelola && statusWo(r) === "Belum dikerjakan";
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
  const dipilih = rows.filter((r) => pilih.has(r.id) && bisaPilih(r));
  const bisaDiHal = tampil.filter(bisaPilih).map((r) => r.id);
  const semuaHal = bisaDiHal.length > 0 && bisaDiHal.every((id) => pilih.has(id));
  const ubahPilih = (id: string[], aktif: boolean) =>
    setPilih((p) => {
      const n = new Set(p);
      for (const x of id) {
        if (aktif) n.add(x);
        else n.delete(x);
      }
      return n;
    });

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

      {dipilih.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy-200 bg-navy-50/60 px-4 py-2.5 text-sm">
          <span className="text-ink"><b className="tabular-nums">{dipilih.length}</b> gardu dipilih</span>
          <button onClick={() => setPilih(new Set())} className="text-xs text-ink-soft hover:text-ink">Batal pilih</button>
          <button onClick={() => setKeluarkan(true)} className={`${BTN_GHOST} ml-auto text-red-700`}>
            <Ban size={14} /> Keluarkan dari WO ({dipilih.length})
          </button>
        </div>
      )}

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
                  {bolehKelola && (
                    <th className={`${TH} w-8`}>
                      <input
                        type="checkbox"
                        checked={semuaHal}
                        disabled={bisaDiHal.length === 0}
                        onChange={() => ubahPilih(bisaDiHal, !semuaHal)}
                        className="accent-navy-600"
                        aria-label="Pilih semua gardu di halaman ini yang belum dikerjakan"
                      />
                    </th>
                  )}
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
                    <tr key={r.id} className={pilih.has(r.id) ? "bg-navy-50/70" : "hover:bg-navy-50/40"}>
                      {bolehKelola && (
                        <td className={TD}>
                          {bisaPilih(r) && (
                            <input
                              type="checkbox"
                              checked={pilih.has(r.id)}
                              onChange={(e) => ubahPilih([r.id], e.target.checked)}
                              className="accent-navy-600"
                              aria-label={`Pilih ${r.gardu_kode}`}
                            />
                          )}
                        </td>
                      )}
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

      {keluarkan && (
        <BatalkanModal
          judul={`Keluarkan ${dipilih.length} gardu dari WO?`}
          keterangan="Gardu keluar dari WO dan dari HP regu HARGAR, dan tidak dihitung di rekap. Barisnya tersimpan di arsip pembatalan beserta alasannya. Yang ternyata sudah dikerjakan dilewati."
          labelTombol="Keluarkan"
          onTutup={() => setKeluarkan(false)}
          onBatalkan={async (alasan) => {
            try {
              const h = await onKeluarkan(dipilih.map((r) => r.id), alasan);
              if (h.keluar > 0) toast.success(`${h.keluar} gardu dikeluarkan dari WO.`);
              if (h.dilewati.length > 0) toast.error(`${h.dilewati.length} dilewati — ${h.dilewati.map((d) => `${d.objek}: ${d.sebab}`).join(" · ")}`);
              setPilih(new Set());
              return true;
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal.");
              return false;
            }
          }}
        />
      )}
    </div>
  );
}
