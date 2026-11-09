"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { BarisSheetPro } from "@/lib/proNtbSheet";
import { ambilBarisBulan, barisDariData } from "../_lib/ambilProNtb";
import { bandingkan, type StatusCek } from "../_lib/cekProNtb";
import { angkaPro, tanggalPro, type BarisPro } from "../_lib/proNtb";
import KirimProNtb from "./KirimProNtb";

/**
 * Cek ke spreadsheet PRO NTB (8 Nov 2026): baris SMART dibandingkan dengan
 * isian tab WO di spreadsheet ULP — baca saja. Sejak 9 Nov baris SMART = WO +
 * realisasi sebulan (`pro_ntb_baris`), dicocokkan lewat kode SMART di
 * KETERANGAN dulu, lalu tanggal + lokasi untuk isian manual.
 */

interface Props {
  ulp: string;
  dari: string;
  sampai: string;
  /** Pengatur link spreadsheet: UP3 & admin. */
  pengatur: string | null;
  onDariAwalBulan: () => void;
}

const STATUS: { kode: StatusCek; label: string; warna: string }[] = [
  { kode: "beda", label: "Beda", warna: "bg-amber-50 text-amber-800" },
  { kode: "smart", label: "Hanya di SMART", warna: "bg-sky-50 text-sky-800" },
  { kode: "sheet", label: "Hanya di spreadsheet", warna: "bg-violet-50 text-violet-800" },
  { kode: "cocok", label: "Cocok", warna: "bg-green-50 text-green-700" },
];
const TH = "px-2.5 py-2 text-left text-[10px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-2.5 py-1.5 border-b border-line align-top text-xs";
const PER_HAL = 20;
const n2 = (n: number | null) => (n === null ? "—" : n.toLocaleString("id-ID", { maximumFractionDigits: 2 }));

