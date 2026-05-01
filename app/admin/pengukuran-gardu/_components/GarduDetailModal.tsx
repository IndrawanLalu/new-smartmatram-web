"use client";

import { useState } from "react";
import {
  X,
  AlertTriangle,
  Thermometer,
  Zap,
  History,
  ChevronDown,
  ChevronUp,
  Pencil,
  MessageCircle,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import KirimWAGarduModal from "./_KirimWAGarduModal";
import LoadingOverlay from "@/app/admin/_components/LoadingOverlay";
import {
  type PengukuranGardu,
  HIGH_CURRENT_A,
  HIGH_TEMP_C,
  OVERLOAD_PCT,
  getNominalCurrent,
} from "../_hooks/usePengukuranGardu";

// ── Helpers ───────────────────────────────────────────────────────────────────

function val(v: number | null | undefined) {
  return v != null ? Math.round(v) : "—";
}

function fmtTanggal(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

function ArusHighlight({
  v,
  threshold = HIGH_CURRENT_A,
}: {
  v: number;
  threshold?: number;
}) {
  const high = v > threshold;
  return (
    <span
      className={`font-mono font-semibold ${high ? "text-red-600" : "text-[#e2e8f0]"}`}
    >
      {Math.round(v)}
      {high && (
        <AlertTriangle size={10} className="inline ml-0.5 text-red-500" />
      )}
    </span>
  );
}

function StatBox({
  label,
  value,
  unit = "",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
}) {
  return (
    <div className="bg-[#0d1b2a] rounded-lg px-3 py-2.5 text-center">
      <p className="text-xs text-[#94a3b8] mb-0.5">{label}</p>
      <p className="text-base font-bold text-[#e2e8f0]">
        {value}
        <span className="text-xs font-normal text-[#94a3b8] ml-0.5">
          {unit}
        </span>
      </p>
    </div>
  );
}

function BebanBar({ pct }: { pct: number }) {
  const color =
    pct >= OVERLOAD_PCT
      ? "bg-red-500"
      : pct >= 60
        ? "bg-amber-500"
        : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span
        className={`text-sm font-bold w-12 text-right ${pct >= OVERLOAD_PCT ? "text-red-600" : pct >= 60 ? "text-amber-600" : "text-green-600"}`}
      >
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  row: PengukuranGardu | null;
  onClose: () => void;
  onEdit: (row: PengukuranGardu) => void;
  allData?: PengukuranGardu[];
  onPatchRow?: (id: string, patch: Partial<PengukuranGardu>) => void;
  onDeleteRow?: (id: string) => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GarduDetailModal({
  row,
  onClose,
  onEdit,
  allData,
  onPatchRow,
  onDeleteRow,
}: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showKirimWA, setShowKirimWA] = useState(false);
  const [amgLoading, setAmgLoading] = useState(false);
  const [amgMarked, setAmgMarked] = useState(false);
  const [amgReset, setAmgReset] = useState(false);
  const [amgSuccess, setAmgSuccess] = useState(false);
  const [amgError, setAmgError] = useState<string | null>(null);

  if (!row) return null;

  const isAmgDone = !amgReset && (amgMarked || !!row.amg_sent_at);

  async function handleKirimAmg() {
    if (amgLoading) return;
    setAmgLoading(true);
    setAmgReset(false);
    setAmgError(null);
    try {
      const res = await fetch("/api/kirim-amg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pengukuranId: row!.id }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setAmgMarked(true);
      setAmgSuccess(true);
      setTimeout(() => setAmgSuccess(false), 2800);
      onPatchRow?.(row!.id, { amg_sent_at: new Date().toISOString() });
    } catch (e) {
      setAmgError(e instanceof Error ? e.message : "Gagal kirim ke AMG");
    } finally {
      setAmgLoading(false);
    }
  }

  const perjurusan = row.perjurusan ?? {};
  const jurusanKeys = Object.keys(perjurusan).sort();
  const isOverload = row.persen_beban >= OVERLOAD_PCT;
  const isHighTemp = row.suhu_trafo > HIGH_TEMP_C;
  const iNominal = getNominalCurrent(row.kva_trafo);
  const maxPhaseArus = Math.max(
    row.total_arus_r,
    row.total_arus_s,
    row.total_arus_t,
  );
  const isPhaseOverload = maxPhaseArus >= iNominal;
  const isPhaseWarn = !isPhaseOverload && maxPhaseArus >= iNominal * 0.9;

  const history =
    allData
      ?.filter((d) => d.no_gardu === row.no_gardu)
      .sort((a, b) => {
        const byDate = b.tanggal_pengukuran.localeCompare(a.tanggal_pengukuran);
        if (byDate !== 0) return byDate;
        return b.created_at.localeCompare(a.created_at);
      }) ?? [];

  async function handleDelete(id: string) {
    if (!onDeleteRow || deleteLoading) return;
    setDeleteLoading(true);
    await onDeleteRow(id);
    setDeletingId(null);
    setDeleteLoading(false);
    if (id === row?.id) onClose();
  }

  return (
    <>
      <LoadingOverlay
        loading={amgLoading}
        success={amgSuccess}
        icon="📡"
        title="Proses Kirim Data ke AMG"
        subtitle="Login & mengirim data pengukuran..."
        successTitle="Data Berhasil Dikirim!"
        successSubtitle="Data pengukuran tersimpan di AMG"
      />

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel slide-over kanan */}
      <div className="fixed top-0 right-0 h-full w-full max-w-5xl bg-[#162334] z-50 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-bold text-lg">{row.no_gardu}</h2>
              {isOverload && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  OVERLOAD
                </span>
              )}
              {isHighTemp && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  SUHU TINGGI
                </span>
              )}
              {isPhaseOverload && (
                <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  OVERLOAD 1 FASA
                </span>
              )}
              {isPhaseWarn && (
                <span className="bg-amber-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  WARNING 1 FASA
                </span>
              )}
              {row.wo_sent_at && (
                <span className="bg-[#00695C] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  WO DIKIRIM
                </span>
              )}
              {isAmgDone && (
                <span className="bg-blue-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  AMG ✅
                </span>
              )}
            </div>
            <p className="text-teal-100 text-sm mt-0.5">
              {row.penyulang ?? "—"} · {row.petugas_unit}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAmgDone ? (
              <div className="flex flex-col items-end gap-1">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-200 text-xs font-medium cursor-default">
                  <CheckCircle2 size={13} /> Terkirim ke AMG
                </span>
                <button
                  onClick={() => { setAmgReset(true); setAmgError(null); }}
                  className="text-[10px] text-[#94a3b8] hover:text-white underline leading-tight"
                >
                  Kirim Ulang
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={handleKirimAmg}
                  disabled={amgLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-medium hover:bg-white/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {amgLoading ? (
                    <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  {amgLoading ? "Mengirim ke AMG..." : "Kirim ke AMG"}
                </button>
                {amgError && (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-red-300 text-[10px] max-w-[200px] text-right leading-tight">{amgError}</span>
                    <button
                      onClick={handleKirimAmg}
                      className="text-[10px] text-[#5eead4] hover:text-white underline leading-tight"
                    >
                      Coba Lagi
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setShowKirimWA(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-medium hover:bg-white/25 transition-colors"
            >
              <MessageCircle size={13} /> Kirim WO via WA
            </button>
            <button
              onClick={() => onEdit(row)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-medium hover:bg-white/25 transition-colors"
            >
              <Pencil size={13} /> Edit Data Terbaru
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Info Dasar */}
          <section>
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
              Informasi Gardu
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-[#94a3b8]">Alamat</p>
                <p className="font-medium text-[#e2e8f0]">
                  {row.alamat ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#94a3b8]">Kapasitas Trafo</p>
                <p className="font-medium text-[#e2e8f0]">
                  {row.kva_trafo} KVA
                </p>
              </div>
              <div>
                <p className="text-xs text-[#94a3b8]">Tanggal Pengukuran</p>
                <p className="font-medium text-[#e2e8f0]">
                  {fmtTanggal(row.tanggal_pengukuran)}
                  {row.jam_pengukuran && (
                    <span className="ml-1.5 text-[#94a3b8] font-normal">
                      {row.jam_pengukuran}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#94a3b8]">Petugas</p>
                <p className="font-medium text-[#e2e8f0]">
                  {row.petugas_nama ?? "—"}
                </p>
              </div>
            </div>
          </section>

          {/* Beban Trafo */}
          <section>
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
              Beban Trafo
            </h3>
            <div className="bg-[#162334] border border-[#1e3552] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#94a3b8]">
                  {Math.round(row.beban_kva)} KVA / {row.kva_trafo} KVA
                </span>
                <span
                  className={`text-sm font-bold ${isOverload ? "text-red-600" : "text-[#e2e8f0]"}`}
                >
                  {isOverload ? "⚠ OVERLOAD" : "Normal"}
                </span>
              </div>
              <BebanBar pct={row.persen_beban} />
            </div>
          </section>

          {/* Pengukuran Total */}
          <section>
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
              Pengukuran Total
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-[#94a3b8] mb-1.5 flex items-center gap-1">
                  <Zap size={11} /> Arus (Ampere)
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <StatBox
                    label="Fasa R"
                    value={<ArusHighlight v={row.total_arus_r} />}
                    unit=""
                  />
                  <StatBox
                    label="Fasa S"
                    value={<ArusHighlight v={row.total_arus_s} />}
                    unit=""
                  />
                  <StatBox
                    label="Fasa T"
                    value={<ArusHighlight v={row.total_arus_t} />}
                    unit=""
                  />
                  <StatBox
                    label="Netral"
                    value={val(row.total_arus_n)}
                    unit=""
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-[#94a3b8] mb-1.5">
                  Tegangan Fasa-Netral (Volt)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <StatBox
                    label="V R-N"
                    value={val(row.total_teg_rn)}
                    unit=""
                  />
                  <StatBox
                    label="V S-N"
                    value={val(row.total_teg_sn)}
                    unit=""
                  />
                  <StatBox
                    label="V T-N"
                    value={val(row.total_teg_tn)}
                    unit=""
                  />
                </div>
              </div>
              {(row.total_teg_rs != null ||
                row.total_teg_st != null ||
                row.total_teg_rt != null) && (
                <div>
                  <p className="text-xs text-[#94a3b8] mb-1.5">
                    Tegangan Fasa-Fasa (Volt)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <StatBox
                      label="V R-S"
                      value={val(row.total_teg_rs)}
                      unit=""
                    />
                    <StatBox
                      label="V S-T"
                      value={val(row.total_teg_st)}
                      unit=""
                    />
                    <StatBox
                      label="V R-T"
                      value={val(row.total_teg_rt)}
                      unit=""
                    />
                  </div>
                </div>
              )}
              <div
                className={`flex items-center justify-between px-4 py-3 rounded-xl border ${isHighTemp ? "bg-amber-50 border-amber-200" : "bg-[#0d1b2a] border-[#1e3552]"}`}
              >
                <div className="flex items-center gap-2">
                  <Thermometer
                    size={16}
                    className={isHighTemp ? "text-amber-600" : "text-[#94a3b8]"}
                  />
                  <span
                    className={`text-sm font-medium ${isHighTemp ? "text-amber-700" : "text-[#94a3b8]"}`}
                  >
                    Suhu Trafo
                  </span>
                  {isHighTemp && (
                    <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                      TINGGI
                    </span>
                  )}
                </div>
                <span
                  className={`text-xl font-bold ${isHighTemp ? "text-amber-600" : "text-[#e2e8f0]"}`}
                >
                  {row.suhu_trafo}°C
                </span>
              </div>
            </div>
          </section>

          {/* Per Jurusan */}
          <section>
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
              Pengukuran Per Jurusan
            </h3>
            {jurusanKeys.length === 0 ? (
              <p className="text-sm text-[#94a3b8] text-center py-4 bg-[#0d1b2a] rounded-xl">
                Tidak ada data perjurusan
              </p>
            ) : (
              <div className="border border-[#1e3552] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0a2a26]">
                      <th className="text-left px-4 py-2.5 text-xs text-[#5eead4] font-semibold">
                        Jurusan
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs text-[#5eead4] font-semibold">
                        Arus R (A)
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs text-[#5eead4] font-semibold">
                        Arus S (A)
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs text-[#5eead4] font-semibold">
                        Arus T (A)
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs text-[#5eead4] font-semibold">
                        Arus N (A)
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs text-[#5eead4] font-semibold">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {jurusanKeys.map((key, i) => {
                      const j = perjurusan[key];
                      const arus = j?.arus ?? { R: 0, S: 0, T: 0, N: 0 };
                      const highR = arus.R > HIGH_CURRENT_A;
                      const highS = arus.S > HIGH_CURRENT_A;
                      const highT = arus.T > HIGH_CURRENT_A;
                      const anyHigh = highR || highS || highT;
                      const maxArus = Math.max(arus.R, arus.S, arus.T);
                      return (
                        <tr
                          key={key}
                          className={`${i % 2 === 0 ? "bg-[#162334]" : "bg-gray-50/50"} ${anyHigh ? "border-l-2 border-l-red-400" : ""}`}
                        >
                          <td className="px-4 py-3 font-bold text-[#e2e8f0]">
                            {key}
                          </td>
                          <td
                            className={`px-3 py-3 text-center ${highR ? "bg-red-50" : ""}`}
                          >
                            <span
                              className={`font-mono text-sm font-semibold ${highR ? "text-red-600" : "text-[#e2e8f0]"}`}
                            >
                              {Math.round(arus.R)}
                              {highR && (
                                <AlertTriangle
                                  size={10}
                                  className="inline ml-0.5"
                                />
                              )}
                            </span>
                          </td>
                          <td
                            className={`px-3 py-3 text-center ${highS ? "bg-red-50" : ""}`}
                          >
                            <span
                              className={`font-mono text-sm font-semibold ${highS ? "text-red-600" : "text-[#e2e8f0]"}`}
                            >
                              {Math.round(arus.S)}
                              {highS && (
                                <AlertTriangle
                                  size={10}
                                  className="inline ml-0.5"
                                />
                              )}
                            </span>
                          </td>
                          <td
                            className={`px-3 py-3 text-center ${highT ? "bg-red-50" : ""}`}
                          >
                            <span
                              className={`font-mono text-sm font-semibold ${highT ? "text-red-600" : "text-[#e2e8f0]"}`}
                            >
                              {Math.round(arus.T)}
                              {highT && (
                                <AlertTriangle
                                  size={10}
                                  className="inline ml-0.5"
                                />
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-mono text-sm text-[#94a3b8]">
                            {Math.round(arus.N ?? 0)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {anyHigh ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                <AlertTriangle size={9} /> {Math.round(maxArus)}
                                A
                              </span>
                            ) : maxArus > 0 ? (
                              <span className="text-xs text-green-600 font-semibold">
                                ✓ Normal
                              </span>
                            ) : (
                              <span className="text-xs text-[#94a3b8]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {jurusanKeys.some((k) => perjurusan[k]?.tegangan) && (
                  <div className="border-t border-[#1e3552] bg-[#0d1b2a] px-4 py-3">
                    <p className="text-xs font-semibold text-[#94a3b8] mb-2">
                      Tegangan Ujung per Jurusan (V)
                    </p>
                    <div className="grid grid-cols-5 gap-2">
                      {jurusanKeys.map((key) => {
                        const teg = perjurusan[key]?.tegangan;
                        if (!teg) return null;
                        return (
                          <div
                            key={key}
                            className="bg-[#162334] rounded-lg p-2 text-center border border-[#1e3552]"
                          >
                            <p className="text-xs font-bold text-[#5eead4]">
                              {key}
                            </p>
                            <p className="text-xs text-[#94a3b8] mt-0.5">
                              <span title="R">{Math.round(teg.R ?? 0)}</span>
                              <span className="text-gray-300"> / </span>
                              <span title="S">{Math.round(teg.S ?? 0)}</span>
                              <span className="text-gray-300"> / </span>
                              <span title="T">{Math.round(teg.T ?? 0)}</span>
                            </p>
                            <p className="text-[10px] text-gray-400">R/S/T V</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Riwayat Pengukuran — collapsible */}
          {history.length > 1 && (
            <section>
              <button
                onClick={() => setHistoryOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0d1b2a] rounded-xl hover:bg-[#0a2a26] transition-colors"
              >
                <span className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider flex items-center gap-1.5">
                  <History size={12} /> Riwayat Pengukuran ({history.length})
                </span>
                {historyOpen ? (
                  <ChevronUp size={14} className="text-[#94a3b8]" />
                ) : (
                  <ChevronDown size={14} className="text-[#94a3b8]" />
                )}
              </button>

              {historyOpen && (
                <div className="space-y-3 mt-3">
                  {history.map((h) => {
                    const isLatest = h.id === row.id;
                    const hOverload = h.persen_beban >= OVERLOAD_PCT;
                    const hHighTemp = h.suhu_trafo > HIGH_TEMP_C;
                    const hHighR = h.total_arus_r > HIGH_CURRENT_A;
                    const hHighS = h.total_arus_s > HIGH_CURRENT_A;
                    const hHighT = h.total_arus_t > HIGH_CURRENT_A;
                    const hPerjurusan = h.perjurusan ?? {};
                    const hJurusanKeys = Object.keys(hPerjurusan).sort();
                    const hasTeg = hJurusanKeys.some(
                      (k) => hPerjurusan[k]?.tegangan,
                    );

                    return (
                      <div
                        key={h.id}
                        className={`border rounded-xl overflow-hidden ${isLatest ? "border-[#00897B]" : "border-[#1e3552]"}`}
                      >
                        {/* Entry header */}
                        <div
                          className={`px-4 py-2.5 flex items-center justify-between ${isLatest ? "bg-teal-50" : "bg-[#0d1b2a]"}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#e2e8f0]">
                              {fmtTanggal(h.tanggal_pengukuran)}
                              {h.jam_pengukuran && (
                                <span className="ml-1.5 text-xs text-[#94a3b8] font-normal">
                                  {h.jam_pengukuran}
                                </span>
                              )}
                            </span>
                            {isLatest && (
                              <span className="text-[10px] bg-[#00897B] text-white px-1.5 py-0.5 rounded-full font-semibold">
                                terbaru
                              </span>
                            )}
                            {hOverload && (
                              <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                                OVERLOAD
                              </span>
                            )}
                            {h.wo_sent_at && (
                              <span className="text-[10px] bg-teal-700/40 text-teal-300 border border-teal-600/40 px-1.5 py-0.5 rounded-full font-semibold">
                                WO
                              </span>
                            )}
                            {h.amg_sent_at && (
                              <span className="text-[10px] bg-blue-700/40 text-blue-300 border border-blue-600/40 px-1.5 py-0.5 rounded-full font-semibold">
                                AMG
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-3 text-xs">
                              <span
                                className={`font-bold font-mono ${hOverload ? "text-red-600" : "text-[#00897B]"}`}
                              >
                                {Math.round(h.persen_beban)}% ·{" "}
                                {Math.round(h.beban_kva)} KVA
                              </span>
                              <span
                                className={`font-mono ${hHighTemp ? "text-amber-600 font-semibold" : "text-[#94a3b8]"}`}
                              >
                                {h.suhu_trafo}°C
                              </span>
                              <span className="text-[#94a3b8]">
                                {h.petugas_nama ?? "—"}
                              </span>
                            </div>
                            <button
                              onClick={() => onEdit(h)}
                              className="flex items-center gap-1 text-[10px] text-[#00897B] hover:text-[#004D40] font-semibold transition-colors border border-[#00897B]/30 rounded px-1.5 py-0.5"
                            >
                              <Pencil size={9} /> Edit
                            </button>
                            {onDeleteRow && (
                              deletingId === h.id ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-red-400">Yakin hapus?</span>
                                  <button
                                    onClick={() => handleDelete(h.id)}
                                    disabled={deleteLoading}
                                    className="text-[10px] text-white bg-red-500 hover:bg-red-600 font-semibold rounded px-1.5 py-0.5 disabled:opacity-50"
                                  >
                                    Ya
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(null)}
                                    className="text-[10px] text-[#94a3b8] hover:text-white border border-[#1e3552] rounded px-1.5 py-0.5"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeletingId(h.id)}
                                  className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 font-semibold transition-colors border border-red-500/30 rounded px-1.5 py-0.5"
                                >
                                  <Trash2 size={9} /> Hapus
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        {/* Pengukuran total grid */}
                        <div className="px-4 py-2.5 grid grid-cols-4 gap-x-6 gap-y-1 text-xs border-b border-[#1e3552] bg-[#162334]">
                          <div>
                            <span className="text-[#94a3b8]">Arus R: </span>
                            <span
                              className={`font-mono font-semibold ${hHighR ? "text-red-600" : "text-[#e2e8f0]"}`}
                            >
                              {Math.round(h.total_arus_r)} A
                              {hHighR && (
                                <AlertTriangle
                                  size={9}
                                  className="inline ml-0.5"
                                />
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#94a3b8]">Arus S: </span>
                            <span
                              className={`font-mono font-semibold ${hHighS ? "text-red-600" : "text-[#e2e8f0]"}`}
                            >
                              {Math.round(h.total_arus_s)} A
                              {hHighS && (
                                <AlertTriangle
                                  size={9}
                                  className="inline ml-0.5"
                                />
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#94a3b8]">Arus T: </span>
                            <span
                              className={`font-mono font-semibold ${hHighT ? "text-red-600" : "text-[#e2e8f0]"}`}
                            >
                              {Math.round(h.total_arus_t)} A
                              {hHighT && (
                                <AlertTriangle
                                  size={9}
                                  className="inline ml-0.5"
                                />
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#94a3b8]">Arus N: </span>
                            <span className="font-mono text-[#e2e8f0]">
                              {Math.round(h.total_arus_n)} A
                            </span>
                          </div>
                          <div>
                            <span className="text-[#94a3b8]">Teg R-N: </span>
                            <span className="font-mono text-[#e2e8f0]">
                              {Math.round(h.total_teg_rn)} V
                            </span>
                          </div>
                          <div>
                            <span className="text-[#94a3b8]">Teg S-N: </span>
                            <span className="font-mono text-[#e2e8f0]">
                              {Math.round(h.total_teg_sn)} V
                            </span>
                          </div>
                          <div>
                            <span className="text-[#94a3b8]">Teg T-N: </span>
                            <span className="font-mono text-[#e2e8f0]">
                              {Math.round(h.total_teg_tn)} V
                            </span>
                          </div>
                          <div>
                            <span className="text-[#94a3b8]">Suhu: </span>
                            <span
                              className={`font-mono font-semibold ${hHighTemp ? "text-amber-600" : "text-[#e2e8f0]"}`}
                            >
                              {h.suhu_trafo} °C
                            </span>
                          </div>
                          {h.total_teg_rs != null && (
                            <div>
                              <span className="text-[#94a3b8]">Teg R-S: </span>
                              <span className="font-mono text-[#e2e8f0]">
                                {Math.round(h.total_teg_rs)} V
                              </span>
                            </div>
                          )}
                          {h.total_teg_st != null && (
                            <div>
                              <span className="text-[#94a3b8]">Teg S-T: </span>
                              <span className="font-mono text-[#e2e8f0]">
                                {Math.round(h.total_teg_st)} V
                              </span>
                            </div>
                          )}
                          {h.total_teg_rt != null && (
                            <div>
                              <span className="text-[#94a3b8]">Teg R-T: </span>
                              <span className="font-mono text-[#e2e8f0]">
                                {Math.round(h.total_teg_rt)} V
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Per jurusan */}
                        {hJurusanKeys.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs whitespace-nowrap">
                              <thead>
                                <tr className="bg-gray-50 border-b border-[#1e3552]">
                                  <th className="text-left px-3 py-1.5 text-[#94a3b8] font-semibold">
                                    Jurusan
                                  </th>
                                  <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">
                                    Arus R (A)
                                  </th>
                                  <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">
                                    Arus S (A)
                                  </th>
                                  <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">
                                    Arus T (A)
                                  </th>
                                  <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">
                                    Arus N (A)
                                  </th>
                                  {hasTeg && (
                                    <>
                                      <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">
                                        Teg Ujung R (V)
                                      </th>
                                      <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">
                                        Teg Ujung S (V)
                                      </th>
                                      <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">
                                        Teg Ujung T (V)
                                      </th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {hJurusanKeys.map((k, ki) => {
                                  const jd = hPerjurusan[k];
                                  const a = jd?.arus ?? {
                                    R: 0,
                                    S: 0,
                                    T: 0,
                                    N: 0,
                                  };
                                  const teg = jd?.tegangan;
                                  const jHR = a.R > HIGH_CURRENT_A;
                                  const jHS = a.S > HIGH_CURRENT_A;
                                  const jHT = a.T > HIGH_CURRENT_A;
                                  return (
                                    <tr
                                      key={k}
                                      className={
                                        ki % 2 === 0
                                          ? "bg-[#162334]"
                                          : "bg-gray-50/50"
                                      }
                                    >
                                      <td className="px-3 py-1.5 font-bold text-[#e2e8f0]">
                                        {k}
                                      </td>
                                      <td
                                        className={`px-2 py-1.5 text-center font-mono ${jHR ? "text-red-600 font-semibold" : "text-[#94a3b8]"}`}
                                      >
                                        {Math.round(a.R)}
                                        {jHR && (
                                          <AlertTriangle
                                            size={8}
                                            className="inline ml-0.5"
                                          />
                                        )}
                                      </td>
                                      <td
                                        className={`px-2 py-1.5 text-center font-mono ${jHS ? "text-red-600 font-semibold" : "text-[#94a3b8]"}`}
                                      >
                                        {Math.round(a.S)}
                                        {jHS && (
                                          <AlertTriangle
                                            size={8}
                                            className="inline ml-0.5"
                                          />
                                        )}
                                      </td>
                                      <td
                                        className={`px-2 py-1.5 text-center font-mono ${jHT ? "text-red-600 font-semibold" : "text-[#94a3b8]"}`}
                                      >
                                        {Math.round(a.T)}
                                        {jHT && (
                                          <AlertTriangle
                                            size={8}
                                            className="inline ml-0.5"
                                          />
                                        )}
                                      </td>
                                      <td className="px-2 py-1.5 text-center font-mono text-[#94a3b8]">
                                        {Math.round(a.N ?? 0)}
                                      </td>
                                      {hasTeg && (
                                        <>
                                          <td className="px-2 py-1.5 text-center font-mono text-[#94a3b8]">
                                            {Math.round(teg?.R ?? 0)}
                                          </td>
                                          <td className="px-2 py-1.5 text-center font-mono text-[#94a3b8]">
                                            {Math.round(teg?.S ?? 0)}
                                          </td>
                                          <td className="px-2 py-1.5 text-center font-mono text-[#94a3b8]">
                                            {Math.round(teg?.T ?? 0)}
                                          </td>
                                        </>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {showKirimWA && (
        <KirimWAGarduModal
          data={row}
          onClose={() => setShowKirimWA(false)}
          onWoMarked={(sentAt) => onPatchRow?.(row.id, { wo_sent_at: sentAt })}
        />
      )}
    </>
  );
}
