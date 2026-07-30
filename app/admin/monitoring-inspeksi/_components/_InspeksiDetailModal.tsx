"use client";

import { useState, useRef } from "react";
import { X, MapPin, Trash2, Loader2, Upload, ExternalLink, CheckCircle2, Clock, Save, AlertCircle, MessageCircle, Zap } from "lucide-react";
import { DISPLAY } from "@/app/admin/_ui";
import {
  STATUS_CONFIG,
  CATEGORY_CONFIG,
  type InspeksiStatus,
  type InspeksiCategory,
  EKSEKUTOR_ROLES,
  canSeeAllUnits,
  canUpdateStatus,
} from "@/lib/roles";
import type { CurrentUser } from "@/lib/roles";
import type { InspeksiJaringan } from "../_hooks/useInspeksiJaringan";
import KirimWAModal from "./_KirimWAModal";

const ALL_STATUS: InspeksiStatus[] = [
  "Temuan",
  "Perlu Tindakan",
  "Ditugaskan",
  "Dalam Proses",
  "Selesai",
];

interface Props {
  data: InspeksiJaringan;
  user: CurrentUser;
  onClose: () => void;
  updateStatus: (id: string, status: InspeksiStatus) => Promise<void>;
  updateTemuan: (id: string, temuan: string) => Promise<void>;
  updateDeskripsi: (id: string, deskripsi: string) => Promise<void>;
  uploadFotoSesudah: (id: string, file: File) => Promise<string>;
  deleteInspeksi: (id: string) => Promise<void>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <dt className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">{label}</dt>
      <dd className="text-sm text-ink mt-0.5 break-words">{value || "—"}</dd>
    </div>
  );
}

// Mendukung Firebase URL, Supabase URL, dan URL lainnya
function FotoThumb({ url, label }: { url: string | null; label: string }) {
  const [imgError, setImgError] = useState(false);

  if (!url) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="w-20 h-16 rounded-lg bg-white border border-line flex items-center justify-center">
          <span className="text-[10px] text-gray-600">Belum ada</span>
        </div>
        <span className="text-[10px] text-ink-muted">{label}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {imgError ? (
        // Gambar gagal load (Firebase URL mungkin private) — tampilkan link saja
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="w-20 h-16 rounded-lg bg-white border border-line hover:border-navy-500 flex flex-col items-center justify-center gap-1 transition-colors"
        >
          <ExternalLink size={13} className="text-navy-600" />
          <span className="text-[9px] text-ink-muted text-center px-1">Buka foto</span>
        </a>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="w-20 h-16 object-cover rounded-lg border border-line hover:border-navy-500 transition-colors"
            onError={() => setImgError(true)}
          />
        </a>
      )}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-[10px] text-navy-600 hover:text-accent-deep flex items-center gap-0.5 transition-colors"
      >
        {label} <ExternalLink size={9} />
      </a>
    </div>
  );
}

