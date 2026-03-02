"use client";

import { useState, useEffect } from "react";
import { X, Save, Plus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type PengukuranGardu } from "../_hooks/usePengukuranGardu";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JurusanRow {
  key: string;
  arusR: number; arusS: number; arusT: number; arusN: number;
  tegR: number; tegS: number; tegT: number;
}

type JurusanNumField = keyof Omit<JurusanRow, "key">;

interface Props {
  row: PengukuranGardu | null;
  onClose: () => void;
  onSaved: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INPUT = "border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-sm text-[#1B2631] bg-white focus:outline-none focus:border-[#00897B] focus:ring-1 focus:ring-[#00897B]/20 w-full";
const NUM_INPUT = `${INPUT} text-center font-mono`;

const JURUSAN_FIELDS: { field: JurusanNumField; label: string }[] = [
  { field: "arusR", label: "Arus R (A)" },
  { field: "arusS", label: "Arus S (A)" },
  { field: "arusT", label: "Arus T (A)" },
  { field: "arusN", label: "Arus N (A)" },
  { field: "tegR", label: "Teg Ujung R (V)" },
  { field: "tegS", label: "Teg Ujung S (V)" },
  { field: "tegT", label: "Teg Ujung T (V)" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function EditPengukuranModal({ row, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tanggal, setTanggal] = useState("");
  const [kvaTrfo, setKvaTrfo] = useState(0);
  const [penyulang, setPenyulang] = useState("");
  const [alamat, setAlamat] = useState("");
  const [arusR, setArusR] = useState(0);
  const [arusS, setArusS] = useState(0);
  const [arusT, setArusT] = useState(0);
  const [arusN, setArusN] = useState(0);
  const [tegRN, setTegRN] = useState(0);
  const [tegSN, setTegSN] = useState(0);
  const [tegTN, setTegTN] = useState(0);
  const [suhu, setSuhu] = useState(0);
  const [jurusanRows, setJurusanRows] = useState<JurusanRow[]>([]);

  // beban_kva dihitung otomatis dari arus × tegangan per fasa
  const bebanKva = (arusR * tegRN + arusS * tegSN + arusT * tegTN) / 1000;
  const persenBeban = kvaTrfo > 0 ? (bebanKva / kvaTrfo) * 100 : 0;

  useEffect(() => {
    if (!row) return;
    setTanggal(row.tanggal_pengukuran);
    setKvaTrfo(row.kva_trafo);
    setPenyulang(row.penyulang ?? "");
    setAlamat(row.alamat ?? "");
    setArusR(row.total_arus_r);
    setArusS(row.total_arus_s);
    setArusT(row.total_arus_t);
    setArusN(row.total_arus_n);
    setTegRN(row.total_teg_rn);
    setTegSN(row.total_teg_sn);
    setTegTN(row.total_teg_tn);
    setSuhu(row.suhu_trafo);
    const pj = row.perjurusan ?? {};
    setJurusanRows(
      Object.entries(pj)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, jd]) => ({
          key,
          arusR: jd?.arus?.R ?? 0,
          arusS: jd?.arus?.S ?? 0,
          arusT: jd?.arus?.T ?? 0,
          arusN: jd?.arus?.N ?? 0,
          tegR: jd?.tegangan?.R ?? 0,
          tegS: jd?.tegangan?.S ?? 0,
          tegT: jd?.tegangan?.T ?? 0,
        }))
    );
  }, [row]);

  if (!row) return null;

  function updateJurusan(idx: number, field: JurusanNumField, value: number) {
    setJurusanRows((prev) => prev.map((j, i) => i === idx ? { ...j, [field]: value } : j));
  }

  function updateJurusanKey(idx: number, value: string) {
    setJurusanRows((prev) => prev.map((j, i) => i === idx ? { ...j, key: value.toUpperCase() } : j));
  }

  function addJurusan() {
    setJurusanRows((prev) => [...prev, { key: "", arusR: 0, arusS: 0, arusT: 0, arusN: 0, tegR: 0, tegS: 0, tegT: 0 }]);
  }

  function removeJurusan(idx: number) {
    setJurusanRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!row) return;
    setSaving(true);
    setError(null);
    try {
      const perjurusan: Record<string, unknown> = {};
      for (const j of jurusanRows) {
        if (!j.key.trim()) continue;
        perjurusan[j.key.trim()] = {
          arus: { R: j.arusR, S: j.arusS, T: j.arusT, N: j.arusN },
          tegangan: { R: j.tegR, S: j.tegS, T: j.tegT },
        };
      }

      const { error: err } = await supabaseBrowser
        .from("pengukuran_gardu")
        .update({
          tanggal_pengukuran: tanggal,
          kva_trafo: kvaTrfo,
          penyulang: penyulang || null,
          alamat: alamat || null,
          total_arus_r: arusR,
          total_arus_s: arusS,
          total_arus_t: arusT,
          total_arus_n: arusN,
          total_teg_rn: tegRN,
          total_teg_sn: tegSN,
          total_teg_tn: tegTN,
          suhu_trafo: suhu,
          beban_kva: bebanKva,
          persen_beban: persenBeban,
          perjurusan,
        })
        .eq("id", row.id);

      if (err) throw err;
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-4xl bg-white z-[70] shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-linear-to-r from-[#004D40] to-[#00897B] px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Edit Pengukuran</h2>
            <p className="text-teal-100 text-sm mt-0.5">{row.no_gardu} · {row.tanggal_pengukuran}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
          )}

