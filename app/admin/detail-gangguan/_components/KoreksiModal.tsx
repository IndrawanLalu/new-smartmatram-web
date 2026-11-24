"use client";

import { useMemo, useState } from "react";
import { X, Copy, Check, Save, Loader2, Clock, ClipboardCheck, BadgeCheck, Trash2 } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, DISPLAY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { STEPS, loadSettings, saveSettings } from "./koreksiSettings";
import { antreanApkt } from "./apktBookmarklet";
import type { KoreksiRow } from "../_lib/gangguan";
import { alasanTolak, bandingRptRct, bangunKoreksi, fmtDt, hitungLangkah, parseDt } from "../_lib/koreksiHitung";
import FotoApkt from "./FotoApkt";

interface GangguanLite {
  no_laporan?: string;
  ulp?: string | null;
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
  /** Token dari GET /api/apkt/koreksi — bookmark memakainya untuk menandai "masuk APKT". */
  token: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function KoreksiModal({ row, existing, token, onClose, onSaved }: Props) {
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
  const [copiedApkt, setCopiedApkt] = useState(false);

  // Hitung timestamp terkoreksi kumulatif.
  const steps = useMemo(() => (lapor ? hitungLangkah(lapor, durs) : null), [lapor, durs]);

  // Waktu asli yang dibekukan saat koreksi dibuat menang atas baris laporan —
  // unduhan APKT sesudah koreksi disetujui sudah berisi waktu terkoreksi.
  const bandingBaris = bandingRptRct(row, durs);
  const banding = {
    ...bandingBaris,
    rptBefore: Number(existing?.rpt_asli) > 0 ? Number(existing?.rpt_asli) : bandingBaris.rptBefore,
    rctBefore: Number(existing?.rct_asli) > 0 ? Number(existing?.rct_asli) : bandingBaris.rctBefore,
  };
  const { rptBefore, rctBefore, rptAfter, rctAfter } = banding;
  const tolak = existing?.apkt_masuk_at ? null : alasanTolak(banding, settings.minRpt);

  // Sudah tersimpan di APKT → hanya baca: isi Smart harus tetap sama dengan APKT.
  const diApkt = Boolean(existing?.apkt_masuk_at);
  // Yang dikirim ke APKT / ditandai harus koreksi yang TERSIMPAN, bukan isian
  // yang baru diubah di layar dan belum disimpan.
  const samaTersimpan = Boolean(existing) && STEPS.every((st, i) => Number(existing?.[st.key]) === Number(durs[i]));
  const bolehKeApkt = samaTersimpan && !diApkt && !tolak;
  const [menandai, setMenandai] = useState(false);
  const [menghapus, setMenghapus] = useState(false);

  /** Hapus dari antrian: koreksi yang belum di APKT dibatalkan, laporan kembali "Koreksi". */
  async function hapusAntrian() {
    if (!row.no_laporan || !existing || diApkt) return;
    if (!window.confirm(`Hapus koreksi ${row.no_laporan} dari antrian?
Laporan kembali ke status "Koreksi" dan bisa dikoreksi ulang.`)) return;
    setMenghapus(true); setErr(null);
    try {
      const res = await fetch("/api/apkt/koreksi", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nos: [row.no_laporan] }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error); return; }
      if (!data.jumlah) { setErr("Tidak terhapus — koreksi ini mungkin sudah masuk APKT."); onSaved(); return; }
      onSaved();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setMenghapus(false);
    }
  }

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

  // Semua waktu sekaligus → dibaca bookmarklet "Isi APKT dari Smart" di halaman APKT.
  async function copyApkt() {
    if (!steps || !row.no_laporan || !bolehKeApkt) return;
    const [penugasan, perjalanan, pengerjaan, nyalaSmt, nyala, selesai] = steps.map((s) => fmtDt(s.date));
    const teks = antreanApkt(token, [
      {
        no: row.no_laporan, penugasan, perjalanan, pengerjaan, nyala_sementara: nyalaSmt, nyala, selesai,
        waktu_lapor: row.waktu_lapor ?? null, nama_pelapor: row.nama_pelapor ?? null,
        rpt_asli: rptBefore, rpt_koreksi: rptAfter, rct_asli: rctBefore, rct_koreksi: rctAfter,
      },
    ], settings.minRpt);
    try {
      await navigator.clipboard.writeText(teks);
      setCopiedApkt(true);
    } catch { /* abaikan */ }
  }

  /** Laporan yang dikoreksi MANUAL di APKT (tanpa bookmark) → tandai "Sudah dikoreksi". */
  async function tandaiManual() {
    if (!row.no_laporan || !bolehKeApkt) return;
    if (!window.confirm(`Tandai ${row.no_laporan} sudah dikoreksi di APKT?\nPastikan waktu yang Anda masukkan di APKT sama dengan koreksi ini. Sesudahnya koreksi tidak bisa diubah dari Smart.`)) return;
    setMenandai(true); setErr(null);
    try {
      const res = await fetch("/api/apkt/koreksi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tandaiMasuk: row.no_laporan }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error); return; }
      onSaved();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setMenandai(false);
    }
  }

  async function handleSave() {
    if (tolak || diApkt) return;
    const dasar = bangunKoreksi(row, durs, korektor);
    if (!dasar) return;
    // Perbarui: waktu asli tetap yang dibekukan pertama kali, bukan baris laporan
    // yang mungkin sudah berisi waktu terkoreksi dari unduhan APKT terbaru.
    const payload = { ...dasar, rpt_asli: rptBefore, rct_asli: rctBefore };
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/apkt/koreksi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: payload }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(`${data.error}${data.hint ? " — " + data.hint : ""}`); return; }
      saveSettings({ ...settings, korektor: korektor.trim() });
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

          {row.no_laporan && <FotoApkt noLaporan={row.no_laporan} statusAkhir={row.status_akhir} />}

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
                    disabled={diApkt} className={`${FIELD} w-20 text-right`} />
                </div>
              ))}
            </div>

            {/* Hasil timestamp */}
            <div className="space-y-2">
              <p className={EYEBROW}>Timestamp terkoreksi (klik salin)</p>
              <button onClick={copyApkt} disabled={!steps || !bolehKeApkt}
                title={bolehKeApkt
                  ? "Salin No Laporan + semua waktu, lalu klik bookmark 'Isi APKT dari Smart' di halaman APKT"
                  : diApkt ? "Sudah dikoreksi di APKT" : "Simpan koreksi dulu — yang dikirim ke APKT harus koreksi yang tersimpan"}
                className={`w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  copiedApkt ? "border-green-300 bg-green-50 text-green-700" : "border-navy-300 bg-navy-50 text-navy-700 hover:bg-navy-100"
                }`}>
                {copiedApkt ? <Check size={14} /> : <ClipboardCheck size={14} />}
                {copiedApkt ? "Tersalin — klik bookmark di APKT" : "Salin untuk APKT (semua waktu)"}
              </button>
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

          {tolak && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-2">
              Koreksi tidak bisa dilakukan: {tolak}. Laporan ini juga dilewati dari antrean APKT.
            </div>
          )}

          {diApkt && (
            <div className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-xl p-2">
              Sudah dikoreksi di APKT
              {existing?.apkt_masuk_at ? ` (${new Date(String(existing.apkt_masuk_at)).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}.
              Koreksi tidak bisa diubah dari Smart supaya tetap sama dengan isi APKT.
            </div>
          )}

          {!diApkt && existing && !samaTersimpan && (
            <div className="text-xs text-attention bg-attention-tint border border-attention/25 rounded-xl p-2">
              Durasi diubah tetapi belum disimpan. Simpan dulu sebelum disalin ke APKT atau ditandai.
            </div>
          )}

          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-2">{err}</div>}

          {/* Footer */}
          <div className="flex items-center gap-3 pt-3 border-t border-line">
            <div className="flex items-center gap-2">
              <label className="text-xs text-ink-soft">Korektor:</label>
              <input value={korektor} onChange={(e) => setKorektor(e.target.value)} placeholder="Nama"
                disabled={diApkt} className={`${FIELD} w-36`} />
            </div>
            {existing && !diApkt && (
              <button onClick={hapusAntrian} disabled={menghapus}
                title="Batalkan koreksi ini (belum di APKT) supaya bisa dikoreksi ulang"
                className={`${BTN_GHOST} ml-auto text-red-700`}>
                {menghapus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Hapus dari antrian
              </button>
            )}
            {existing && !diApkt && (
              <button onClick={tandaiManual} disabled={menandai || !bolehKeApkt}
                title="Untuk laporan yang Anda koreksi sendiri di APKT tanpa bookmark"
                className={BTN_GHOST}>
                {menandai ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                Tandai sudah dikoreksi di APKT
              </button>
            )}
            {!diApkt && (
              <button onClick={handleSave} disabled={saving || !lapor || !!tolak} className={`${BTN_PRIMARY} ${existing ? "" : "ml-auto"}`}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Menyimpan..." : existing ? "Perbarui Koreksi" : "Simpan Koreksi"}
              </button>
            )}
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
