"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { MONTHS } from "../_constants";
import type { UpdateBatchInput, WoBatch, WoColumn } from "../_types";
import ColumnMapper from "./ColumnMapper";

interface EditBatchModalProps {
  batch: WoBatch;
  onClose: () => void;
  onSave: (input: UpdateBatchInput) => Promise<boolean>;
}

const NOW_YEAR = new Date().getFullYear();
const YEARS = [NOW_YEAR - 1, NOW_YEAR, NOW_YEAR + 1];
const FIELD =
  "mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15";

export default function EditBatchModal({ batch, onClose, onSave }: EditBatchModalProps) {
  const [judul, setJudul] = useState(batch.judul);
  const [bulan, setBulan] = useState(batch.bulan);
  const [tahun, setTahun] = useState(batch.tahun);
  const [columns, setColumns] = useState<WoColumn[]>(batch.columns);
  const [reguColKey, setReguColKey] = useState(batch.regu_column);
  const [titleColKey, setTitleColKey] = useState(batch.title_column);
  const [measureColKey, setMeasureColKey] = useState(batch.measure_column);
  const [measureUnit, setMeasureUnit] = useState(batch.measure_unit ?? "kms");
  const [verifierColKey, setVerifierColKey] = useState(batch.verifier_column);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!judul.trim()) {
      setError("Judul WO wajib diisi.");
      return;
    }
    setSaving(true);
    setError(null);
    const ok = await onSave({
      judul: judul.trim(),
      bulan,
      tahun,
      columns,
      reguColumn: reguColKey,
      verifierColumn: verifierColKey,
      titleColumn: titleColKey,
      measureColumn: measureColKey,
      measureUnit: measureColKey ? measureUnit.trim() || "kms" : null,
    });
    if (ok) onClose();
    else setSaving(false);
  }

  return (
    <ModalShell
      title="Ubah Work Order"
      subtitle="Judul, periode, dan pemetaan kolom. Data baris tidak terpengaruh."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="text-sm text-ink-soft hover:text-ink">
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-navy-600 hover:bg-navy-500 text-white disabled:opacity-40"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Simpan Perubahan
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-ink-soft">Judul WO</label>
          <input value={judul} onChange={(e) => setJudul(e.target.value)} className={FIELD} />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-soft">Bulan</label>
          <select value={bulan} onChange={(e) => setBulan(Number(e.target.value))} className={FIELD}>
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-soft">Tahun</label>
          <select value={tahun} onChange={(e) => setTahun(Number(e.target.value))} className={FIELD}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <p className="text-xs text-ink-soft bg-accent-tint rounded-lg px-3 py-2">
        Mengubah <b>Ukuran</b> akan mengubah dasar hitung realisasi volume. Nama & tipe kolom aman
        diubah kapan saja — nilai sel tersimpan berdasarkan posisi kolom, bukan namanya.
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
      />

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
    </ModalShell>
  );
}
