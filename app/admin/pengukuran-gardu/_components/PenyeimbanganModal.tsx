"use client";

import { useState } from "react";
import { X, Save, Plus, Trash2, ArrowRight } from "lucide-react";
import type { PengukuranGardu, JurusanData } from "../_hooks/usePengukuranGardu";
import type {
  PenyeimbanganGardu,
  SavePenyeimbanganInput,
  UpdatePenyeimbanganInput,
} from "../_hooks/usePenyeimbangan";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JurusanRow {
  key: string;
  arusR: number; arusS: number; arusT: number; arusN: number;
}

type Props =
  | {
      mode: "new";
      row: PengukuranGardu;
      onClose: () => void;
      onSave: (input: SavePenyeimbanganInput) => Promise<string | null>;
    }
  | {
      mode: "edit";
      record: PenyeimbanganGardu;
      onClose: () => void;
      onUpdate: (input: UpdatePenyeimbanganInput) => Promise<string | null>;
    };

// ── Constants ─────────────────────────────────────────────────────────────────

const INPUT = "border border-[#1e3552] rounded-lg px-2.5 py-1.5 text-sm text-[#e2e8f0] bg-[#0d1b2a] focus:outline-none focus:border-[#00897B] focus:ring-1 focus:ring-[#00897B]/20 w-full";
const NUM   = `${INPUT} text-center font-mono`;
const NUM_SM = "border border-[#1e3552] rounded px-1.5 py-1 text-xs text-center font-mono w-20 bg-[#0d1b2a] text-[#e2e8f0] focus:outline-none focus:border-[#00897B]";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctColor(pct: number) {
  if (pct >= 80) return "text-red-400 font-bold";
  if (pct >= 60) return "text-amber-400 font-semibold";
  return "text-green-400 font-semibold";
}

