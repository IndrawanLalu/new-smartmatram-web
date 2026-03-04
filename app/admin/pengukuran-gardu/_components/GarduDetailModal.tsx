"use client";

import { useState } from "react";
import { X, AlertTriangle, Thermometer, Zap, History, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { type PengukuranGardu, HIGH_CURRENT_A, HIGH_TEMP_C, OVERLOAD_PCT } from "../_hooks/usePengukuranGardu";

// ── Helpers ───────────────────────────────────────────────────────────────────

function val(v: number | null | undefined) {
  return v != null ? Math.round(v) : "—";
}

function ArusHighlight({ v, threshold = HIGH_CURRENT_A }: { v: number; threshold?: number }) {
  const high = v > threshold;
  return (
    <span className={`font-mono font-semibold ${high ? "text-red-600" : "text-[#e2e8f0]"}`}>
      {Math.round(v)}
      {high && <AlertTriangle size={10} className="inline ml-0.5 text-red-500" />}
    </span>
  );
}

function StatBox({ label, value, unit = "" }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="bg-[#0d1b2a] rounded-lg px-3 py-2.5 text-center">
      <p className="text-xs text-[#94a3b8] mb-0.5">{label}</p>
      <p className="text-base font-bold text-[#e2e8f0]">
        {value}<span className="text-xs font-normal text-[#94a3b8] ml-0.5">{unit}</span>
      </p>
    </div>
  );
}

