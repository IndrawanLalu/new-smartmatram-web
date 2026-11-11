"use client";

import { Fragment, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, Loader2, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useToast } from "@/app/admin/_components/Toast";
import { CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD, PANEL_HEAD } from "@/app/admin/_ui";
import { useKalenderPerabasan, type PenyulangKalender, type SegmenKalender } from "../_hooks/useKalenderPerabasan";

/**
 * Kalender rabas per penyulang (11 Nov 2026): bulan apa penyulang/segmen itu
 * dirabas, supaya admin tidak lupa me-WO-kan penyulang. Sel penyulang = % km
 * yang dirabas bulan itu — dirabas sebagian segmen terlihat dari angkanya;
 * klik penyulang untuk melihat segmennya.
 */

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const TH = "px-2 py-2 text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-2 py-1.5 border-b border-line";

const tglPendek = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" }) : "Belum tercatat";
const km = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 2 });

/** Warna sel menurut % km dirabas — angka tetap ditulis, warna bukan satu-satunya pembawa arti. */
const nadaPersen = (p: number) =>
  p >= 100 ? "bg-emerald-600 text-white" : p >= 50 ? "bg-emerald-300 text-emerald-950" : "bg-emerald-100 text-emerald-900";

function SelPenyulang({ persen, adaWo }: { persen: number; adaWo: boolean }) {
  if (persen > 0) {
    return (
      <span className={`inline-flex min-w-9 justify-center rounded px-1 py-0.5 text-[11px] font-semibold tabular-nums ${nadaPersen(persen)} ${adaWo ? "ring-1 ring-amber-500" : ""}`}>
        {persen}%
      </span>
    );
  }
  return adaWo ? <span className="inline-flex min-w-9 justify-center rounded px-1 py-0.5 text-[10px] font-semibold border border-amber-500 text-amber-700">WO</span> : null;
}

function SelSegmen({ s, bulan }: { s: SegmenKalender; bulan: number }) {
  if (s.rabas.includes(bulan)) return <span className="inline-flex min-w-9 justify-center rounded px-1 py-0.5 text-[11px] font-semibold bg-emerald-600 text-white">✓</span>;
  if (s.wo.includes(bulan)) return <span className="inline-flex min-w-9 justify-center rounded px-1 py-0.5 text-[10px] font-semibold border border-amber-500 text-amber-700">WO</span>;
  return null;
}

