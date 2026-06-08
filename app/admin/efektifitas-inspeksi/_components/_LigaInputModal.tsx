"use client";

import { useState, useEffect, useRef } from "react";
import { X, Upload, Loader2, MapPin, CheckCircle2, ImagePlus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CurrentUser } from "@/lib/roles";

interface Props {
  defaultPenyulang: string;
  user: CurrentUser;
  onClose: () => void;
  onSaved: () => void;
}

const INPUT = "w-full border border-[#1e3552] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] bg-[#0d1b2a] focus:outline-none focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 placeholder-[#334155]";
const LABEL = "block text-xs font-semibold text-[#94a3b8] mb-1";

async function uploadFoto(file: File, path: string): Promise<string> {
  const { error } = await supabaseBrowser.storage.from("inspections").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabaseBrowser.storage.from("inspections").getPublicUrl(path);
  return data.publicUrl;
}

function FotoUpload({
  label,
  preview,
  onChange,
}: {
  label: string;
  preview: string | null;
  onChange: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <div
        onClick={() => ref.current?.click()}
        className="relative cursor-pointer rounded-xl border-2 border-dashed border-[#1e3552] hover:border-[#6366f1] transition-colors overflow-hidden"
        style={{ height: 140 }}
      >
        {preview ? (
          <img src={preview} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[#475569]">
            <ImagePlus size={28} />
            <span className="text-xs">Klik untuk upload</span>
          </div>
        )}
        {preview && (
          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
            <Upload size={20} className="text-white" />
          </div>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f); }}
      />
    </div>
  );
}