function BebanBar({ pct }: { pct: number }) {
  const color = pct >= OVERLOAD_PCT ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-3">
        <div className={`h-3 rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-sm font-bold w-12 text-right ${pct >= OVERLOAD_PCT ? "text-red-600" : pct >= 60 ? "text-amber-600" : "text-green-600"}`}>
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
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GarduDetailModal({ row, onClose, onEdit, allData }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!row) return null;

  const perjurusan = row.perjurusan ?? {};
  const jurusanKeys = Object.keys(perjurusan).sort();
  const isOverload = row.persen_beban >= OVERLOAD_PCT;
  const isHighTemp = row.suhu_trafo > HIGH_TEMP_C;

  const history = allData
    ?.filter((d) => d.no_gardu === row.no_gardu)
    .sort((a, b) => b.tanggal_pengukuran.localeCompare(a.tanggal_pengukuran)) ?? [];

  return (
    <>
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
            </div>
            <p className="text-teal-100 text-sm mt-0.5">
              {row.penyulang ?? "—"} · {row.petugas_unit}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Informasi Gardu</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-[#94a3b8]">Alamat</p>
                <p className="font-medium text-[#e2e8f0]">{row.alamat ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-[#94a3b8]">Kapasitas Trafo</p>
                <p className="font-medium text-[#e2e8f0]">{row.kva_trafo} KVA</p>
              </div>
              <div>
                <p className="text-xs text-[#94a3b8]">Tanggal Pengukuran</p>
                <p className="font-medium text-[#e2e8f0]">{row.tanggal_pengukuran}</p>
              </div>
              <div>
                <p className="text-xs text-[#94a3b8]">Petugas</p>
                <p className="font-medium text-[#e2e8f0]">{row.petugas_nama ?? "—"}</p>
              </div>
            </div>
          </section>

          {/* Beban Trafo */}
          <section>
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Beban Trafo</h3>
            <div className="bg-[#162334] border border-[#1e3552] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#94a3b8]">
                  {Math.round(row.beban_kva)} KVA / {row.kva_trafo} KVA
                </span>
                <span className={`text-sm font-bold ${isOverload ? "text-red-600" : "text-[#e2e8f0]"}`}>
                  {isOverload ? "⚠ OVERLOAD" : "Normal"}
                </span>
              </div>
              <BebanBar pct={row.persen_beban} />
            </div>
          </section>

          {/* Pengukuran Total */}
          <section>
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Pengukuran Total</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-[#94a3b8] mb-1.5 flex items-center gap-1">
                  <Zap size={11} /> Arus (Ampere)
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <StatBox label="Fasa R" value={<ArusHighlight v={row.total_arus_r} />} unit="A" />
                  <StatBox label="Fasa S" value={<ArusHighlight v={row.total_arus_s} />} unit="A" />
                  <StatBox label="Fasa T" value={<ArusHighlight v={row.total_arus_t} />} unit="A" />
                  <StatBox label="Netral" value={val(row.total_arus_n)} unit="A" />
                </div>
              </div>
              <div>
                <p className="text-xs text-[#94a3b8] mb-1.5">Tegangan Fase-Netral (Volt)</p>
                <div className="grid grid-cols-3 gap-2">
                  <StatBox label="V R-N" value={val(row.total_teg_rn)} unit="V" />
                  <StatBox label="V S-N" value={val(row.total_teg_sn)} unit="V" />
                  <StatBox label="V T-N" value={val(row.total_teg_tn)} unit="V" />
                </div>
              </div>
              <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${isHighTemp ? "bg-amber-50 border-amber-200" : "bg-[#0d1b2a] border-[#1e3552]"}`}>
                <div className="flex items-center gap-2">
                  <Thermometer size={16} className={isHighTemp ? "text-amber-600" : "text-[#94a3b8]"} />
                  <span className={`text-sm font-medium ${isHighTemp ? "text-amber-700" : "text-[#94a3b8]"}`}>
                    Suhu Trafo
                  </span>
                  {isHighTemp && <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-semibold">TINGGI</span>}
                </div>
                <span className={`text-xl font-bold ${isHighTemp ? "text-amber-600" : "text-[#e2e8f0]"}`}>
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
                      <th className="text-left px-4 py-2.5 text-xs text-[#5eead4] font-semibold">Jurusan</th>
                      <th className="text-center px-3 py-2.5 text-xs text-[#5eead4] font-semibold">Arus R (A)</th>
                      <th className="text-center px-3 py-2.5 text-xs text-[#5eead4] font-semibold">Arus S (A)</th>
                      <th className="text-center px-3 py-2.5 text-xs text-[#5eead4] font-semibold">Arus T (A)</th>
                      <th className="text-center px-3 py-2.5 text-xs text-[#5eead4] font-semibold">Arus N (A)</th>
                      <th className="text-center px-3 py-2.5 text-xs text-[#5eead4] font-semibold">Status</th>
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
                          <td className="px-4 py-3 font-bold text-[#e2e8f0]">{key}</td>
                          <td className={`px-3 py-3 text-center ${highR ? "bg-red-50" : ""}`}>
                            <span className={`font-mono text-sm font-semibold ${highR ? "text-red-600" : "text-[#e2e8f0]"}`}>
                              {Math.round(arus.R)}{highR && <AlertTriangle size={10} className="inline ml-0.5" />}
                            </span>
                          </td>
                          <td className={`px-3 py-3 text-center ${highS ? "bg-red-50" : ""}`}>
                            <span className={`font-mono text-sm font-semibold ${highS ? "text-red-600" : "text-[#e2e8f0]"}`}>
                              {Math.round(arus.S)}{highS && <AlertTriangle size={10} className="inline ml-0.5" />}
                            </span>
                          </td>
                          <td className={`px-3 py-3 text-center ${highT ? "bg-red-50" : ""}`}>
                            <span className={`font-mono text-sm font-semibold ${highT ? "text-red-600" : "text-[#e2e8f0]"}`}>
                              {Math.round(arus.T)}{highT && <AlertTriangle size={10} className="inline ml-0.5" />}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-mono text-sm text-[#94a3b8]">
                            {Math.round(arus.N ?? 0)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {anyHigh ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                <AlertTriangle size={9} /> {Math.round(maxArus)}A
                              </span>
                            ) : maxArus > 0 ? (
                              <span className="text-xs text-green-600 font-semibold">✓ Normal</span>
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
                    <p className="text-xs font-semibold text-[#94a3b8] mb-2">Tegangan Ujung per Jurusan (V)</p>
                    <div className="grid grid-cols-5 gap-2">
                      {jurusanKeys.map((key) => {
                        const teg = perjurusan[key]?.tegangan;
                        if (!teg) return null;
                        return (
                          <div key={key} className="bg-[#162334] rounded-lg p-2 text-center border border-[#1e3552]">
                            <p className="text-xs font-bold text-[#5eead4]">{key}</p>
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
                {historyOpen ? <ChevronUp size={14} className="text-[#94a3b8]" /> : <ChevronDown size={14} className="text-[#94a3b8]" />}
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
                    const hasTeg = hJurusanKeys.some((k) => hPerjurusan[k]?.tegangan);

                    return (
                      <div
                        key={h.id}
                        className={`border rounded-xl overflow-hidden ${isLatest ? "border-[#00897B]" : "border-[#1e3552]"}`}
                      >
                        {/* Entry header */}
                        <div className={`px-4 py-2.5 flex items-center justify-between ${isLatest ? "bg-teal-50" : "bg-[#0d1b2a]"}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#e2e8f0]">{h.tanggal_pengukuran}</span>
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
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-3 text-xs">
                              <span className={`font-bold font-mono ${hOverload ? "text-red-600" : "text-[#00897B]"}`}>
                                {Math.round(h.persen_beban)}% · {Math.round(h.beban_kva)} KVA
                              </span>
                              <span className={`font-mono ${hHighTemp ? "text-amber-600 font-semibold" : "text-[#94a3b8]"}`}>
                                {h.suhu_trafo}°C
                              </span>
                              <span className="text-[#94a3b8]">{h.petugas_nama ?? "—"}</span>
                            </div>
                            <button
                              onClick={() => onEdit(h)}
                              className="flex items-center gap-1 text-[10px] text-[#00897B] hover:text-[#004D40] font-semibold transition-colors border border-[#00897B]/30 rounded px-1.5 py-0.5"
                            >
                              <Pencil size={9} /> Edit
                            </button>
                          </div>
                        </div>

                        {/* Pengukuran total grid */}
                        <div className="px-4 py-2.5 grid grid-cols-4 gap-x-6 gap-y-1 text-xs border-b border-[#1e3552] bg-[#162334]">
                          <div><span className="text-[#94a3b8]">Arus R: </span><span className={`font-mono font-semibold ${hHighR ? "text-red-600" : "text-[#e2e8f0]"}`}>{Math.round(h.total_arus_r)} A{hHighR && <AlertTriangle size={9} className="inline ml-0.5" />}</span></div>
                          <div><span className="text-[#94a3b8]">Arus S: </span><span className={`font-mono font-semibold ${hHighS ? "text-red-600" : "text-[#e2e8f0]"}`}>{Math.round(h.total_arus_s)} A{hHighS && <AlertTriangle size={9} className="inline ml-0.5" />}</span></div>
                          <div><span className="text-[#94a3b8]">Arus T: </span><span className={`font-mono font-semibold ${hHighT ? "text-red-600" : "text-[#e2e8f0]"}`}>{Math.round(h.total_arus_t)} A{hHighT && <AlertTriangle size={9} className="inline ml-0.5" />}</span></div>
                          <div><span className="text-[#94a3b8]">Arus N: </span><span className="font-mono text-[#e2e8f0]">{Math.round(h.total_arus_n)} A</span></div>
                          <div><span className="text-[#94a3b8]">Teg R-N: </span><span className="font-mono text-[#e2e8f0]">{Math.round(h.total_teg_rn)} V</span></div>
                          <div><span className="text-[#94a3b8]">Teg S-N: </span><span className="font-mono text-[#e2e8f0]">{Math.round(h.total_teg_sn)} V</span></div>
                          <div><span className="text-[#94a3b8]">Teg T-N: </span><span className="font-mono text-[#e2e8f0]">{Math.round(h.total_teg_tn)} V</span></div>
                          <div><span className="text-[#94a3b8]">Suhu: </span><span className={`font-mono font-semibold ${hHighTemp ? "text-amber-600" : "text-[#e2e8f0]"}`}>{h.suhu_trafo} °C</span></div>
                        </div>

                        {/* Per jurusan */}
                        {hJurusanKeys.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs whitespace-nowrap">
                              <thead>
                                <tr className="bg-gray-50 border-b border-[#1e3552]">
                                  <th className="text-left px-3 py-1.5 text-[#94a3b8] font-semibold">Jurusan</th>
                                  <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">Arus R (A)</th>
                                  <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">Arus S (A)</th>
                                  <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">Arus T (A)</th>
                                  <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">Arus N (A)</th>
                                  {hasTeg && (
                                    <>
                                      <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">Teg Ujung R (V)</th>
                                      <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">Teg Ujung S (V)</th>
                                      <th className="text-center px-2 py-1.5 text-[#94a3b8] font-semibold">Teg Ujung T (V)</th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {hJurusanKeys.map((k, ki) => {
                                  const jd = hPerjurusan[k];
                                  const a = jd?.arus ?? { R: 0, S: 0, T: 0, N: 0 };
                                  const teg = jd?.tegangan;
                                  const jHR = a.R > HIGH_CURRENT_A;
                                  const jHS = a.S > HIGH_CURRENT_A;
                                  const jHT = a.T > HIGH_CURRENT_A;
                                  return (
                                    <tr key={k} className={ki % 2 === 0 ? "bg-[#162334]" : "bg-gray-50/50"}>
                                      <td className="px-3 py-1.5 font-bold text-[#e2e8f0]">{k}</td>
                                      <td className={`px-2 py-1.5 text-center font-mono ${jHR ? "text-red-600 font-semibold" : "text-[#94a3b8]"}`}>
                                        {Math.round(a.R)}{jHR && <AlertTriangle size={8} className="inline ml-0.5" />}
                                      </td>
                                      <td className={`px-2 py-1.5 text-center font-mono ${jHS ? "text-red-600 font-semibold" : "text-[#94a3b8]"}`}>
                                        {Math.round(a.S)}{jHS && <AlertTriangle size={8} className="inline ml-0.5" />}
                                      </td>
                                      <td className={`px-2 py-1.5 text-center font-mono ${jHT ? "text-red-600 font-semibold" : "text-[#94a3b8]"}`}>
                                        {Math.round(a.T)}{jHT && <AlertTriangle size={8} className="inline ml-0.5" />}
                                      </td>
                                      <td className="px-2 py-1.5 text-center font-mono text-[#94a3b8]">{Math.round(a.N ?? 0)}</td>
                                      {hasTeg && (
                                        <>
                                          <td className="px-2 py-1.5 text-center font-mono text-[#94a3b8]">{Math.round(teg?.R ?? 0)}</td>
                                          <td className="px-2 py-1.5 text-center font-mono text-[#94a3b8]">{Math.round(teg?.S ?? 0)}</td>
                                          <td className="px-2 py-1.5 text-center font-mono text-[#94a3b8]">{Math.round(teg?.T ?? 0)}</td>
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
    </>
  );
}