export default function CekProNtb({ ulp, dari, sampai, pengatur, onDariAwalBulan }: Props) {
  const bulan = sampai.slice(0, 7);
  const awalBulan = `${bulan}-01`;
  const [baris, setBaris] = useState<BarisPro[] | null>(null);
  const [sheet, setSheet] = useState<BarisSheetPro[] | null>(null);
  const [idSheet, setIdSheet] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [link, setLink] = useState("");
  const [simpan, setSimpan] = useState(false);
  const [saring, setSaring] = useState<StatusCek | "SEMUA">("SEMUA");
  const [hal, setHal] = useState(1);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/pro-ntb/sheet?ulp=${encodeURIComponent(ulp)}&dari=${dari}&sampai=${sampai}`, { signal: ctl.signal })
      .then(async (r) => {
        const j = await r.json();
        setIdSheet(j.spreadsheetId ?? null);
        if (!r.ok) throw new Error(j.error ?? `server menjawab ${r.status}`);
        setSheet(j.baris);
        setGalat(null);
      })
      .catch((e: Error) => { if (e.name !== "AbortError") { setSheet(null); setGalat(e.message); } });
    return () => ctl.abort();
  }, [ulp, dari, sampai, nonce]);

  useEffect(() => {
    if (ulp === "SEMUA") return;
    let batal = false;
    setBaris(null);
    ambilBarisBulan(supabaseBrowser, ulp, bulan)
      .then((d) => { if (!batal) setBaris(barisDariData(d)); })
      .catch((e: Error) => { if (!batal) setGalat(`Baris SMART gagal dibaca: ${e.message}`); });
    return () => { batal = true; };
  }, [ulp, bulan, nonce]);

  const muatUlang = () => { setSheet(null); setGalat(null); setNonce((n) => n + 1); };

  const hasil = useMemo(() => (sheet && baris ? bandingkan(baris, sheet) : null), [baris, sheet]);
  const tampil = useMemo(() => (hasil?.baris ?? []).filter((c) => saring === "SEMUA" || c.status === saring), [hasil, saring]);
  const totalHal = Math.max(1, Math.ceil(tampil.length / PER_HAL));
  const halIni = Math.min(hal, totalHal);

  const simpanLink = async () => {
    setSimpan(true);
    try {
      const r = await fetch("/api/pro-ntb/sheet", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ulp, link }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `server menjawab ${r.status}`);
      setLink("");
      muatUlang();
    } catch (e) {
      setGalat((e as Error).message);
    } finally {
      setSimpan(false);
    }
  };

  if (ulp === "SEMUA") return <p className="text-xs text-ink-muted">Pilih satu ULP — tiap ULP punya spreadsheet PRO NTB sendiri.</p>;
  if (dari !== awalBulan) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        Cek &amp; kirim selalu sebulan dari tanggal 1 — WO bulan itu ikut dibandingkan.
        <button onClick={onDariAwalBulan} className={BTN_GHOST}>Pakai {awalBulan.split("-").reverse().join("-")} s.d. {sampai.split("-").reverse().join("-")}</button>
      </div>
    );
  }

  const formLink = pengatur && (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-ink-soft flex-1 min-w-[280px]">
        {idSheet ? "Ganti spreadsheet PRO NTB" : "Link spreadsheet PRO NTB"} {ulp}
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className={`${FIELD} w-full mt-1 block`} />
      </label>
      <button onClick={() => void simpanLink()} className={BTN_PRIMARY} disabled={simpan || !link.trim()}>
        {simpan && <Loader2 size={14} className="animate-spin" />} Simpan link
      </button>
    </div>
  );

  if (!idSheet && !galat && sheet) {
    return (
      <div className={`${CARD} p-4 space-y-2`}>
        <p className="text-xs text-ink-soft">Spreadsheet PRO NTB {ulp} belum diatur.</p>
        {formLink || <p className="text-xs text-ink-muted">Minta UP3/admin mengisi link-nya.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span>
          Membandingkan dengan tab WO spreadsheet PRO NTB {ulp} — <b>baca saja</b>, tidak ada yang ditulis.
        </span>
        {idSheet && (
          <a href={`https://docs.google.com/spreadsheets/d/${idSheet}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
            Buka spreadsheet <ExternalLink size={12} />
          </a>
        )}
        <button onClick={muatUlang} className={`${BTN_GHOST} ml-auto`} disabled={!sheet && !galat}>
          <RefreshCw size={14} className={!sheet && !galat ? "animate-spin" : ""} /> Baca ulang spreadsheet
        </button>
      </div>

      {galat && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">{galat}</p>
        </div>
      )}

      {!hasil && !galat ? (
        <div className="p-8 flex items-center justify-center gap-2 text-sm text-ink-soft">
          <Loader2 size={16} className="animate-spin" /> Membaca 9 tab WO di spreadsheet…
        </div>
      ) : hasil && (
        <>
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full border-collapse">
              <thead className="kepala-kit">
                <tr>
                  <th className={TH}>Tab</th>
                  <th className={`${TH} text-right`}>SMART (baris · jumlah)</th>
                  <th className={`${TH} text-right`}>Spreadsheet (baris · jumlah)</th>
                  {STATUS.map((s) => <th key={s.kode} className={`${TH} text-right`}>{s.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {hasil.ringkas.map((r) => (
                  <tr key={r.tab}>
                    <td className={`${TD} font-medium text-ink`}>{r.tab}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.smartN} · {n2(r.smartJumlah)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.sheetN} · {n2(r.sheetJumlah)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.beda || ""}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.hanyaSmart || ""}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.hanyaSheet || ""}</td>
                    <td className={`${TD} text-right tabular-nums`}>{r.cocok || ""}</td>
                  </tr>
                ))}
                {hasil.ringkas.length === 0 && (
                  <tr><td colSpan={7} className={`${TD} text-ink-muted`}>Tidak ada baris di SMART maupun spreadsheet pada rentang ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => { setSaring("SEMUA"); setHal(1); }} className={`${CHIP} ${saring === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>
              Semua ({hasil.baris.length})
            </button>
            {STATUS.map((s) => (
              <button key={s.kode} onClick={() => { setSaring(s.kode); setHal(1); }} className={`${CHIP} ${saring === s.kode ? CHIP_ON : CHIP_OFF}`}>
                {s.label} ({hasil.baris.filter((c) => c.status === s.kode).length})
              </button>
            ))}
          </div>

          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full border-collapse">
              <thead className="kepala-kit">
                <tr>
                  <th className={TH}>Tanggal</th>
                  <th className={TH}>Tab</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>SMART — jenis · lokasi</th>
                  <th className={`${TH} text-right`}>SMART WO · realisasi</th>
                  <th className={TH}>Spreadsheet — baris · jenis · lokasi · tim</th>
                  <th className={`${TH} text-right`}>Sheet WO · realisasi</th>
                </tr>
              </thead>
              <tbody>
                {tampil.slice((halIni - 1) * PER_HAL, halIni * PER_HAL).map((c) => {
                  const st = STATUS.find((s) => s.kode === c.status)!;
                  return (
                    <tr key={c.id}>
                      <td className={`${TD} whitespace-nowrap`}>{tanggalPro(c.tgl)}</td>
                      <td className={`${TD} whitespace-nowrap`}>{c.tab}</td>
                      <td className={TD}>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${st.warna}`}>{st.label}</span>
                        {c.beda.length > 0 && <span className="block text-[10px] text-amber-700 mt-0.5">{c.beda.join(", ")}</span>}
                      </td>
                      <td className={`${TD} max-w-[280px]`}>
                        {c.smart ? (
                          <>
                            <p className="text-ink-soft">{c.smart.jenis?.jenis_pekerjaan ?? <i className="text-amber-700">jenis belum diatur</i>}</p>
                            <p className="text-ink">{c.smart.lokasi}</p>
                            {c.smart.item.petugas && <p className="text-[10px] text-ink-muted">{c.smart.item.petugas}</p>}
                          </>
                        ) : "—"}
                      </td>
                      <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>
                        {c.smart ? `${c.smart.wo === undefined ? "" : `${angkaPro(c.smart.wo, c.smart.desimal) || "—"} · `}${angkaPro(c.smart.nilai, c.smart.desimal) || "—"}` : ""}
                      </td>
                      <td className={`${TD} max-w-[320px]`}>
                        {c.sheet ? (
                          <>
                            <p className="text-ink-soft">baris {c.sheet.baris} · {c.sheet.jenis || "—"}</p>
                            <p className="text-ink">{c.sheet.lokasi || "—"}</p>
                            {c.sheet.tim && <p className="text-[10px] text-ink-muted">{c.sheet.tim}</p>}
                          </>
                        ) : "—"}
                      </td>
                      <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>{c.sheet ? `${n2(c.sheet.wo)} · ${n2(c.sheet.realisasi)}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalHal > 1 && (
              <div className="flex items-center justify-end gap-2 px-3 py-2 text-xs text-ink-soft">
                <button onClick={() => setHal(halIni - 1)} disabled={halIni <= 1} className="p-1 disabled:opacity-30" aria-label="Sebelumnya"><ChevronLeft size={16} /></button>
                {halIni} / {totalHal}
                <button onClick={() => setHal(halIni + 1)} disabled={halIni >= totalHal} className="p-1 disabled:opacity-30" aria-label="Berikutnya"><ChevronRight size={16} /></button>
              </div>
            )}
          </div>
          <KirimProNtb ulp={ulp} bulan={bulan} baris={hasil.baris} pengatur={pengatur} />
          {formLink}
        </>
      )}
    </div>
  );
}
