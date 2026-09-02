"use client";

import { useMemo, useState } from "react";
import { AlertCircle, FileJson, Loader2, Save, X } from "lucide-react";
import { BTN_PRIMARY, CARD } from "@/app/admin/_ui";
import { fmtDateLabel, parseInput, toDateStr, type YantekRow } from "../_lib/yantek";
import KonsolPanel from "./KonsolPanel";

/**
 * Tab "Ambil Data" — perintah console APKT + kotak tempel JSON.
 *
 * Dipindah dari atas halaman (2026-08-21): keduanya hanya dipakai sesekali
 * saat menarik data baru, tapi memakan bagian layar paling berharga di setiap
 * kunjungan. Ditaruh di tab sendiri karena memang satu alur kerja — salin
 * perintah, jalankan di APKT, tempel hasilnya di kotak tepat di bawahnya.
 */

const PLACEHOLDER = `[ { "personil_yantek": "44150_NAMA", "rating": 5, "no_laporan": "G...", "waktu_lapor": "29/05/2026 10:00:00" }, ... ]`;

interface AmbilDataTabProps {
  /** ULP user; UP3 (null) bebas memilih posko. */
  unit: string | null;
  /** Dipanggil setelah semua tanggal tersimpan; `tanggalTerakhir` = "YYYY-MM-DD"
   *  atau null bila baris yang masuk tidak punya waktu lapor. */
  onTersimpan: (tanggalTerakhir: string | null) => Promise<void>;
}

export default function AmbilDataTab({ unit, onTersimpan }: AmbilDataTabProps) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { rows, error } = useMemo(() => parseInput(input), [input]);

  const tanggal = useMemo(
    () => [...new Set(rows.flatMap((r) => (r.waktu_lapor ? [toDateStr(r.waktu_lapor)] : [])))].sort(),
    [rows],
  );

  const bisaSimpan = rows.length > 0 && !error;
  const labelSimpan =
    tanggal.length === 1
      ? `Simpan ${fmtDateLabel(tanggal[0])}`
      : tanggal.length > 1
        ? `Simpan ${tanggal.length} tanggal`
        : "Simpan";

  async function simpan() {
    if (!bisaSimpan) return;
    setSaving(true);
    setSaveError(null);

    const grup: Record<string, YantekRow[]> = {};
    for (const row of rows) {
      const d = row.waktu_lapor ? toDateStr(row.waktu_lapor) : "unknown";
      if (!grup[d]) grup[d] = [];
      grup[d].push(row);
    }

    try {
      for (const [date, isi] of Object.entries(grup)) {
        const label = date !== "unknown" ? fmtDateLabel(date) : "Data manual";
        const res = await fetch("/api/yantek", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, label, rows: isi }),
        });
        if (!res.ok) throw new Error(`Gagal menyimpan ${date}`);
      }
      setInput("");
      const terakhir = Object.keys(grup).filter((d) => d !== "unknown").sort().pop() ?? null;
      await onTersimpan(terakhir);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <KonsolPanel unit={unit} bukaAwal />

      <div className={`${CARD} p-4`}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-navy-600" />
            <span className="text-sm font-semibold text-ink">Tempel Hasil JSON</span>
            {bisaSimpan && (
              <span className="text-xs text-green-700">
                ✓ {rows.length} baris
                {tanggal.length === 1
                  ? ` — ${fmtDateLabel(tanggal[0])}`
                  : tanggal.length > 1
                    ? ` — ${tanggal.length} tanggal`
                    : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {bisaSimpan && (
              <button onClick={simpan} disabled={saving} className={BTN_PRIMARY}>
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saving ? "Menyimpan..." : labelSimpan}
              </button>
            )}
            {input && (
              <button
                onClick={() => setInput("")}
                className="p-1 rounded-lg text-ink-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Kosongkan"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={8}
          className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 resize-y"
          spellCheck={false}
        />

        {(saveError || error) && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <p className="text-[11px] text-red-700 font-mono">{saveError ?? error}</p>
          </div>
        )}

        <p className="text-[11px] text-ink-muted mt-2">
          Rentang tanggal otomatis dipecah per hari saat disimpan, memakai kolom{" "}
          <code className="font-mono">waktu_lapor</code>. Data tersimpan sebagai berkas di server
          VPS — tidak hilang walau halaman di-refresh.
        </p>
      </div>
    </div>
  );
}
