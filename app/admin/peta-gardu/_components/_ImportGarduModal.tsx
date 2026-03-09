"use client";

import { useState, useRef } from "react";
import { X, Upload, AlertCircle, CheckCircle2, Loader2, FileText, Download } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    // Handle quoted fields with commas inside
    const values: string[] = [];
    let current = "";
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { values.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    values.push(current.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

function extractLatLng(lokasi: string): { lat: number; lng: number } | null {
  if (!lokasi) return null;
  // Format: https://maps.google.com/?q=-8.5069,116.3094
  const qMatch = lokasi.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  // Format: https://maps.google.com/.../@-8.5069,116.3094,...
  const atMatch = lokasi.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  // Plain lat,lng
  const plainMatch = lokasi.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (plainMatch) return { lat: parseFloat(plainMatch[1]), lng: parseFloat(plainMatch[2]) };
  return null;
}

// ── Column mapping (flexible header names) ───────────────────────────────────

function getField(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const found = Object.entries(row).find(
      ([col]) => col.toUpperCase() === k.toUpperCase()
    );
    if (found && found[1]) return found[1];
  }
  return "";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedRow {
  kode: string;
  nama: string;
  alamat: string;
  feeder: string;
  daya: number | null;
  merk: string;
  beban_total: number | null;
  beban_kva: number | null;
  beban_persen: number | null;
  tgl_update: string;
  lat: number | null;
  lng: number | null;
  valid: boolean;
  reason: string;
}

interface ImportResult {
  added: number;
  updated: number;
  failed: number;
}

// ── Template ──────────────────────────────────────────────────────────────────

const TEMPLATE_CSV = [
  "GARDU,ALAMAT,FEEDER,DAYA,MERK,TOTAL,KVA,PERSEN,LOKASI,TGL_UPDATE",
  "GD001,Jl. Pejanggik No. 10,FEEDER A,160,Sintra,120,112.3,70.2,https://maps.google.com/?q=-8.5833,116.1167,2024-01-15",
  "GD002,Jl. Langko No. 45,FEEDER B,100,Unindo,85,78.5,78.5,https://maps.google.com/?q=-8.5901,116.1234,2024-01-20",
  "GD003,Jl. Majapahit No. 5,FEEDER A,250,Starlite,200,198.0,79.2,-8.5750,116.1050,2024-02-01",
].join("\r\n");

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template-import-gardu.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export default function ImportGarduModal({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"upsert" | "insert">("upsert");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setErr(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(ev.target?.result as string);
        const mapped: ParsedRow[] = parsed.map((row) => {
          const kode = getField(row, "GARDU", "KODE", "kode", "NO_GARDU");
          const alamat = getField(row, "ALAMAT", "alamat", "NAMA", "nama");
          const feeder = getField(row, "FEEDER", "PENYULANG", "feeder");
          const lokasi = getField(row, "LOKASI", "koordinat", "LAT_LNG", "MAPS");
          const latRaw = getField(row, "LAT", "lat", "latitude");
          const lngRaw = getField(row, "LNG", "lng", "LONG", "longitude");

          let lat: number | null = null;
          let lng: number | null = null;
          if (latRaw && lngRaw) {
            lat = parseFloat(latRaw);
            lng = parseFloat(lngRaw);
          } else if (lokasi) {
            const coords = extractLatLng(lokasi);
            if (coords) { lat = coords.lat; lng = coords.lng; }
          }

          const valid = !!kode && lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng);
          const reason = !kode ? "Kode kosong"
            : lat === null || lng === null ? "Koordinat tidak ditemukan"
            : isNaN(lat) || isNaN(lng) ? "Koordinat tidak valid"
            : "";

          return {
            kode,
            nama: alamat,
            alamat,
            feeder,
            daya: getField(row, "DAYA", "daya") ? Number(getField(row, "DAYA", "daya")) : null,
            merk: getField(row, "MERK", "merk"),
            beban_total: getField(row, "TOTAL", "beban_total") ? Number(getField(row, "TOTAL", "beban_total")) : null,
            beban_kva: getField(row, "KVA", "kVA", "beban_kva") ? Number(getField(row, "KVA", "kVA", "beban_kva")) : null,
            beban_persen: getField(row, "PERSEN", "beban_persen") ? Number(getField(row, "PERSEN", "beban_persen")) : null,
            tgl_update: getField(row, "TGL_UPDATE", "tgl_update") || new Date().toISOString().slice(0, 10),
            lat, lng, valid, reason,
          };
        });
        setRows(mapped);
      } catch {
        setErr("Gagal membaca file CSV. Pastikan format benar.");
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const validRows = rows.filter((r) => r.valid);
    if (validRows.length === 0) return;
    setImporting(true);
    setErr(null);

    let added = 0, updated = 0, failed = 0;

    for (const row of validRows) {
      try {
        const payload = {
          kode: row.kode,
          nama: row.nama,
          alamat: row.alamat || null,
          feeder: row.feeder || null,
          daya: row.daya,
          merk: row.merk || null,
          beban_total: row.beban_total,
          beban_kva: row.beban_kva,
          beban_persen: row.beban_persen,
          tgl_update: row.tgl_update,
          lat: row.lat,
          lng: row.lng,
          status: "Aktif",
        };

        if (mode === "upsert") {
          const { error } = await supabaseBrowser
            .from("gardu")
            .upsert(payload, { onConflict: "kode" });
          if (error) { failed++; } else { updated++; }
        } else {
          const { error } = await supabaseBrowser.from("gardu").insert(payload);
          if (error) { failed++; } else { added++; }
        }
      } catch {
        failed++;
      }
    }

    setResult({ added: mode === "upsert" ? 0 : added, updated: mode === "upsert" ? updated : 0, failed });
    setImporting(false);
    if (failed < validRows.length) onImported();
  };

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.filter((r) => !r.valid).length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[600] flex items-center justify-center p-4">
      <div className="bg-[#0a1628] border border-[#1e3552] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1e3552]">
          <Upload size={15} className="text-[#00897B]" />
          <span className="text-sm font-semibold text-[#e2e8f0] flex-1">Import Gardu dari CSV</span>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Format info */}
          <div className="bg-[#162334] border border-[#1e3552] rounded-xl p-3 text-xs text-gray-400 space-y-1">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[#5eead4] font-semibold">Format CSV yang didukung:</p>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1 text-[#00897B] hover:text-[#5eead4] transition-colors font-medium"
              >
                <Download size={11} />
                Download Template
              </button>
            </div>
            <p><span className="text-gray-300">Kolom wajib:</span> GARDU (kode), LOKASI (URL Google Maps) <span className="text-gray-600">atau</span> LAT + LNG</p>
            <p><span className="text-gray-300">Kolom opsional:</span> ALAMAT, FEEDER, DAYA, MERK, TOTAL, KVA, PERSEN, TGL_UPDATE</p>
            <p className="text-gray-600 pt-1">Nama kolom tidak case-sensitive. LOKASI bisa berupa URL Google Maps atau format &quot;lat,lng&quot;.</p>
          </div>

          {/* File picker */}
          <div>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 w-full border-2 border-dashed border-[#1e3552] hover:border-[#00897B]/50 rounded-xl px-4 py-3 text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              <FileText size={16} className="text-[#00897B]" />
              {fileName || "Pilih file CSV..."}
            </button>
          </div>

          {/* Mode */}
          {rows.length > 0 && (
            <div className="flex gap-2">
              {(["upsert", "insert"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    mode === m
                      ? "bg-[#00897B]/20 text-[#5eead4] border-[#00897B]/30"
                      : "text-gray-500 border-[#1e3552] hover:text-gray-300"
                  }`}
                >
                  {m === "upsert" ? "Update + Tambah baru" : "Tambah baru saja"}
                </button>
              ))}
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-2 text-xs">
                <span className="text-gray-400">{rows.length} baris</span>
                <span className="text-emerald-400">✓ {validCount} valid</span>
                {invalidCount > 0 && <span className="text-red-400">✗ {invalidCount} error</span>}
              </div>
              <div className="overflow-x-auto rounded-xl border border-[#1e3552]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#0d1b2a] text-gray-500">
                      <th className="px-3 py-2 text-left font-medium">Kode</th>
                      <th className="px-3 py-2 text-left font-medium">Alamat</th>
                      <th className="px-3 py-2 text-left font-medium">Feeder</th>
                      <th className="px-3 py-2 text-left font-medium">Lat</th>
                      <th className="px-3 py-2 text-left font-medium">Lng</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e3552]">
                    {rows.slice(0, 20).map((row, i) => (
                      <tr key={i} className={row.valid ? "" : "bg-red-500/5"}>
                        <td className="px-3 py-1.5 font-mono text-[#e2e8f0]">{row.kode || "—"}</td>
                        <td className="px-3 py-1.5 text-gray-400 max-w-[140px] truncate">{row.alamat || "—"}</td>
                        <td className="px-3 py-1.5 text-gray-400">{row.feeder || "—"}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-400">{row.lat?.toFixed(5) ?? "—"}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-400">{row.lng?.toFixed(5) ?? "—"}</td>
                        <td className="px-3 py-1.5">
                          {row.valid
                            ? <span className="text-emerald-400">✓</span>
                            : <span className="text-red-400 text-[10px]">{row.reason}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 20 && (
                  <p className="text-center text-gray-600 text-xs py-2">
                    +{rows.length - 20} baris lainnya (tidak ditampilkan)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              <div className="text-xs text-emerald-300">
                {mode === "upsert"
                  ? `${result.updated} gardu diperbarui/ditambahkan`
                  : `${result.added} gardu ditambahkan`}
                {result.failed > 0 && (
                  <span className="text-red-400 ml-2">· {result.failed} gagal</span>
                )}
              </div>
            </div>
          )}

          {err && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-400">{err}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1e3552] flex gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg text-sm text-gray-400 border border-[#1e3552] hover:bg-white/5 transition-colors">
            {result ? "Tutup" : "Batal"}
          </button>
          {validCount > 0 && !result && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white hover:opacity-90 disabled:opacity-50"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {importing ? "Mengimpor..." : `Import ${validCount} Gardu`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
