"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { type CurrentUser, canSeeAllUnits, UNITS } from "@/lib/roles";
import { useRoles } from "@/app/admin/_hooks/useRoles";
import { parseClipboardTable } from "@/lib/parseClipboardTable";
import { normalizeMeasureCell } from "@/lib/parseLocaleNumber";
import { fetchSheetValues, extractSpreadsheetId } from "@/lib/sheets";
import {
  MONTHS,
  guessType,
  guessReguCol,
  guessTitleCol,
  guessMeasureCol,
  guessVerifierCol,
  autoMatchRole,
} from "../_constants";
import type { WoColumn, WoSheetSync } from "../_types";
import type { CreateBatchInput } from "../_hooks/useWorkOrderBatches";
import ColumnMapper from "./ColumnMapper";

interface CreateBatchModalProps {
  user: CurrentUser;
  defaultBulan: number;
  defaultTahun: number;
  onClose: () => void;
  onCreate: (input: CreateBatchInput) => Promise<string>;
}

const NOW_YEAR = new Date().getFullYear();
const YEARS = [NOW_YEAR - 1, NOW_YEAR, NOW_YEAR + 1];

export default function CreateBatchModal({
  user,
  defaultBulan,
  defaultTahun,
  onClose,
  onCreate,
}: CreateBatchModalProps) {
  const router = useRouter();
  const isUP3 = canSeeAllUnits(user.role);
  const { eksekutorRoles, verifierRoles } = useRoles();

  const [step, setStep] = useState<1 | 2>(1);
  const [judul, setJudul] = useState("");
  const [bulan, setBulan] = useState(defaultBulan);
  const [tahun, setTahun] = useState(defaultTahun);
  const [ulp, setUlp] = useState<string>(user.unit ?? UNITS[0].value);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Ditangkap saat "Baca Tabel"
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [columns, setColumns] = useState<WoColumn[]>([]);
  const [reguColKey, setReguColKey] = useState<string | null>(null);
  const [titleColKey, setTitleColKey] = useState<string | null>(null);
  const [measureColKey, setMeasureColKey] = useState<string | null>(null);
  const [measureUnit, setMeasureUnit] = useState("kms");
  const [verifierColKey, setVerifierColKey] = useState<string | null>(null);
  const [reguOverride, setReguOverride] = useState<Record<string, string>>({});

  // Sumber "Dari Sheet"
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetTabInput, setSheetTabInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetTab, setSheetTab] = useState<string | null>(null);

  const reguIdx = reguColKey ? Number(reguColKey.slice(1)) : -1;

  const distinctRegu = useMemo(() => {
    if (reguIdx < 0) return [];
    const s = new Set<string>();
    for (const row of dataRows) {
      const v = (row[reguIdx] ?? "").trim();
      if (v) s.add(v);
    }
    return [...s];
  }, [dataRows, reguIdx]);

  // Peta efektif: override manual di atas auto-match
  const reguMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const v of distinctRegu) m[v] = reguOverride[v] ?? autoMatchRole(v, eksekutorRoles);
    return m;
  }, [distinctRegu, reguOverride, eksekutorRoles]);

  function applyTable(headers: string[], rows: string[][]) {
    const cols: WoColumn[] = headers.map((h, i) => ({
      key: `c${i}`,
      label: h || `Kolom ${i + 1}`,
      type: guessType(h),
      hidden: false,
    }));
    const mCol = guessMeasureCol(headers);
    if (mCol) {
      const mi = Number(mCol.slice(1));
      if (cols[mi]) cols[mi].type = "number";
    }
    setDataRows(rows);
    setColumns(cols);
    setReguColKey(guessReguCol(headers));
    setTitleColKey(guessTitleCol(headers));
    setMeasureColKey(mCol);
    setVerifierColKey(guessVerifierCol(headers));
    setReguOverride({});
    setError(null);
    setStep(2);
  }

  function handleBaca() {
    const t = parseClipboardTable(raw);
    if (t.headers.length === 0 || t.rows.length === 0) {
      setError("Tidak ada tabel terbaca. Copy dari Excel/Sheet termasuk baris header.");
      return;
    }
    setSheetId(null);
    setSheetTab(null); // paste = tidak tertaut Sheet
    applyTable(t.headers, t.rows);
  }

  async function handleImportSheet() {
    const id = extractSpreadsheetId(sheetUrl);
    if (!id || !sheetTabInput.trim()) {
      setError("Isi URL/ID Spreadsheet dan nama tab.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const values = await fetchSheetValues(id, sheetTabInput.trim());
      const headers = (values[0] ?? []).map((h) => String(h).trim());
      const rows = values.slice(1).filter((r) => r.some((c) => String(c).trim()));
      if (headers.length === 0 || rows.length === 0) {
        setError("Tab kosong atau tidak terbaca.");
        return;
      }
      setSheetId(id);
      setSheetTab(sheetTabInput.trim());
      if (!judul.trim()) setJudul(sheetTabInput.trim());
      applyTable(headers, rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal impor dari Sheet.");
    } finally {
      setImporting(false);
    }
  }

  async function handleSave() {
    if (!judul.trim()) return setError("Judul WO wajib diisi.");
    setSaving(true);
    setError(null);
    try {
      const measureIdx = measureColKey ? Number(measureColKey.slice(1)) : -1;
      const verifierIdx = verifierColKey ? Number(verifierColKey.slice(1)) : -1;

      // Deteksi tautan Sheet untuk tulis-balik (kunci NO_WO+NO, tulis TGL REALISASI + VERIFIKATOR)
      const noWoIdx = sheetId ? columns.findIndex((c) => c.label.trim().toUpperCase() === "NO_WO") : -1;
      const noIdx = sheetId ? columns.findIndex((c) => c.label.trim().toUpperCase() === "NO") : -1;
      let sheetSync: WoSheetSync | null = null;
      if (sheetId) {
        const keyCols: string[] = [];
        if (noWoIdx >= 0) keyCols.push("NO_WO");
        if (noIdx >= 0) keyCols.push("NO");
        const write: Record<string, string> = {};
        const tglIdx = columns.findIndex((c) => /tgl\s*realisasi/i.test(c.label));
        if (tglIdx >= 0) write[columns[tglIdx].label.trim()] = "tgl_realisasi";
        const verWbIdx = columns.findIndex((c) => /verifikator/i.test(c.label));
        if (verWbIdx >= 0) write[columns[verWbIdx].label.trim()] = "verified_by";
        if (keyCols.length && Object.keys(write).length) sheetSync = { keyCols, write };
      }

      const rows = dataRows.map((row) => {
        const data: Record<string, string> = {};
        columns.forEach((c, i) => {
          const cell = (row[i] ?? "").trim();
          data[c.key] = i === measureIdx ? normalizeMeasureCell(cell) : cell;
        });
        const reguVal = reguIdx >= 0 ? (row[reguIdx] ?? "").trim() : "";
        const verVal = verifierIdx >= 0 ? (row[verifierIdx] ?? "").trim() : "";
        const sheetKey = sheetSync
          ? {
              ...(noWoIdx >= 0 ? { NO_WO: (row[noWoIdx] ?? "").trim() } : {}),
              ...(noIdx >= 0 ? { NO: (row[noIdx] ?? "").trim() } : {}),
            }
          : null;
        return {
          data,
          regu: reguVal ? reguMap[reguVal] || null : null,
          verifierRole: verVal ? autoMatchRole(verVal, verifierRoles) || null : null,
          sheetKey,
        };
      });
      const id = await onCreate({
        ulp,
        bulan,
        tahun,
        judul: judul.trim(),
        columns,
        reguColumn: reguColKey,
        verifierColumn: verifierColKey,
        titleColumn: titleColKey,
        measureColumn: measureColKey,
        measureUnit: measureColKey ? (measureUnit.trim() || "kms") : null,
        sheetId: sheetSync ? sheetId : null,
        sheetTab: sheetSync ? sheetTab : null,
        sheetSync,
        rows,
      });
      router.push(`/admin/work-order/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan WO.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="font-bold text-[#1B2631]">Buat Work Order</h2>
            <p className="text-xs text-[#5D6D7E]">Langkah {step} dari 2 — {step === 1 ? "info & tempel data" : "konfigurasi kolom & regu"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {step === 1 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-[#5D6D7E]">Judul WO</label>
                  <input
                    value={judul}
                    onChange={(e) => setJudul(e.target.value)}
                    placeholder="mis. Pemeliharaan Jaringan Juli 2026"
                    className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#5D6D7E]">Bulan</label>
                  <select
                    value={bulan}
                    onChange={(e) => setBulan(Number(e.target.value))}
                    className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B]"
                  >
                    {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#5D6D7E]">Tahun</label>
                  <select
                    value={tahun}
                    onChange={(e) => setTahun(Number(e.target.value))}
                    className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B]"
                  >
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                {isUP3 && (
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-[#5D6D7E]">ULP</label>
                    <select
                      value={ulp}
                      onChange={(e) => setUlp(e.target.value)}
                      className="mt-1 w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B]"
                    >
                      {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-[#5D6D7E]">
                  Tempel data dari Excel/Sheet (termasuk baris header)
                </label>
                <textarea
                  value={raw}
                  onChange={(e) => { setRaw(e.target.value); setError(null); }}
                  placeholder={"No\tUraian Pekerjaan\tPenyulang\tRegu\n1\tGanti isolator\tGunung Sari\tHARJAR\n2\tRabas pohon\tAmpenan\tPERABASAN"}
                  className="mt-1 w-full h-40 rounded-lg p-3 text-xs font-mono bg-[#0d1b2a] text-[#e2e8f0] border border-[#1e3552] focus:outline-none focus:border-[#00897B] resize-none placeholder:text-[#475569]"
                />
              </div>

              {/* Atau impor dari Google Sheet (aktifkan tulis-balik) */}
              <div className="rounded-lg border border-dashed border-[#B2DFDB] bg-[#E0F2F1]/40 p-3">
                <p className="text-xs font-semibold text-[#00695C] mb-2">Atau impor langsung dari Google Sheet</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="Tempel URL / ID spreadsheet"
                    className="flex-1 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#00897B]"
                  />
                  <input
                    value={sheetTabInput}
                    onChange={(e) => setSheetTabInput(e.target.value)}
                    placeholder="Nama tab (mis. WO_INS_JTM_T1)"
                    className="w-full sm:w-56 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#00897B]"
                  />
                  <button
                    type="button"
                    onClick={handleImportSheet}
                    disabled={importing || !sheetUrl.trim() || !sheetTabInput.trim()}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm bg-[#00897B] text-white rounded-lg font-medium disabled:opacity-40 shrink-0"
                  >
                    {importing && <Loader2 size={14} className="animate-spin" />} Tarik
                  </button>
                </div>
                <p className="text-[11px] text-[#5D6D7E] mt-1.5">
                  Kalau ada kolom <b>NO_WO</b>, <b>NO</b>, <b>TGL REALISASI</b>, <b>VERIFIKATOR</b> → tulis-balik otomatis aktif.
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[#00695C] bg-[#E0F2F1] rounded-lg px-3 py-2">
                {dataRows.length} baris terbaca · {columns.length} kolom
              </p>
              <ColumnMapper
                columns={columns}
                setColumns={setColumns}
                reguColKey={reguColKey}
                setReguColKey={setReguColKey}
                titleColKey={titleColKey}
                setTitleColKey={setTitleColKey}
                measureColKey={measureColKey}
                setMeasureColKey={setMeasureColKey}
                measureUnit={measureUnit}
                setMeasureUnit={setMeasureUnit}
                verifierColKey={verifierColKey}
                setVerifierColKey={setVerifierColKey}
                eksekutorRoles={eksekutorRoles}
                distinctRegu={distinctRegu}
                reguMap={reguMap}
                onReguMapChange={(v, role) => setReguOverride((p) => ({ ...p, [v]: role }))}
              />
            </>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E2E8F0]">
          {step === 2 ? (
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-sm text-[#5D6D7E] hover:text-[#1B2631]"
            >
              <ArrowLeft size={15} /> Kembali
            </button>
          ) : <span />}

          {step === 1 ? (
            <button
              onClick={handleBaca}
              disabled={!raw.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-linear-to-r from-[#004D40] to-[#00897B] text-white disabled:opacity-40"
            >
              Baca Tabel <ArrowRight size={15} />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-linear-to-r from-[#004D40] to-[#00897B] text-white disabled:opacity-40"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              Simpan WO
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