function ArusRow({ label, r, s, t, n }: { label: string; r: number; s: number; t: number; n: number }) {
  return (
    <tr className="border-t border-[#1e3552]">
      <td className="px-3 py-1.5 text-xs text-[#94a3b8]">{label}</td>
      {[r, s, t, n].map((v, i) => (
        <td key={i} className="px-2 py-1.5 text-center font-mono text-xs text-[#e2e8f0]">{Math.round(v)}</td>
      ))}
    </tr>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PenyeimbanganModal(props: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const isEdit = props.mode === "edit";

  // Derive initial values depending on mode
  const initArusR = isEdit ? props.record.arus_r_after : props.row.total_arus_r;
  const initArusS = isEdit ? props.record.arus_s_after : props.row.total_arus_s;
  const initArusT = isEdit ? props.record.arus_t_after : props.row.total_arus_t;
  const initArusN = isEdit ? props.record.arus_n_after : props.row.total_arus_n;

  const beforeR   = isEdit ? props.record.arus_r_before   : props.row.total_arus_r;
  const beforeS   = isEdit ? props.record.arus_s_before   : props.row.total_arus_s;
  const beforeT   = isEdit ? props.record.arus_t_before   : props.row.total_arus_t;
  const beforeN   = isEdit ? props.record.arus_n_before   : props.row.total_arus_n;
  const beforePct = isEdit ? props.record.beban_pct_before : props.row.persen_beban;
  const kvaTrafo  = isEdit ? props.record.kva_trafo        : props.row.kva_trafo;
  const noGardu   = isEdit ? props.record.no_gardu         : props.row.no_gardu;
  const penyulang = isEdit ? props.record.penyulang        : props.row.penyulang;

  const initTeg = isEdit ? 220 : undefined; // edit: no stored tegangan, default 220

  const initJurusan = (): JurusanRow[] => {
    const source = isEdit
      ? props.record.perjurusan_after ?? {}
      : props.row.perjurusan ?? {};
    return Object.entries(source)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, jd]) => ({
        key,
        arusR: jd?.arus?.R ?? 0,
        arusS: jd?.arus?.S ?? 0,
        arusT: jd?.arus?.T ?? 0,
        arusN: jd?.arus?.N ?? 0,
      }));
  };

  // After state
  const [arusR, setArusR] = useState(initArusR);
  const [arusS, setArusS] = useState(initArusS);
  const [arusT, setArusT] = useState(initArusT);
  const [arusN, setArusN] = useState(initArusN);

  // Tegangan — untuk hitung beban
  const [tegRN, setTegRN] = useState(isEdit ? initTeg! : props.row.total_teg_rn);
  const [tegSN, setTegSN] = useState(isEdit ? initTeg! : props.row.total_teg_sn);
  const [tegTN, setTegTN] = useState(isEdit ? initTeg! : props.row.total_teg_tn);

  const [jurusanRows, setJurusanRows] = useState<JurusanRow[]>(initJurusan);
  const [tglPenyeimbangan, setTglPenyeimbangan] = useState(
    isEdit ? props.record.tgl_penyeimbangan : today
  );
  const [petugas, setPetugas] = useState(
    isEdit ? (props.record.petugas_penyeimbang ?? "") : ""
  );
  const [catatan, setCatatan] = useState(
    isEdit ? (props.record.catatan ?? "") : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live beban preview
  const bebanKvaAfter = (arusR * tegRN + arusS * tegSN + arusT * tegTN) / 1000;
  const bebanPctAfter = kvaTrafo > 0 ? (bebanKvaAfter / kvaTrafo) * 100 : 0;

  function updateJurusan(idx: number, field: keyof Omit<JurusanRow, "key">, val: number) {
    setJurusanRows((prev) => prev.map((j, i) => i === idx ? { ...j, [field]: val } : j));
  }

  function addJurusan() {
    setJurusanRows((prev) => [...prev, { key: "", arusR: 0, arusS: 0, arusT: 0, arusN: 0 }]);
  }

  function removeJurusan(idx: number) {
    setJurusanRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!tglPenyeimbangan) { setError("Tanggal penyeimbangan wajib diisi"); return; }
    setSaving(true);
    setError(null);

    const perjurusanAfter: Record<string, JurusanData> = {};
    for (const j of jurusanRows) {
      if (!j.key.trim()) continue;
      const prevSource = isEdit
        ? props.record.perjurusan_after?.[j.key.trim()]
        : props.row.perjurusan?.[j.key.trim()];
      perjurusanAfter[j.key.trim()] = {
        arus:     { R: j.arusR, S: j.arusS, T: j.arusT, N: j.arusN },
        tegangan: prevSource?.tegangan ?? { R: 0, S: 0, T: 0 },
      };
    }

    const common = {
      perjurusanAfter,
      arusRAfter: arusR, arusSAfter: arusS, arusTAfter: arusT, arusNAfter: arusN,
      tegRNAfter: tegRN, tegSNAfter: tegSN, tegTNAfter: tegTN,
      tglPenyeimbangan,
      petugasPenyeimbang: petugas,
      catatan,
    };

    let err: string | null;
    if (isEdit) {
      err = await props.onUpdate({
        id: props.record.id,
        pengukuranId: props.record.pengukuran_id,
        kvaTrafo,
        ...common,
      });
    } else {
      err = await props.onSave({ pengukuranRow: props.row, ...common });
    }

    setSaving(false);
    if (err) { setError(err); return; }
    props.onClose();
  }

  const beforePerjurusan = isEdit
    ? props.record.perjurusan_before ?? {}
    : props.row.perjurusan ?? {};

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={props.onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-4xl bg-[#162334] z-[70] shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">
              {isEdit ? "Edit Penyeimbangan Beban" : "Penyeimbangan Beban Gardu"}
            </h2>
            <p className="text-teal-100 text-sm mt-0.5">
              {noGardu} · {penyulang} · {kvaTrafo} kVA
            </p>
          </div>
          <button onClick={props.onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="bg-red-900/30 border border-red-500/40 rounded-lg p-3 text-red-300 text-sm">{error}</div>
          )}

          {/* Info Penyeimbangan */}
          <section>
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Info Penyeimbangan</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-[#94a3b8] mb-1 block">Tanggal Penyeimbangan *</label>
                <input type="date" value={tglPenyeimbangan} onChange={(e) => setTglPenyeimbangan(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-[#94a3b8] mb-1 block">Petugas Penyeimbang</label>
                <input type="text" value={petugas} onChange={(e) => setPetugas(e.target.value)} placeholder="Nama petugas..." className={INPUT} />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#94a3b8] mb-1 block">Catatan</label>
              <textarea
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Tindakan yang dilakukan, kondisi gardu, dll..."
                rows={2}
                className={`${INPUT} resize-none`}
              />
            </div>
          </section>

          {/* Perbandingan Beban Total */}
          <section>
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Beban Total — Sebelum vs Sesudah</h3>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">

              {/* Before — read-only */}
              <div className="bg-[#0d1b2a] rounded-xl border border-[#1e3552] p-3">
                <p className="text-[10px] text-red-400 uppercase font-bold mb-2 tracking-wider">Sebelum</p>
                <div className="overflow-hidden rounded-lg border border-[#1e3552]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#0a2a26]">
                        {["", "R", "S", "T", "N"].map((h) => (
                          <th key={h} className="px-2 py-1 text-[#5eead4] font-semibold text-center">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <ArusRow label="Arus (A)" r={beforeR} s={beforeS} t={beforeT} n={beforeN} />
                    </tbody>
                  </table>
                </div>
                <p className={`text-center text-lg mt-2 ${pctColor(beforePct)}`}>
                  {Math.round(beforePct)}%
                </p>
              </div>

              {/* Arrow */}
              <ArrowRight size={28} className="text-[#00897B] shrink-0" />

              {/* After — editable */}
              <div className="bg-[#0a2a26] rounded-xl border border-[#00897B]/40 p-3">
                <p className="text-[10px] text-green-400 uppercase font-bold mb-2 tracking-wider">Sesudah</p>
                <div className="overflow-hidden rounded-lg border border-[#1e3552]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#0a2a26]">
                        {["", "R", "S", "T", "N"].map((h) => (
                          <th key={h} className="px-2 py-1 text-[#5eead4] font-semibold text-center">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-[#1e3552]">
                        <td className="px-3 py-1 text-xs text-[#94a3b8] whitespace-nowrap">Arus (A)</td>
                        {([
                          [arusR, setArusR], [arusS, setArusS],
                          [arusT, setArusT], [arusN, setArusN],
                        ] as const).map(([val, setter], i) => (
                          <td key={i} className="px-1 py-1">
                            <input
                              type="number" step="0.1"
                              value={val as number}
                              onChange={(e) => (setter as (v: number) => void)(Number(e.target.value))}
                              className={NUM_SM}
                            />
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className={`text-center text-lg mt-2 ${pctColor(bebanPctAfter)}`}>
                  {bebanPctAfter.toFixed(1)}%
                </p>
              </div>
            </div>
          </section>

          {/* Tegangan */}
          <section>
            <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
              Tegangan Gardu (V)
              {isEdit && <span className="ml-2 text-[10px] font-normal text-[#4a5568] normal-case">— untuk hitung ulang % beban</span>}
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {([["R-N", tegRN, setTegRN], ["S-N", tegSN, setTegSN], ["T-N", tegTN, setTegTN]] as const).map(([label, val, setter]) => (
                <div key={label}>
                  <label className="text-xs text-[#94a3b8] mb-1 block">{label}</label>
                  <input type="number" step="0.1" value={val}
                    onChange={(e) => setter(Number(e.target.value))}
                    className={NUM}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Per Jurusan */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Per Jurusan — Sesudah</h3>
              <button onClick={addJurusan} className="flex items-center gap-1 text-xs text-[#00897B] hover:text-[#004D40] font-medium">
                <Plus size={12} /> Tambah Jurusan
              </button>
            </div>

            <div className="border border-[#1e3552] rounded-xl overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-[#0a2a26]">
                    <th className="text-left px-3 py-2 text-[#5eead4] font-semibold">Jur.</th>
                    {["Arus R (A)", "Arus S (A)", "Arus T (A)", "Arus N (A)"].map((h) => (
                      <th key={h} className="text-center px-2 py-2 text-[#5eead4] font-semibold">{h}</th>
                    ))}
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {jurusanRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-[#94a3b8]">Belum ada jurusan</td>
                    </tr>
                  ) : jurusanRows.map((j, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-[#162334]" : "bg-[#0d1b2a]"}>
                      <td className="px-2 py-1.5">
                        <input type="text" value={j.key}
                          onChange={(e) => setJurusanRows((prev) => prev.map((x, i) => i === idx ? { ...x, key: e.target.value.toUpperCase() } : x))}
                          className="border border-[#1e3552] rounded px-2 py-1 text-xs w-12 text-center font-bold focus:outline-none focus:border-[#00897B] bg-[#0d1b2a] text-[#e2e8f0]"
                          placeholder="A"
                        />
                      </td>
                      {(["arusR", "arusS", "arusT", "arusN"] as const).map((field) => (
                        <td key={field} className="px-2 py-1.5">
                          <input type="number" step="0.1" value={j[field]}
                            onChange={(e) => updateJurusan(idx, field, Number(e.target.value))}
                            className={NUM_SM}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => removeJurusan(idx)} className="text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tabel sebelum (read-only) */}
            {Object.keys(beforePerjurusan).length > 0 && (
              <div className="mt-3 border border-[#1e3552]/50 rounded-xl overflow-x-auto opacity-60">
                <p className="px-3 py-1.5 text-[10px] text-red-400 font-semibold uppercase tracking-wider bg-[#0a1628]">
                  Data Sebelum (Read-only)
                </p>
                <table className="w-full text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-[#0a2a26]">
                      <th className="text-left px-3 py-1.5 text-[#5eead4]">Jur.</th>
                      {["R (A)", "S (A)", "T (A)", "N (A)"].map((h) => (
                        <th key={h} className="text-center px-2 py-1.5 text-[#5eead4]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(beforePerjurusan).sort(([a],[b]) => a.localeCompare(b)).map(([key, jd], i) => (
                      <tr key={key} className={i % 2 === 0 ? "bg-[#162334]" : "bg-[#0d1b2a]"}>
                        <td className="px-3 py-1 font-bold text-[#e2e8f0]">{key}</td>
                        {[jd?.arus?.R ?? 0, jd?.arus?.S ?? 0, jd?.arus?.T ?? 0, jd?.arus?.N ?? 0].map((v, vi) => (
                          <td key={vi} className="px-2 py-1 text-center font-mono text-[#94a3b8]">{Math.round(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#1e3552] flex items-center justify-end gap-3 shrink-0 bg-[#162334]">
          <button onClick={props.onClose} className="px-4 py-2 text-sm text-[#94a3b8] border border-[#1e3552] rounded-lg hover:bg-[#0d1b2a] transition-colors">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            <Save size={14} />
            {saving ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan Penyeimbangan"}
          </button>
        </div>
      </div>
    </>
  );
}