          {/* Info Dasar */}
          <section>
            <h3 className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wider mb-3">Info Dasar</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#5D6D7E] mb-1 block">Tanggal Pengukuran</label>
                <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-[#5D6D7E] mb-1 block">Kapasitas Trafo (KVA)</label>
                <input type="number" value={kvaTrfo} onChange={(e) => setKvaTrfo(Number(e.target.value))} className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-[#5D6D7E] mb-1 block">Penyulang</label>
                <input type="text" value={penyulang} onChange={(e) => setPenyulang(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-[#5D6D7E] mb-1 block">Alamat</label>
                <input type="text" value={alamat} onChange={(e) => setAlamat(e.target.value)} className={INPUT} />
              </div>
            </div>
          </section>

          {/* Arus Total */}
          <section>
            <h3 className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wider mb-3">Arus Total (A)</h3>
            <div className="grid grid-cols-4 gap-3">
              {([
                { label: "Fasa R", val: arusR, set: setArusR },
                { label: "Fasa S", val: arusS, set: setArusS },
                { label: "Fasa T", val: arusT, set: setArusT },
                { label: "Netral", val: arusN, set: setArusN },
              ] as const).map(({ label, val, set }) => (
                <div key={label}>
                  <label className="text-xs text-[#5D6D7E] mb-1 block">{label}</label>
                  <input type="number" step="0.1" value={val} onChange={(e) => set(Number(e.target.value))} className={NUM_INPUT} />
                </div>
              ))}
            </div>
          </section>

          {/* Tegangan Fase-Netral */}
          <section>
            <h3 className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wider mb-3">Tegangan Fase-Netral (V)</h3>
            <div className="grid grid-cols-3 gap-3">
              {([
                { label: "V R-N", val: tegRN, set: setTegRN },
                { label: "V S-N", val: tegSN, set: setTegSN },
                { label: "V T-N", val: tegTN, set: setTegTN },
              ] as const).map(({ label, val, set }) => (
                <div key={label}>
                  <label className="text-xs text-[#5D6D7E] mb-1 block">{label}</label>
                  <input type="number" step="0.1" value={val} onChange={(e) => set(Number(e.target.value))} className={NUM_INPUT} />
                </div>
              ))}
            </div>
          </section>

          {/* Beban & Suhu */}
          <section>
            <h3 className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wider mb-3">Beban & Suhu</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-[#5D6D7E] mb-1 block">Beban KVA (otomatis)</label>
                <div className="border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-center font-mono text-sm bg-gray-50 text-[#5D6D7E]">
                  {bebanKva.toFixed(2)} kVA
                </div>
              </div>
              <div>
                <label className="text-xs text-[#5D6D7E] mb-1 block">% Beban (otomatis)</label>
                <div className="border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-center font-mono text-sm bg-gray-50 text-[#5D6D7E]">
                  {persenBeban.toFixed(1)}%
                </div>
              </div>
              <div>
                <label className="text-xs text-[#5D6D7E] mb-1 block">Suhu Trafo (°C)</label>
                <input type="number" step="0.1" value={suhu} onChange={(e) => setSuhu(Number(e.target.value))} className={NUM_INPUT} />
              </div>
            </div>
          </section>

          {/* Per Jurusan */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wider">Per Jurusan</h3>
              <button
                onClick={addJurusan}
                className="flex items-center gap-1 text-xs text-[#00897B] hover:text-[#004D40] font-medium transition-colors"
              >
                <Plus size={12} /> Tambah Jurusan
              </button>
            </div>
            <div className="border border-[#E2E8F0] rounded-xl overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-[#E0F2F1]">
                    <th className="text-left px-3 py-2 text-[#00695C] font-semibold">Jur.</th>
                    {JURUSAN_FIELDS.map(({ label }) => (
                      <th key={label} className="text-center px-2 py-2 text-[#00695C] font-semibold">{label}</th>
                    ))}
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {jurusanRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-4 text-[#5D6D7E]">
                        Belum ada data jurusan — klik &quot;Tambah Jurusan&quot;
                      </td>
                    </tr>
                  ) : (
                    jurusanRows.map((j, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={j.key}
                            onChange={(e) => updateJurusanKey(idx, e.target.value)}
                            className="border border-[#E2E8F0] rounded px-2 py-1 text-xs w-12 text-center font-bold focus:outline-none focus:border-[#00897B]"
                            placeholder="A"
                          />
                        </td>
                        {JURUSAN_FIELDS.map(({ field }) => (
                          <td key={field} className="px-2 py-1.5">
                            <input
                              type="number"
                              step="0.1"
                              value={j[field]}
                              onChange={(e) => updateJurusan(idx, field, Number(e.target.value))}
                              className="border border-[#E2E8F0] rounded px-2 py-1 text-xs w-20 text-center font-mono focus:outline-none focus:border-[#00897B]"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => removeJurusan(idx)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#E2E8F0] flex items-center justify-end gap-3 shrink-0 bg-white">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#5D6D7E] border border-[#E2E8F0] rounded-lg hover:bg-gray-50 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <Save size={14} />
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </div>
    </>
  );
}