export default function KalenderPerabasan({ ulp, tahun }: { ulp: string; tahun: number }) {
  const user = useCurrentUser();
  const toast = useToast();
  const d = useKalenderPerabasan(ulp, tahun);
  const [buka, setBuka] = useState<Set<string>>(new Set());
  const [hanyaUsulan, setHanyaUsulan] = useState(false);

  const namaBulanDepan = d.bulanDepan ? `${BULAN_PANJANG[Number(d.bulanDepan.slice(5, 7)) - 1]} ${d.bulanDepan.slice(0, 4)}` : "bulan depan";
  const daftarUlp = useMemo(() => [...new Set(d.penyulang.map((p) => p.ulp))].sort(), [d.penyulang]);
  const tampil = useMemo(
    () => (hanyaUsulan ? d.penyulang.filter((p) => p.usulanSegmen > 0).sort((a, b) => b.usulanKm - a.usulanKm) : d.penyulang),
    [d.penyulang, hanyaUsulan],
  );
  const totalUsulan = useMemo(
    () => d.penyulang.reduce((a, p) => ({ km: a.km + p.usulanKm, n: a.n + (p.usulanSegmen > 0 ? 1 : 0) }), { km: 0, n: 0 }),
    [d.penyulang],
  );
  const bolehAtur = (u: string) => user.role === "UP3" || (user.role === "admin" && user.unit?.toUpperCase() === u);

  const ubahSiklus = async (u: string, bulan: number) => {
    try {
      await d.simpanSiklus(u, bulan, user.name ?? user.email ?? "");
      toast.success(`Siklus rabas ${u}: ${bulan} bulan`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan siklus");
    }
  };
  const tukar = (k: string) => setBuka((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className={PANEL_HEAD}>
        <CalendarDays size={14} className="text-white/80" />
        <span className="text-white font-semibold text-xs">Kalender perabasan per penyulang · {tahun}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
        <button onClick={() => setHanyaUsulan(false)} className={`${CHIP} ${!hanyaUsulan ? CHIP_ON : CHIP_OFF}`}>
          Semua penyulang <span className="opacity-70">{d.penyulang.length}</span>
        </button>
        <button onClick={() => setHanyaUsulan(true)} className={`${CHIP} ${hanyaUsulan ? CHIP_ON : CHIP_OFF}`}>
          Usulan WO {namaBulanDepan} <span className="opacity-70">{totalUsulan.n} · {km(totalUsulan.km)} km</span>
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-ink-soft">
          {daftarUlp.map((u) => (
            <label key={u} className="flex items-center gap-1.5">
              Siklus rabas {daftarUlp.length > 1 ? u : ""}
              <select value={d.siklusUlp(u)} disabled={!bolehAtur(u)} onChange={(e) => void ubahSiklus(u, Number(e.target.value))}
                className={`${FIELD} h-8 py-0 disabled:opacity-60`} aria-label={`Siklus rabas ${u}`}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} bulan</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>
      <p className="px-4 pt-2 text-[11px] text-ink-muted">
        Angka = % km penyulang yang dirabas (diverifikasi) bulan itu. <b className="text-amber-700">WO</b> = di-WO-kan, belum diverifikasi.
        Usulan = segmen yang sudah lewat siklus rabas, tidak sedang di-WO, dan tidak dalam masa garansi. Klik penyulang untuk melihat segmennya.
      </p>

      {d.galat ? (
        <p className="m-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" /> Kalender gagal dimuat: {d.galat}
        </p>
      ) : d.loading ? (
        <p className="p-8 flex items-center justify-center gap-2 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" /> Memuat kalender…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-surface">
              <tr>
                <th className={`${TH} text-left`}>Penyulang</th>
                <th className={`${TH} text-right`}>Segmen · km</th>
                {BULAN.map((b) => <th key={b} className={`${TH} text-center`}>{b}</th>)}
                <th className={`${TH} text-left`}>Terakhir dirabas</th>
                <th className={`${TH} text-right`}>Usulan {namaBulanDepan.split(" ")[0]}</th>
              </tr>
            </thead>
            <tbody>
              {tampil.map((p) => (
                <BarisPenyulang key={p.kunci} p={p} terbuka={buka.has(p.kunci)} onTukar={() => tukar(p.kunci)} tampilUlp={daftarUlp.length > 1} />
              ))}
              {tampil.length === 0 && (
                <tr><td colSpan={16} className="p-8 text-center text-ink-muted">{hanyaUsulan ? `Tidak ada penyulang yang perlu di-WO-kan ${namaBulanDepan}.` : "Tidak ada segmen aktif."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BarisPenyulang({ p, terbuka, onTukar, tampilUlp }: { p: PenyulangKalender; terbuka: boolean; onTukar: () => void; tampilUlp: boolean }) {
  const Panah = terbuka ? ChevronDown : ChevronRight;
  return (
    <Fragment>
      <tr onClick={onTukar} className="cursor-pointer hover:bg-navy-50/50">
        <td className={`${TD} font-semibold text-ink whitespace-nowrap`}>
          <Panah size={13} className="inline -mt-0.5 mr-1 text-ink-muted" />
          {p.penyulang}
          {tampilUlp && <span className="ml-1.5 text-[10px] font-normal text-ink-muted">{p.ulp}</span>}
        </td>
        <td className={`${TD} text-right text-ink-soft whitespace-nowrap tabular-nums`}>{p.segmen.length} · {km(p.km)}</td>
        {p.persen.map((x, i) => <td key={i} className={`${TD} text-center`}><SelPenyulang persen={x} adaWo={p.adaWo[i]} /></td>)}
        <td className={`${TD} whitespace-nowrap text-ink-soft`}>{tglPendek(p.terakhir)}</td>
        <td className={`${TD} text-right whitespace-nowrap tabular-nums ${p.usulanSegmen > 0 ? "font-semibold text-attention" : "text-ink-muted"}`}>
          {p.usulanSegmen > 0 ? `${p.usulanSegmen} seg · ${km(p.usulanKm)} km` : "—"}
        </td>
      </tr>
      {terbuka && p.segmen.map((s) => (
        <tr key={s.id} className="bg-surface/60">
          <td className={`${TD} pl-8 text-ink-soft`}>{s.nama}</td>
          <td className={`${TD} text-right text-ink-muted tabular-nums`}>{s.km === null ? "—" : km(s.km)}</td>
          {BULAN.map((_, i) => <td key={i} className={`${TD} text-center`}><SelSegmen s={s} bulan={i + 1} /></td>)}
          <td className={`${TD} whitespace-nowrap text-ink-muted`}>
            {tglPendek(s.terakhir)}{s.terakhir_regu ? ` · ${s.terakhir_regu}` : ""}
          </td>
          <td className={`${TD} text-right whitespace-nowrap`}>
            {s.wo_aktif ? <span className="text-amber-700">Di {s.wo_aktif}</span>
              : s.garansi_sampai ? <span className="text-ink-muted">Garansi s.d. {tglPendek(s.garansi_sampai)}</span>
              : s.usulan ? <span className="font-semibold text-attention">Usulan</span> : <span className="text-ink-muted">—</span>}
          </td>
        </tr>
      ))}
    </Fragment>
  );
}
