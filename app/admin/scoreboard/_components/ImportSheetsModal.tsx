"use client";

import { useState, useEffect } from "react";
import { X, Download } from "lucide-react";
import { fetchSheetData } from "@/lib/sheets";

interface SheetRow {
  titik_gangguan: string;
  tgl_gangguan: string;
  jam_padam: string;
  durasi: string;
  penyebab: string;
}

interface ImportSheetsModalProps {
  bulan: number;
  tahun: number;
  ulp: string;
  onClose: () => void;
  onImport: (rows: SheetRow[]) => Promise<unknown>;
}

const BULAN_ID: Record<string, number> = {
  Januari: 0, Februari: 1, Maret: 2, April: 3, Mei: 4, Juni: 5,
  Juli: 6, Agustus: 7, September: 8, Oktober: 9, November: 10, Desember: 11,
};

function parseIndDate(str: string): Date | null {
  const m1 = str.match(/(\d+)\s+(\w+)\s+(\d{4})/);
  if (m1) {
    const mon = BULAN_ID[m1[2]];
    if (mon !== undefined) return new Date(Number(m1[3]), mon, Number(m1[1]));
  }
  const m2 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));
  return null;
}

export default function ImportSheetsModal({ bulan, tahun, ulp, onClose, onImport }: ImportSheetsModalProps) {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loadingSheet, setLoadingSheet] = useState(true);
  const [importing, setImporting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await fetchSheetData("gangguanPenyulang", "A:S");
        const filtered: SheetRow[] = [];
        for (const row of raw) {
          if (!row.TANGGAL) continue;
          const d = parseIndDate(row.TANGGAL);
          if (!d) continue;
          if (d.getMonth() + 1 !== bulan || d.getFullYear() !== tahun) continue;
          const rowUlp = (row.ULP ?? "").trim().toUpperCase();
          if (rowUlp !== ulp.toUpperCase()) continue;
          filtered.push({
            titik_gangguan: row["PENYULANG GANGGUAN"] ?? row.PENYULANG_GANGGUAN ?? "-",
            tgl_gangguan: row.TANGGAL,
            jam_padam: row["JAM PADAM"] ?? row.JAM_PADAM ?? "",
            durasi: row.DURASI ?? "",
            penyebab: row["PENYEBAB GANGGUAN"] ?? row.PENYEBAB_GANGGUAN ?? "",
          });
        }
        setRows(filtered);
        setSelected(new Set(filtered.map((_, i) => i)));
      } catch (e) {
        setSheetError(String(e));
      } finally {
        setLoadingSheet(false);
      }
    })();
  }, [bulan, tahun, ulp]);

  const toggleAll = () => {
    setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)));
  };

  const handleImport = async () => {
    const toImport = rows.filter((_, i) => selected.has(i));
    if (toImport.length === 0) return;
    setImporting(true);
    await onImport(toImport);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0] shrink-0">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-[#00897B]" />
            <h2 className="font-semibold text-[#1B2631]">Import dari Google Sheets</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loadingSheet ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
            </div>
          ) : sheetError ? (
            <p className="text-red-500 text-sm">{sheetError}</p>
          ) : rows.length === 0 ? (
            <p className="text-[#5D6D7E] text-sm text-center py-8">
              Tidak ada data gangguan untuk {ulp} bulan ini di Google Sheets.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-[#5D6D7E]">
                  Ditemukan <span className="font-semibold text-[#1B2631]">{rows.length} gangguan</span> — pilih yang ingin diimport
                </p>
                <button onClick={toggleAll} className="text-xs text-[#00897B] hover:underline">
                  {selected.size === rows.length ? "Batal semua" : "Pilih semua"}
                </button>
              </div>

              <div className="space-y-2">
                {rows.map((row, i) => (
                  <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selected.has(i) ? "border-[#00897B] bg-[#E0F2F1]/50" : "border-[#E2E8F0] hover:bg-gray-50"}`}>
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => setSelected((prev) => {
                        const s = new Set(prev);
                        s.has(i) ? s.delete(i) : s.add(i);
                        return s;
                      })}
                      className="mt-0.5 accent-[#00897B]"
                    />
                    <div className="flex-1 text-sm">
                      <p className="font-medium text-[#1B2631]">{row.titik_gangguan}</p>
                      <p className="text-xs text-[#5D6D7E] mt-0.5">
                        {row.tgl_gangguan} · Durasi: {row.durasi || "—"} · {row.penyebab || "—"}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {!loadingSheet && !sheetError && rows.length > 0 && (
          <div className="px-5 pb-5 flex gap-3 shrink-0 border-t border-[#E2E8F0] pt-4">
            <button onClick={onClose} className="flex-1 border border-[#E2E8F0] rounded-lg py-2 text-sm text-[#5D6D7E] hover:bg-gray-50">Batal</button>
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="flex-1 bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {importing ? "Mengimport..." : `Import ${selected.size} Gangguan`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
