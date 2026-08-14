"use client";

import { useMemo, useState } from "react";
import { X, Copy, Check, Save, Loader2, Clock } from "lucide-react";
import { BTN_PRIMARY, DISPLAY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { STEPS, loadSettings, saveSettings } from "./koreksiSettings";
import type { KoreksiRow } from "../_lib/gangguan";

interface GangguanLite {
  no_laporan?: string;
  waktu_lapor?: string;
  waktu_response?: string | null;
  waktu_recovery?: string | null;
  nama_pelapor?: string;
  alamat_pelapor?: string;
  keterangan_pelapor?: string | null;
  nama_posko?: string;
  status_akhir?: string;
  durasi_response_time?: number | null;
  durasi_recovery_time?: number | null;
}

interface Props {
  row: GangguanLite;
  existing: KoreksiRow | null;
  onClose: () => void;
  onSaved: () => void;
}

// "04/06/2026 9:12:46" → Date
function parseDt(s: string | undefined): Date | null {
  if (!s) return null;
  const [datePart, timePart = "0:0:0"] = s.trim().split(" ");
  const [d, m, y] = datePart.split("/").map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(":").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh, mm, ss);
}
function fmtDt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

export default function KoreksiModal({ row, existing, onClose, onSaved }: Props) {
  const lapor = useMemo(() => parseDt(row.waktu_lapor), [row.waktu_lapor]);

  const settings = useMemo(() => loadSettings(), []);
  const [durs, setDurs] = useState<number[]>(
    STEPS.map((s, i) => {
      const v = existing?.[s.key];
      return typeof v === "number" ? v : settings.durs[i] ?? s.def;
    }),
  );
  const [korektor, setKorektor] = useState(existing?.korektor ?? settings.korektor);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copiedSet, setCopiedSet] = useState<Set<number>>(new Set());
  const [copiedNo, setCopiedNo] = useState(false);

  // Hitung timestamp terkoreksi kumulatif.
  const steps = useMemo(() => {
    if (!lapor) return null;
    const out: { label: string; date: Date }[] = [];
    let cur = lapor;
    const labels = ["Penugasan", "Perjalanan", "Pengerjaan", "Nyala Sementara", "Nyala", "Selesai"];
    durs.forEach((m, i) => {
      cur = addMin(cur, Number(m) || 0);
      out.push({ label: labels[i], date: cur });
    });
    return out;
  }, [lapor, durs]);

  // durasi APKT dalam DETIK → konversi ke menit agar sebanding dengan "sesudah".
  const rptBefore = (Number(row.durasi_response_time) || 0) / 60;
  const rctBefore = (Number(row.durasi_recovery_time) || 0) / 60;
  const rptAfter = (Number(durs[0]) || 0) + (Number(durs[1]) || 0) + (Number(durs[2]) || 0);
  const rctAfter = rptAfter + (Number(durs[3]) || 0) + (Number(durs[4]) || 0);

  function setDur(i: number, val: string) {
    setDurs((prev) => prev.map((v, idx) => (idx === i ? (val === "" ? 0 : Number(val)) : v)));
  }

  async function copy(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSet((prev) => new Set(prev).add(idx)); // tandai persisten
    } catch { /* abaikan */ }
  }

  async function copyNo() {
    if (!row.no_laporan) return;
    try {
      await navigator.clipboard.writeText(row.no_laporan);
      setCopiedNo(true);
      setTimeout(() => setCopiedNo(false), 1500);
    } catch { /* abaikan */ }
  }

  async function handleSave() {
    if (!steps || !row.no_laporan) return;
    setSaving(true); setErr(null);
    try {
      const payload = {
        no_laporan: row.no_laporan,
        ulp: "AMPENAN",
        waktu_lapor: row.waktu_lapor ?? null,
        tgl_penugasan: fmtDt(steps[0].date),
        tgl_perjalanan: fmtDt(steps[1].date),
        tgl_pengerjaan: fmtDt(steps[2].date),
        tgl_nyala_sementara: fmtDt(steps[3].date),
        tgl_nyala: fmtDt(steps[4].date),
        tgl_selesai: fmtDt(steps[5].date),
        d_lapor_penugasan: durs[0],
        d_penugasan_perjalanan: durs[1],
        d_perjalanan_pengerjaan: durs[2],
        d_pengerjaan_nyalasmt: durs[3],
        d_nyalasmt_nyala: durs[4],
        d_nyala_selesai: durs[5],
        rpt_asli: rptBefore,
        rct_asli: rctBefore,
        rpt_koreksi: rptAfter,
        rct_koreksi: rctAfter,
        korektor: korektor.trim() || null,
      };
      const res = await fetch("/api/apkt/koreksi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: payload }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(`${data.error}${data.hint ? " — " + data.hint : ""}`); return; }
      saveSettings({ durs: settings.durs, korektor: korektor.trim() });
      onSaved();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-float w-full max-w-3xl max-h-[90vh] overflow-auto animate-pop-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-navy-600 text-white px-5 py-3 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h2 className={`${DISPLAY} font-bold text-base flex items-center gap-2`}><Clock size={16} /> Koreksi Waktu</h2>
            <p className="text-xs text-white/75 mt-0.5 flex items-center gap-1 flex-wrap">
              <button onClick={copyNo} title="Salin No Laporan"
                className="inline-flex items-center gap-1 font-semibold text-white hover:underline">
                {row.no_laporan}
                {copiedNo ? <Check size={11} /> : <Copy size={11} className="opacity-70" />}
              </button>
              <span>· {row.nama_pelapor || "—"} · {row.status_akhir || ""}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {!lapor && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              Format waktu lapor tidak dikenali: <span className="font-mono">{row.waktu_lapor || "(kosong)"}</span>
            </div>
          )}

          {/* Keterangan pelapor (read-only, untuk analisa) */}
          {(row.keterangan_pelapor || row.alamat_pelapor) && (
            <div className="bg-attention-tint border border-attention/25 rounded-xl p-3">
              <p className={`${EYEBROW} text-attention mb-1`}>Keterangan Pelapor</p>
              <p className="text-sm text-ink">{row.keterangan_pelapor || "—"}</p>
              {row.alamat_pelapor && <p className="text-[11px] text-ink-soft mt-1">📍 {row.alamat_pelapor}</p>}
            </div>
          )}

          {/* Waktu sebenarnya (read-only, untuk analisa) */}
          <div className="bg-surface border border-line rounded-xl p-3">
            <p className={`${EYEBROW} mb-2`}>Waktu Sebenarnya (read-only)</p>
            <div className="grid grid-cols-3 gap-3">
              <ReadOnly label="Lapor" value={row.waktu_lapor} />
              <ReadOnly label="Pengerjaan" value={row.waktu_response} />
              <ReadOnly label="Nyala" value={row.waktu_recovery} />
            </div>
          </div>

          {/* RPT/RCT before vs after */}
          <div className="grid grid-cols-2 gap-3">
            <Compare label="RPT (Lapor → Pengerjaan)" before={rptBefore} after={rptAfter} />
            <Compare label="RCT (Lapor → Nyala)" before={rctBefore} after={rctAfter} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Input durasi */}
            <div className="space-y-2">
              <p className={EYEBROW}>Durasi tiap tahap (menit)</p>
              {STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <label className="flex-1 text-xs text-ink">{s.label}</label>
                  <input type="number" min={0} value={durs[i]} onChange={(e) => setDur(i, e.target.value)}
                    className={`${FIELD} w-20 text-right`} />
                </div>
              ))}
            </div>

            {/* Hasil timestamp */}
            <div className="space-y-2">
              <p className={EYEBROW}>Timestamp terkoreksi (klik salin)</p>
              {steps?.map((st, i) => {
                const done = copiedSet.has(i);
                return (
                  <button key={i} onClick={() => copy(fmtDt(st.date), i)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-colors ${
                      done ? "border-green-300 bg-green-50" : "border-line hover:border-navy-300 hover:bg-navy-50"
                    }`}>
                    <span className="w-28 text-[11px] text-ink-soft shrink-0">{st.label}</span>
                    <span className={`flex-1 font-mono text-xs ${done ? "text-green-700 font-semibold" : "text-ink"}`}>{fmtDt(st.date)}</span>
                    {done ? <Check size={13} className="text-green-700 shrink-0" /> : <Copy size={13} className="text-ink-muted shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-2">{err}</div>}

          {/* Footer */}
          <div className="flex items-center gap-3 pt-3 border-t border-line">
            <div className="flex items-center gap-2">
              <label className="text-xs text-ink-soft">Korektor:</label>
              <input value={korektor} onChange={(e) => setKorektor(e.target.value)} placeholder="Nama"
                className={`${FIELD} w-36`} />
            </div>
            <button onClick={handleSave} disabled={saving || !lapor} className={`${BTN_PRIMARY} ml-auto`}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Menyimpan..." : existing ? "Perbarui Koreksi" : "Simpan Koreksi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] text-ink-muted mb-0.5">{label}</p>
      <p className="font-mono text-xs text-ink break-all">{value || "—"}</p>
    </div>
  );
}

function Compare({ label, before, after }: { label: string; before: number; after: number }) {
  const better = after < before;
  return (
    <div className="bg-surface rounded-xl p-3 border border-line">
      <p className="text-[11px] text-ink-soft mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-ink-muted line-through">{before.toFixed(0)}</span>
        <span className="text-ink-muted">→</span>
        <span className={`${DISPLAY} text-lg font-bold ${better ? "text-green-700" : "text-attention"}`}>
          {after.toFixed(0)}
        </span>
        <span className="text-[11px] text-ink-muted">menit</span>
      </div>
    </div>
  );
}