export default function InspeksiDetailModal({
  data,
  user,
  onClose,
  updateStatus,
  updateTemuan,
  updateDeskripsi,
  uploadFotoSesudah,
  deleteInspeksi,
}: Props) {
  const [temuanDraft, setTemuanDraft] = useState(data.temuan ?? "");
  const [savingTemuan, setSavingTemuan] = useState(false);

  const [deskripsiDraft, setDeskripsiDraft] = useState(data.deskripsi ?? "");
  const [savingDeskripsi, setSavingDeskripsi] = useState(false);

  // Staged status — tidak langsung disimpan saat dropdown berubah
  const [pendingStatus, setPendingStatus] = useState<InspeksiStatus>(data.status as InspeksiStatus);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  // Konfirmasi selesai untuk executor
  const [confirmSelesai, setConfirmSelesai] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showKirimWA, setShowKirimWA] = useState(false);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Role flags
  const canEditTemuan = canSeeAllUnits(user.role) || user.role === "admin";
  const canUploadFoto = EKSEKUTOR_ROLES.includes(user.role) || canEditTemuan;
  const canChangeStatus = canUpdateStatus(user.role);
  const canDelete = canSeeAllUnits(user.role) || user.role === "admin";
  const isExecutor = EKSEKUTOR_ROLES.includes(user.role);

  const statusCfg = STATUS_CONFIG[data.status as InspeksiStatus];
  const catCfg = CATEGORY_CONFIG[data.category as InspeksiCategory];

  // Foto sesudah — gunakan variabel agar tidak ada empty string ke src
  const sesudahSrc = data.foto_sesudah_url || previewUrl; // string | null, bukan ""
  const hasFotoSesudah = !!sesudahSrc;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSaveTemuan = async () => {
    setSavingTemuan(true);
    setErr(null);
    try {
      await updateTemuan(data.id, temuanDraft);
    } catch {
      setErr("Gagal menyimpan temuan");
    } finally {
      setSavingTemuan(false);
    }
  };

  const handleSaveDeskripsi = async () => {
    setSavingDeskripsi(true);
    setErr(null);
    try {
      await updateDeskripsi(data.id, deskripsiDraft);
    } catch {
      setErr("Gagal menyimpan deskripsi");
    } finally {
      setSavingDeskripsi(false);
    }
  };

  // Simpan status (dipanggil setelah konfirmasi)
  const handleConfirmStatus = async (targetStatus: InspeksiStatus) => {
    setConfirmStatus(false);
    setConfirmSelesai(false);

    // Guard: Selesai harus ada foto sesudah
    if (targetStatus === "Selesai" && !hasFotoSesudah) {
      setErr("Upload foto sesudah terlebih dahulu sebelum mengubah status ke Selesai");
      return;
    }

    setSavingStatus(true);
    setErr(null);
    try {
      // Upload foto dulu jika ada file yang dipilih
      if (targetStatus === "Selesai" && pendingFile && !data.foto_sesudah_url) {
        setUploading(true);
        await uploadFotoSesudah(data.id, pendingFile);
        setUploading(false);
        setPendingFile(null);
      }
      await updateStatus(data.id, targetStatus);
      // Sync pending status dengan yang tersimpan
      setPendingStatus(targetStatus);
    } catch (e) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === "object" && "message" in e) ? String((e as { message: unknown }).message)
        : "Gagal mengubah status";
      setErr(msg);
      setUploading(false);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setErr(null);
    try {
      await deleteInspeksi(data.id);
      onClose();
    } catch {
      setErr("Gagal menghapus data");
      setDeleting(false);
    }
  };

  const koordinatUrl = data.koordinat
    ? `https://www.google.com/maps?q=${data.koordinat}`
    : null;

  const statusChanged = pendingStatus !== (data.status as InspeksiStatus);

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white border border-line rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-pop-in">

        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-line shrink-0">
          <div className="w-10 h-10 rounded-xl bg-navy-50 grid place-items-center shrink-0">
            <Zap size={18} className="text-navy-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {data.penyulang ?? "—"} · {data.ulp ?? "—"}
            </p>
            <h2 className={`${DISPLAY} text-lg font-bold text-ink leading-snug`}>
              {data.temuan ?? data.deskripsi ?? "Detail Inspeksi"}
            </h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${statusCfg?.bgColor ?? "bg-slate-100"} ${statusCfg?.color ?? "text-ink-soft"}`}>
                {statusCfg?.label ?? data.status}
              </span>
              {catCfg && (
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${catCfg.bgColor} ${catCfg.color}`}>
                  {catCfg.label}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface transition-colors shrink-0"
          >
            <X size={17} />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Info grid — memanfaatkan lebar modal */}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px rounded-xl border border-line bg-line overflow-hidden">
            <InfoRow label="Tgl Inspeksi" value={data.tgl_inspeksi} />
            <InfoRow label="Tgl Eksekusi" value={data.tgl_eksekusi} />
            <InfoRow label="Inspektor" value={data.nama_inspektor ?? data.inspektor} />
            <InfoRow label="Eksekutor" value={data.eksekutor} />
            <InfoRow label="Tim" value={data.team_name} />
            <InfoRow label="Lokasi" value={data.lokasi} />
          </dl>

          {/* Koordinat */}
          {koordinatUrl && (
            <a
              href={koordinatUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-navy-600 hover:text-accent-deep transition-colors"
            >
              <MapPin size={12} /> Lihat di Google Maps
            </a>
          )}

          {/* Temuan */}
          <div>
            <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1.5">Temuan</p>
            {canEditTemuan ? (
              <div className="space-y-2">
                <textarea
                  value={temuanDraft}
                  onChange={(e) => setTemuanDraft(e.target.value)}
                  rows={3}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15 resize-none"
                />
                <button
                  onClick={handleSaveTemuan}
                  disabled={savingTemuan || temuanDraft === (data.temuan ?? "")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-navy-50 text-accent-deep border border-navy-300 hover:bg-navy-100 disabled:opacity-40 transition-colors"
                >
                  {savingTemuan && <Loader2 size={11} className="animate-spin" />}
                  Simpan Temuan
                </button>
              </div>
            ) : (
              <p className="text-sm text-ink">{data.temuan || "—"}</p>
            )}
          </div>

          {/* Deskripsi (editable oleh admin/UP3) */}
          <div>
            <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1.5">Deskripsi</p>
            {canEditTemuan ? (
              <div className="space-y-2">
                <textarea
                  value={deskripsiDraft}
                  onChange={(e) => setDeskripsiDraft(e.target.value)}
                  rows={3}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:border-navy-500 focus:ring-1 focus:ring-navy-500/15 resize-none"
                />
                <button
                  onClick={handleSaveDeskripsi}
                  disabled={savingDeskripsi || deskripsiDraft === (data.deskripsi ?? "")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-navy-50 text-accent-deep border border-navy-300 hover:bg-navy-100 disabled:opacity-40 transition-colors"
                >
                  {savingDeskripsi && <Loader2 size={11} className="animate-spin" />}
                  Simpan Deskripsi
                </button>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">{data.deskripsi || "—"}</p>
            )}
          </div>

          {data.keterangan && (
            <div>
              <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">Keterangan</p>
              <p className="text-sm text-ink-soft">{data.keterangan}</p>
            </div>
          )}

          {/* Foto */}
          <div>
            <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-2">Foto</p>
            <div className="flex gap-4 flex-wrap">
              <FotoThumb url={data.foto_sebelum_url} label="Sebelum" />
              <FotoThumb url={data.foto_lokasi_url} label="Lokasi" />

              {/* Foto Sesudah */}
              <div className="flex flex-col items-center gap-1">
                {sesudahSrc ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <a href={sesudahSrc} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={sesudahSrc}
                        alt="Sesudah"
                        className="w-20 h-16 object-cover rounded-lg border border-line hover:border-navy-500 transition-colors"
                      />
                    </a>
                    {previewUrl && !data.foto_sesudah_url && (
                      <span className="text-[10px] text-amber-700">Belum diupload</span>
                    )}
                    {data.foto_sesudah_url && (
                      <a
                        href={data.foto_sesudah_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-navy-600 hover:text-accent-deep flex items-center gap-0.5 transition-colors"
                      >
                        Sesudah <ExternalLink size={9} />
                      </a>
                    )}
                  </>
                ) : canUploadFoto ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-16 rounded-lg border-2 border-dashed border-line hover:border-navy-500 flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-navy-600 transition-colors"
                  >
                    <Upload size={14} />
                    <span className="text-[9px]">Upload</span>
                  </button>
                ) : (
                  <div className="w-20 h-16 rounded-lg bg-white border border-line flex items-center justify-center">
                    <span className="text-[10px] text-gray-600">Belum ada</span>
                  </div>
                )}
                <span className="text-[10px] text-ink-muted">Sesudah</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer — actions */}
        <div className="px-5 py-3 border-t border-line space-y-2 shrink-0">
          {err && (
            <p className="text-xs text-red-700 bg-red-500/10 border border-red-200 rounded-lg px-3 py-2">
              {err}
            </p>
          )}

          {/* ── Admin: staged status dropdown + konfirmasi ── */}
          {canChangeStatus && canEditTemuan && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={pendingStatus}
                  onChange={(e) => {
                    setPendingStatus(e.target.value as InspeksiStatus);
                    setConfirmStatus(false);
                  }}
                  disabled={savingStatus}
                  className="flex-1 border border-line rounded-lg px-2.5 py-1.5 text-xs text-ink bg-white focus:outline-none focus:border-navy-500 disabled:opacity-50"
                >
                  {ALL_STATUS.map((s) => (
                    <option
                      key={s}
                      value={s}
                      disabled={s === "Selesai" && !hasFotoSesudah}
                    >
                      {STATUS_CONFIG[s].label}
                      {s === "Selesai" && !hasFotoSesudah ? " (butuh foto sesudah)" : ""}
                    </option>
                  ))}
                </select>
                {statusChanged && !confirmStatus && (
                  <button
                    onClick={() => setConfirmStatus(true)}
                    disabled={savingStatus}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-navy-50 text-accent-deep border border-navy-300 hover:bg-navy-100 disabled:opacity-40 whitespace-nowrap transition-colors"
                  >
                    <Save size={11} />
                    Simpan
                  </button>
                )}
                {savingStatus && <Loader2 size={13} className="animate-spin text-navy-600 shrink-0" />}
              </div>

              {/* Konfirmasi simpan status */}
              {confirmStatus && (
                <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-line">
                  <AlertCircle size={12} className="text-amber-700 shrink-0" />
                  <span className="text-xs text-ink-soft flex-1">
                    Ubah status ke <span className="text-ink font-medium">&ldquo;{STATUS_CONFIG[pendingStatus]?.label}&rdquo;</span>?
                  </span>
                  <button
                    onClick={() => setConfirmStatus(false)}
                    className="text-xs text-ink-muted hover:text-ink transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => handleConfirmStatus(pendingStatus)}
                    className="text-xs text-accent-deep hover:text-white transition-colors font-medium"
                  >
                    Ya, Simpan
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Executor: tombol kontekstual + konfirmasi selesai ── */}
          {canChangeStatus && isExecutor && !canEditTemuan && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {data.status === "Ditugaskan" && (
                  <button
                    onClick={() => handleConfirmStatus("Dalam Proses")}
                    disabled={savingStatus}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-line text-ink-soft hover:text-ink hover:border-navy-300 disabled:opacity-50 transition-colors"
                  >
                    {savingStatus ? <Loader2 size={11} className="animate-spin" /> : <Clock size={11} />}
                    Dalam Proses
                  </button>
                )}
                {(data.status === "Ditugaskan" || data.status === "Dalam Proses") && (
                  <button
                    onClick={() => setConfirmSelesai(true)}
                    disabled={savingStatus || !hasFotoSesudah}
                    title={!hasFotoSesudah ? "Upload foto sesudah terlebih dahulu" : undefined}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-navy-50 text-accent-deep border border-navy-300 hover:bg-navy-100 disabled:opacity-40 transition-colors"
                  >
                    <CheckCircle2 size={11} />
                    Selesai
                  </button>
                )}
                {(savingStatus || uploading) && (
                  <Loader2 size={13} className="animate-spin text-navy-600" />
                )}
              </div>

              {/* Konfirmasi selesai */}
              {confirmSelesai && (
                <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-line">
                  <AlertCircle size={12} className="text-amber-700 shrink-0" />
                  <span className="text-xs text-ink-soft flex-1">
                    Tandai sebagai <span className="text-accent-deep font-medium">Selesai</span>?
                    {pendingFile && !data.foto_sesudah_url && (
                      <span className="block text-[10px] text-amber-700">Foto sesudah akan diupload.</span>
                    )}
                  </span>
                  <button
                    onClick={() => setConfirmSelesai(false)}
                    className="text-xs text-ink-muted hover:text-ink transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => handleConfirmStatus("Selesai")}
                    className="text-xs text-accent-deep hover:text-white transition-colors font-medium"
                  >
                    Ya
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Kirim WO via WA ── */}
          {canDelete && (
            <button
              onClick={() => setShowKirimWA(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-navy-600 border border-navy-300 hover:bg-navy-50 transition-colors w-full justify-center"
            >
              <MessageCircle size={11} />
              Kirim WO via WhatsApp
            </button>
          )}

          {/* ── Delete ── */}
          {canDelete && (
            <div className="flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-xs text-red-700 flex-1">Yakin hapus data ini?</span>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 rounded-lg text-xs border border-line text-ink-soft hover:bg-surface transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-red-500/20 text-red-700 border border-red-200 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    Ya, Hapus
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-500/60 hover:text-red-700 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={11} />
                  Hapus
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {showKirimWA && (
      <KirimWAModal
        type="jaringan"
        data={data}
        onClose={() => setShowKirimWA(false)}
      />
    )}
  </>
  );
}
