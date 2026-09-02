"use client";

/**
 * Dua jalur memasukkan data APKT: unggah file Excel hasil unduh APKT
 * (jalur utama) dan tempel JSON dari console (jalur lama, disimpan sebagai
 * cadangan bila unduhan Excel sedang bermasalah).
 *
 * Excel diproses di server — file dikirim apa adanya, tanpa pengguna perlu
 * merapikan kop atau mengubah nama kolom.
 */

import { useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Save,
  Upload,
  X,
} from "lucide-react";
import { BTN_PRIMARY, CARD } from "@/app/admin/_ui";
import type { GangguanRow } from "../_lib/gangguan";

interface ImportPanelProps {
  /** Rentang tanggal yang sedang ditampilkan tabel — untuk memperingatkan
   *  kalau file yang baru diimpor jatuh di luar rentang itu. */
  dateFrom: string;
  dateTo: string;
  /** Dipanggil setelah ada baris yang benar-benar tersimpan. */
  onImported: () => void;
}

interface HasilFile {
  nama: string;
  dibaca: number;
  disimpan: number;
  ganda: number;
  periode: string | null;
  dari: string | null;
  sampai: string | null;
  error: string | null;
}

/** Terima array polos, respons GraphQL utuh, atau pembungkus { data: [...] }. */
function extractRows(text: string): { rows: GangguanRow[]; error: string | null } {
  if (!text.trim()) return { rows: [], error: null };
  let p: unknown;
  try {
    p = JSON.parse(text);
  } catch (e) {
    return { rows: [], error: (e as Error).message };
  }
  let arr: unknown = p;
  if (!Array.isArray(arr)) {
    const o = p as Record<string, unknown>;
    arr =
      (o?.data as { ssdetailGangguan?: { data?: unknown } })?.ssdetailGangguan?.data ??
      (o?.ssdetailGangguan as { data?: unknown })?.data ??
      o?.data ??
      o?.rows ??
      null;
  }
  if (!Array.isArray(arr))
    return {
      rows: [],
      error:
        "Tidak menemukan array data. Tempel hasil ssdetailGangguan.data atau seluruh respons JSON.",
    };
  return { rows: arr as GangguanRow[], error: null };
}

const isXlsx = (f: File) => f.name.toLowerCase().endsWith(".xlsx");