export default function LigaInputModal({ defaultPenyulang, user, onClose, onSaved }: Props) {
  const [penyulang, setPenyulang]       = useState(defaultPenyulang);
  const [tglInspeksi, setTglInspeksi]   = useState("");
  const [tglEksekusi, setTglEksekusi]   = useState(new Date().toISOString().split("T")[0]);
  const [temuan, setTemuan]             = useState("");
  const [lokasi, setLokasi]             = useState("");
  const [koordinat, setKoordinat]       = useState("");
  const [fotoSebelum, setFotoSebelum]   = useState<File | null>(null);
  const [fotoSesudah, setFotoSesudah]   = useState<File | null>(null);
  const [prevSebelum, setPrevSebelum]   = useState<string | null>(null);
  const [prevSesudah, setPrevSesudah]   = useState<string | null>(null);
  const [penyulangList, setPenyulangList] = useState<string[]>([]);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Fetch daftar penyulang dari inspeksi (filtered by ULP)
  useEffect(() => {
    async function fetchPenyulang() {
      let q = supabaseBrowser.from("inspeksi").select("penyulang");
      if (user.unit) q = q.eq("ulp", user.unit);
      const { data } = await q;
      const unique = [...new Set((data ?? []).map(r => r.penyulang).filter(Boolean) as string[])].sort();
      setPenyulangList(unique);
    }
    fetchPenyulang();
  }, [user.unit]);

  function handleFoto(file: File, type: "sebelum" | "sesudah") {
    const url = URL.createObjectURL(file);
    if (type === "sebelum") { setFotoSebelum(file); setPrevSebelum(url); }
    else                    { setFotoSesudah(file); setPrevSesudah(url); }
  }

  async function handleSave() {
    if (!penyulang.trim()) { setError("Penyulang wajib diisi"); return; }
    if (!tglEksekusi)      { setError("Tanggal eksekusi wajib diisi"); return; }
    if (!temuan.trim())    { setError("Keterangan pekerjaan wajib diisi"); return; }

    setSaving(true); setError(null);
    try {
      const id = crypto.randomUUID();
      const ts = Date.now();

      const [fotoSebelumUrl, fotoSesudahUrl] = await Promise.all([
        fotoSebelum ? uploadFoto(fotoSebelum, `jaringan/sebelum/${id}/${ts}.${fotoSebelum.name.split(".").pop() ?? "jpg"}`) : Promise.resolve(null),
        fotoSesudah ? uploadFoto(fotoSesudah, `jaringan/sesudah/${id}/${ts}.${fotoSesudah.name.split(".").pop() ?? "jpg"}`) : Promise.resolve(null),
      ]);

      const now = new Date().toISOString();
      const { error: dbErr } = await supabaseBrowser.from("inspeksi").insert({
        id,
        penyulang:        penyulang.trim(),
        ulp:              user.unit,
        status:           "Selesai",
        category:         "LIGA",
        temuan:           temuan.trim(),
        tgl_inspeksi:     tglInspeksi || tglEksekusi,
        tgl_eksekusi:     tglEksekusi,
        lokasi:           lokasi.trim() || null,
        koordinat:        koordinat.trim() || null,
        foto_sebelum_url: fotoSebelumUrl,
        foto_sesudah_url: fotoSesudahUrl,
        created_at:       now,
        updated_at:       now,
      });
      if (dbErr) throw dbErr;

      setSaved(true);
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="bg-[#0d1b2a] border border-[#1e3552] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#1e3552] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-900/40 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-[#e2e8f0] font-bold text-sm">Input Eksekusi LIGA</h3>
              <p className="text-[#64748b] text-xs mt-0.5">Pekerjaan pemadaman terencana · ULP {user.unit}</p>
            </div>
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-900/50 text-indigo-300 border border-indigo-500/30">
              LIGA
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#1e3552] transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Penyulang */}
          <div>
            <label className={LABEL}>Penyulang / GH *</label>
            <input
              list="penyulang-list"
              value={penyulang}
              onChange={e => setPenyulang(e.target.value)}
              placeholder="Ketik atau pilih penyulang..."
              className={INPUT}
            />
            <datalist id="penyulang-list">
              {penyulangList.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>

          {/* Tanggal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Tanggal Inspeksi</label>
              <input
                type="date"
                value={tglInspeksi}
                onChange={e => setTglInspeksi(e.target.value)}
                className={INPUT}
              />
              <p className="text-[10px] text-[#475569] mt-0.5">Kosongkan jika sama dengan tgl eksekusi</p>
            </div>
            <div>
              <label className={LABEL}>Tanggal Eksekusi *</label>
              <input
                type="date"
                value={tglEksekusi}
                onChange={e => setTglEksekusi(e.target.value)}
                className={INPUT}
              />
            </div>
          </div>

          {/* Keterangan */}
          <div>
            <label className={LABEL}>Keterangan Pekerjaan *</label>
            <textarea
              value={temuan}
              onChange={e => setTemuan(e.target.value)}
              placeholder="Deskripsikan pekerjaan yang dilakukan dalam LIGA..."
              rows={3}
              className={`${INPUT} resize-none`}
            />
          </div>

          {/* Lokasi & Koordinat */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Lokasi</label>
              <input
                type="text"
                value={lokasi}
                onChange={e => setLokasi(e.target.value)}
                placeholder="Nama jalan / desa..."
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>
                <span className="flex items-center gap-1">
                  <MapPin size={10} /> Koordinat
                </span>
              </label>
              <input
                type="text"
                value={koordinat}
                onChange={e => setKoordinat(e.target.value)}
                placeholder="-8.5833, 116.1167"
                className={INPUT}
              />
            </div>
          </div>

          {/* Foto */}
          <div className="grid grid-cols-2 gap-3">
            <FotoUpload label="Foto Sebelum" preview={prevSebelum} onChange={f => handleFoto(f, "sebelum")} />
            <FotoUpload label="Foto Sesudah" preview={prevSesudah} onChange={f => handleFoto(f, "sesudah")} />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-500/30 rounded-lg">
              <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#1e3552] flex items-center justify-between gap-3 shrink-0">
          <p className="text-[10px] text-[#475569]">
            Status otomatis: <span className="text-emerald-400 font-semibold">Selesai</span> · Category: <span className="text-indigo-400 font-semibold">LIGA</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm text-[#64748b] hover:text-[#e2e8f0] border border-[#1e3552] hover:bg-[#1e3552] transition-colors disabled:opacity-40"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white transition-colors"
            >
              {saved ? (
                <><CheckCircle2 className="w-4 h-4" /> Tersimpan!</>
              ) : saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
              ) : (
                <><Upload className="w-4 h-4" /> Simpan LIGA</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
