"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, TriangleAlert, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { CARD, FIELD, PANEL_HEAD } from "@/app/admin/_ui";

/**
 * WO per regu satu bulan WO (11 Nov 2026): km di-WO, belum mulai, sedang
 * dikerjakan, menunggu verifikasi, dikembalikan, dan realisasi (diverifikasi).
 * Item & WO yang dibatalkan tidak dihitung.
 */

interface Item { regu: string | null; status: string; panjang_km: number | null }
type Kolom = "wo" | "Dijadwalkan" | "Dalam Proses" | "Selesai" | "Ditolak" | "Diverifikasi";

const KOLOM: { k: Kolom; label: string }[] = [
  { k: "wo", label: "Di-WO" },
  { k: "Dijadwalkan", label: "Belum mulai" },
  { k: "Dalam Proses", label: "Sedang dikerjakan" },
  { k: "Selesai", label: "Menunggu verifikasi" },
  { k: "Ditolak", label: "Dikembalikan" },
  { k: "Diverifikasi", label: "Realisasi" },
];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const TH = "px-3 py-2 text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2 border-b border-line tabular-nums";
const km = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 2 });

interface Jumlah { n: number; km: number }
type Baris = Record<Kolom, Jumlah> & { regu: string };

export default function WoPerRegu({ ulp, tahun }: { ulp: string; tahun: number }) {
  const sekarang = new Date();
  const [bulan, setBulan] = useState(sekarang.getFullYear() === tahun ? sekarang.getMonth() + 1 : 1);
  const [item, setItem] = useState<Item[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    const awal = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
    const akhir = bulan === 12 ? `${tahun + 1}-01-01` : `${tahun}-${String(bulan + 1).padStart(2, "0")}-01`;
    fetchAllRows<Item>(() => {
      let q = supabaseBrowser
        .from("wo_perabasan_item")
        .select("regu,status,panjang_km,wo:wo_perabasan!inner(tgl_wo,status)")
        .neq("status", "Dibatalkan")
        .neq("wo.status", "Dibatalkan")
        .gte("wo.tgl_wo", awal)
        .lt("wo.tgl_wo", akhir)
        .order("id");
      if (ulp !== "SEMUA") q = q.eq("ulp", ulp);
      return q;
    }).then(
      (r) => { if (hidup) { setItem(r); setGalat(null); } },
      (e: Error) => { if (hidup) { setItem([]); setGalat(e.message); } },
    );
    return () => { hidup = false; };
  }, [ulp, tahun, bulan]);

  const baris = useMemo(() => {
    const m = new Map<string, Baris>();
    const kosong = (regu: string): Baris =>
      ({ regu, ...Object.fromEntries(KOLOM.map((c) => [c.k, { n: 0, km: 0 }])) }) as Baris;
    const tambah = (b: Baris, k: Kolom, x: Item) => { b[k].n += 1; b[k].km += Number(x.panjang_km ?? 0); };
    for (const x of item ?? []) {
      const r = x.regu ?? "Belum ada regu";
      const b = m.get(r) ?? kosong(r);
      tambah(b, "wo", x);
      if (KOLOM.some((c) => c.k === x.status)) tambah(b, x.status as Kolom, x);
      m.set(r, b);
    }
    const semua = [...m.values()].sort((a, b) => a.regu.localeCompare(b.regu, "id", { numeric: true }));
    const total = kosong("Total");
    for (const b of semua) for (const c of KOLOM) { total[c.k].n += b[c.k].n; total[c.k].km += b[c.k].km; }
    return { semua, total };
  }, [item]);

  const sel = (j: Jumlah) => (j.n === 0 ? <span className="text-ink-muted">—</span> : <>{km(j.km)} km <span className="text-ink-muted text-[10px]">· {j.n}</span></>);
  const persen = (b: Baris) => (b.wo.km > 0 ? `${Math.round((b.Diverifikasi.km / b.wo.km) * 100)}%` : "—");

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className={PANEL_HEAD}>
        <Users size={14} className="text-white/80" />
        <span className="text-white font-semibold text-xs">WO per regu</span>
        <select value={bulan} onChange={(e) => setBulan(Number(e.target.value))} className={`${FIELD} ml-auto h-7 py-0 text-xs`} aria-label="Bulan WO">
          {BULAN.map((b, i) => <option key={b} value={i + 1}>WO {b} {tahun}</option>)}
        </select>
      </div>
      {galat ? (
        <p className="m-4 flex items-start gap-2 text-sm text-amber-800"><TriangleAlert size={16} className="mt-0.5 shrink-0" /> {galat}</p>
      ) : item === null ? (
        <p className="p-6 flex items-center justify-center gap-2 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat…</p>
      ) : baris.semua.length === 0 ? (
        <p className="p-6 text-center text-sm text-ink-muted">Belum ada WO perabasan {BULAN[bulan - 1]} {tahun}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-surface">
              <tr>
                <th className={`${TH} text-left`}>Regu</th>
                {KOLOM.map((c) => <th key={c.k} className={`${TH} text-right`}>{c.label}</th>)}
                <th className={`${TH} text-right`}>% realisasi</th>
              </tr>
            </thead>
            <tbody>
              {[...baris.semua, baris.total].map((b) => (
                <tr key={b.regu} className={b === baris.total ? "font-semibold bg-surface" : ""}>
                  <td className={`${TD} text-left text-ink whitespace-nowrap`}>{b.regu}</td>
                  {KOLOM.map((c) => <td key={c.k} className={`${TD} text-right whitespace-nowrap ${c.k === "Diverifikasi" ? "text-emerald-700 font-semibold" : ""}`}>{sel(b[c.k])}</td>)}
                  <td className={`${TD} text-right`}>{persen(b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