export default function ImportPanel({
  dateFrom,
  dateTo,
  onImported,
}: ImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hasil, setHasil] = useState<HasilFile[] | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [showJson, setShowJson] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const { rows: parsed, error: parseErr } = extractRows(input);

  const diLuarRentang = (hasil ?? []).some(
    (f) => !f.error && ((f.dari && f.dari < dateFrom) || (f.sampai && f.sampai > dateTo)),
  );

  function tambahFile(list: FileList | null) {
    if (!list) return;
    const dipilih = [...list];
    const xlsx = dipilih.filter(isXlsx);
    setUploadErr(
      xlsx.length < dipilih.length
        ? "Hanya file .xlsx yang bisa dibaca. Kalau unduhan APKT berupa .xls, buka lalu simpan ulang sebagai .xlsx."
        : null,
    );
    // Nama file yang sama tidak perlu diunggah dua kali dalam satu batch.
    setFiles((prev) => [
      ...prev,
      ...xlsx.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size)),
    ]);
    setHasil(null);
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true);
    setUploadErr(null);
    setHasil(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("file", f));
      const res = await fetch("/api/apkt/gangguan/import-excel", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadErr(data.error ?? "Gagal mengunggah");
        return;
      }
      setHasil(data.files as HasilFile[]);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      if (data.disimpan > 0) onImported();
    } catch (e) {
      setUploadErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveJson() {
    if (parsed.length === 0 || parseErr) return;
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      const res = await fetch("/api/apkt/gangguan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveErr(`${data.error ?? "Gagal menyimpan"}${data.hint ? " — " + data.hint : ""}`);
        return;
      }
      setSaveMsg(
        `${data.saved} laporan tersimpan${data.deduped ? ` (${data.deduped} nomor ganda digabung)` : ""}`,
      );
      setInput("");
      onImported();
    } catch (e) {
      setSaveErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`${CARD} p-4 space-y-3`}>
      <div className="flex items-center gap-2 flex-wrap">
        <FileSpreadsheet className="w-4 h-4 text-navy-600" />
        <span className="text-sm font-semibold text-ink">Impor Data APKT</span>
        <span className="text-xs text-ink-muted">
          unduh dari APKT, unggah apa adanya — kolomnya dibaca otomatis
        </span>
      </div>

      {/* Kotak jatuh berkas */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          tambahFile(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-1.5 py-7 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
          dragging
            ? "border-navy-500 bg-navy-50"
            : "border-line bg-surface hover:border-navy-300"
        }`}
      >
        <Upload className="w-6 h-6 text-navy-600" />
        <p className="text-sm font-semibold text-ink">
          Tarik file Excel ke sini, atau klik untuk memilih
        </p>
        <p className="text-[11px] text-ink-muted">
          File &quot;Detail Rekapitulasi Gangguan&quot; (.xlsx) — boleh beberapa file sekaligus
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          multiple
          hidden
          onChange={(e) => tambahFile(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f) => (
            <div
              key={`${f.name}-${f.size}`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-line bg-white"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-navy-600 shrink-0" />
              <span className="text-xs text-ink truncate">{f.name}</span>
              <span className="text-[10px] text-ink-muted ml-auto shrink-0">
                {Math.max(1, Math.round(f.size / 1024))} KB
              </span>
              <button
                onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}
                className="p-0.5 rounded-md text-ink-muted hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button onClick={handleUpload} disabled={uploading} className={BTN_PRIMARY}>
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {uploading ? "Mengimpor..." : `Impor ${files.length} file`}
          </button>
        </div>
      )}

      {uploadErr && <Peringatan nada="merah">{uploadErr}</Peringatan>}

      {hasil?.map((f) => (
        <Peringatan key={f.nama} nada={f.error ? "merah" : "hijau"}>
          <b>{f.nama}</b> — {f.error ? f.error : ringkasFile(f)}
        </Peringatan>
      ))}

      {/* Impor berhasil tapi tabel tetap kosong itu membingungkan — sebutkan
          sebabnya, bukan biarkan pengguna menebak. */}
      {diLuarRentang && (
        <Peringatan nada="merah">
          Sebagian data yang baru diimpor ada di luar rentang {dateFrom} s/d {dateTo}.
          Ubah tanggal di atas lalu klik <b>Muat dari DB</b> untuk melihatnya.
        </Peringatan>
      )}

      {/* Jalur lama, dilipat: masih berguna kalau unduhan Excel bermasalah. */}
      <div className="border-t border-line pt-3">
        <button
          onClick={() => setShowJson((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-navy-600 hover:text-navy-500 transition-colors"
        >
          <ChevronDown
            size={12}
            className={`transition-transform ${showJson ? "" : "-rotate-90"}`}
          />
          <FileJson size={12} /> Cara lama: tempel JSON dari console
        </button>

        {showJson && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {parsed.length > 0 && (
                <span className="text-xs text-green-700">
                  ✓ {parsed.length} baris terdeteksi
                </span>
              )}
              <div className="flex items-center gap-2 ml-auto">
                {parsed.length > 0 && !parseErr && (
                  <button onClick={handleSaveJson} disabled={saving} className={BTN_PRIMARY}>
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {saving ? "Menyimpan..." : "Simpan ke Database"}
                  </button>
                )}
                {input && (
                  <button
                    onClick={() => setInput("")}
                    className="p-1 rounded-lg text-ink-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Tempel array JSON di sini, mis. [ { "no_laporan": "G...", ... }, ... ]'
              rows={4}
              className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 resize-y"
              spellCheck={false}
            />

            {parseErr && (
              <Peringatan nada="merah" mono>
                {parseErr}
              </Peringatan>
            )}
            {saveErr && <Peringatan nada="merah">{saveErr}</Peringatan>}
            {saveMsg && <Peringatan nada="hijau">{saveMsg}</Peringatan>}
          </div>
        )}
      </div>
    </div>
  );
}

function ringkasFile(f: HasilFile): string {
  const bagian = [`${f.disimpan} laporan tersimpan`];
  if (f.dari && f.sampai)
    bagian.push(f.dari === f.sampai ? f.dari : `${f.dari} s/d ${f.sampai}`);
  if (f.ganda) bagian.push(`${f.ganda} nomor ganda digabung`);
  return bagian.join(" · ");
}

/** Bilah pesan — merah untuk gagal, hijau untuk berhasil. */
function Peringatan({
  nada,
  mono,
  children,
}: {
  nada: "merah" | "hijau";
  mono?: boolean;
  children: React.ReactNode;
}) {
  const merah = nada === "merah";
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
        merah ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
      }`}
    >
      {merah ? (
        <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
      ) : (
        <Check className="w-3.5 h-3.5 text-green-700 shrink-0" />
      )}
      <p
        className={`text-[11px] ${merah ? "text-red-700" : "text-green-700"} ${
          mono ? "font-mono" : ""
        }`}
      >
        {children}
      </p>
    </div>
  );
}
