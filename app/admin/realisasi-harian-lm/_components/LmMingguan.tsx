"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Settings2, TriangleAlert } from "lucide-react";
import AturLm4dxModal from "@/app/admin/kinerja-yantek/_components/AturLm4dxModal";
import { barisDesimal, NAMA_MODUL_TINDAKAN, namaSumber, type BarisLm } from "@/app/admin/kinerja-yantek/_lib/lm4dx";
import { BTN_GHOST, CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { hariIniWita } from "@/app/admin/kinerja-yantek/_lib/realisasiHarian";
import { useLmMingguan } from "../_hooks/useLmMingguan";
import { angkaMingguan, barisKosong, persenCapaian, punyaRincian, targetRentang } from "../_lib/barisMingguan";
import { mingguKe, SISTEM_MINGGU, teksRentang } from "../_lib/mingguLm";

/**
 * Tab LM Mingguan (23 Nov 2026): baris total + rincian × M1–M4 (ISO bisa M5),
 * semua status (termasuk belum diverifikasi). Sistem minggu dipilih lewat sakelar — belum ada aturan baku.
 * Baris total ber-SLA diberi target minggu (SLA dibagi per hari) dan % capaian.
 * Baris diatur UP3 & admin lewat "Atur baris" (25 Nov 2026, per ULP).
 */

interface Props {
  ulpAwal: string;
  daftarUlp: string[];
  /** Pengatur daftar baris: UP3 & admin. null = tidak boleh. */
  pengatur: string | null;
}

const TH = "px-2 py-2 text-[11px] font-semibold text-ink-soft border-b border-line";
const TD = "px-2 py-1.5 border-b border-line text-right tabular-nums";

/** Realisasi + (bila ada target) "T 14 · 86%" di bawahnya. */
function Sel({ n, target, desimal }: { n: number; target: number | null; desimal: boolean }) {
  const p = persenCapaian(n, target);
  return (
    <>
      <div>{angkaMingguan(n, desimal)}</div>
      {target !== null && (
        <div className="text-[10px] font-normal">
          <span className="text-ink-muted">T {target.toLocaleString("id-ID", { maximumFractionDigits: 1 })}</span>
          {p && <span className={`ml-1 font-semibold ${n >= target ? "text-emerald-700" : "text-amber-700"}`}>{p}</span>}
        </div>
      )}
    </>
  );
}

export default function LmMingguan({ ulpAwal, daftarUlp, pengatur }: Props) {
  const o = useLmMingguan(ulpAwal);
  const [atur, setAtur] = useState(false);
  const namaKategori = useMemo(() => new Map(o.kategori.map((k) => [k.kode, k.label])), [o.kategori]);
  const namaTindakan = useMemo(
    () => new Map(o.tindakan.map((t) => [t.kode, `${NAMA_MODUL_TINDAKAN[t.modul]} · ${t.nama}`])),
    [o.tindakan],
  );
  /** Desimal bila dirinya atau salah satu rinciannya ber-KMS. */
  const desimal = (b: BarisLm) => barisDesimal(b) || o.baris.some((x) => x.induk === b.id && barisDesimal(x));
  const keterangan = (b: BarisLm) =>
    b.sumber.length
      ? b.sumber.map((s) => namaSumber(s, namaKategori, namaTindakan)).join(" + ")
      : punyaRincian(b, o.baris)
        ? o.baris.filter((x) => x.induk === b.id).map((x) => x.uraian).join(" + ")
        : "belum ada sumber di SMART";
  const ket = SISTEM_MINGGU.find((s) => s.kunci === o.sistem)?.ket;
  const sekarang = mingguKe(o.minggu, hariIniWita());
  /** Baris total yang rinciannya disembunyikan. */
  const [tutup, setTutup] = useState<Set<string>>(new Set());
  const balik = (kode: string) => setTutup((t) => {
    const n = new Set(t);
    if (!n.delete(kode)) n.add(kode);
    return n;
  });

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-soft">
          Bulan
          <input type="month" value={o.bulan} onChange={(e) => o.setBulan(e.target.value)} className={`${FIELD} w-[170px] mt-1 block`} />
        </label>
        <label className="text-xs text-ink-soft">
          ULP
          <select value={o.ulp} onChange={(e) => o.setUlp(e.target.value)} className={`${FIELD} w-[160px] mt-1 block`} disabled={daftarUlp.length <= 1}>
            {daftarUlp.map((u) => <option key={u} value={u}>{u === "SEMUA" ? "Semua ULP" : u}</option>)}
          </select>
        </label>
        <button onClick={o.muat} className={BTN_GHOST} disabled={o.loading}>
          <RefreshCw size={14} className={o.loading ? "animate-spin" : ""} /> Muat ulang
        </button>
        {pengatur && (
          <button onClick={() => setAtur(true)} className={BTN_GHOST} disabled={o.loading}>
            <Settings2 size={14} /> Atur baris
          </button>
        )}
        <div className="ml-auto text-xs text-ink-soft">
          Hitungan minggu
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SISTEM_MINGGU.map((s) => (
              <button key={s.kunci} onClick={() => o.setSistem(s.kunci)} className={`${CHIP} ${o.sistem === s.kunci ? CHIP_ON : CHIP_OFF}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-ink-soft -mt-1">
        {ket}. Semua pekerjaan yang sudah dikirim, <b>termasuk yang belum diverifikasi</b>, di tanggal pekerjaannya. Target (T) = SLA bulanan
        ULP (Atur SLA di Rekap Kinerja) dibagi menurut jumlah hari tiap minggu, hanya untuk baris yang diberi SLA.
        {o.sistem === "iso" && " Minggu ISO bisa memuat tanggal bulan sebelah, dan sebulan bisa 5 minggu — totalnya tidak selalu sama dengan tab harian."}
      </p>

      {o.galat && !o.loading && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">{o.galat}</p>
        </div>
      )}

      {o.loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-sm text-ink-soft">
          <Loader2 size={16} className="animate-spin" /> Memuat realisasi…
        </div>
      ) : o.baris.length === 0 && !o.galat ? (
        <div className={`${CARD} p-6 text-sm text-ink-soft text-center`}>
          Belum ada baris LM Mingguan untuk {o.ulp === "SEMUA" ? "Semua ULP" : o.ulp}
          {pengatur ? " — susun lewat Atur baris." : "."}
        </div>
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="border-collapse text-xs min-w-full">
            <thead className="kepala-kit">
              <tr>
                <th className={`${TH} text-left sticky left-0 bg-white z-10 min-w-[260px]`}>Uraian pekerjaan</th>
                <th className={`${TH} text-left`}>Satuan</th>
                {o.minggu.map((w, i) => (
                  <th key={w.label} className={`${TH} text-center min-w-[90px] ${i === sekarang ? "bg-brand-50 text-brand-700" : ""}`}>
                    <div>{w.label}{w.ke ? ` · ke-${w.ke}` : ""}</div>
                    <div className="font-normal text-[10px]">{teksRentang(w)}</div>
                  </th>
                ))}
                <th className={`${TH} text-right min-w-[70px]`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {o.baris.filter((b) => !b.induk || !tutup.has(b.induk)).map((b) => {
                const isi = o.nilai.get(b.id) ?? [];
                const total = isi.reduce((a, n) => a + n, 0);
                const ber = punyaRincian(b, o.baris);
                // Baris utama tanpa rincian ikut tampil sebagai kepala (seperti Perabasan).
                const kepala = !b.induk;
                const kosong = barisKosong(b, o.baris);
                const d = desimal(b);
                const target = o.minggu.map((w) => targetRentang(b, o.sla, w.dari, w.sampai));
                const targetTotal = targetRentang(b, o.sla, o.minggu[0].dari, o.minggu[o.minggu.length - 1].sampai);
                const tanpaSla = !!b.sla?.length && targetTotal === null;
                return (
                  <tr key={b.id} className={kepala ? "bg-surface/60" : ""}>
                    <td className={`px-2 py-1.5 border-b border-line sticky left-0 z-10 ${kepala ? "bg-surface" : "bg-white pl-7"}`}>
                      {ber ? (
                        <button onClick={() => balik(b.id)} className="flex items-center gap-1 font-semibold text-ink hover:text-brand-700" aria-expanded={!tutup.has(b.id)}>
                          {tutup.has(b.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />} {b.uraian}
                        </button>
                      ) : (
                        <div className={`${kepala ? "font-semibold text-ink" : "text-ink"} ${kepala ? "pl-[18px]" : ""}`}>{b.uraian}</div>
                      )}
                      <div className={`text-[10px] ${kepala ? "pl-[18px]" : ""} ${kosong ? "text-ink-muted italic" : "text-ink-soft"}`}>{keterangan(b)}{ber && tutup.has(b.id) ? " · rincian disembunyikan" : ""}</div>
                      {tanpaSla && <div className="text-[10px] pl-[18px] text-amber-700">SLA belum diatur — tanpa target</div>}
                    </td>
                    <td className="px-2 py-1.5 border-b border-line text-ink-soft">{b.satuan || (d ? "KMS" : "pekerjaan")}</td>
                    {isi.map((n, i) => (
                      <td key={i} className={`${TD} ${kepala ? "font-semibold text-ink" : ""} ${i === sekarang ? "bg-brand-50" : ""}`}>
                        {kosong ? "" : <Sel n={n} target={target[i]} desimal={d} />}
                      </td>
                    ))}
                    <td className={`${TD} font-semibold text-ink ${total > 0 ? "bg-brand-50" : ""}`}>
                      {kosong ? "" : <Sel n={total} target={targetTotal} desimal={d} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {atur && pengatur && (
        <AturLm4dxModal
          laporan="mingguan"
          ulp={o.ulp}
          baris={o.baris}
          kategori={o.kategori}
          tindakan={o.tindakan}
          oleh={pengatur}
          onTutup={() => setAtur(false)}
          onTersimpan={o.muat}
        />
      )}
    </>
  );
}
