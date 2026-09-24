"use client";

import { useState, useEffect } from "react";
import {
  X,
  AlertTriangle,
  Thermometer,
  Zap,
  History,
  ChevronDown,
  ChevronUp,
  Pencil,
  MessageCircle,
  CheckCircle2,
  Trash2,
  MapPin,
  Undo2,
} from "lucide-react";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useToast } from "@/app/admin/_components/Toast";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import KirimWAGarduModal from "./_KirimWAGarduModal";
import LoadingOverlay from "@/app/admin/_components/LoadingOverlay";
import { antreKeAmg } from "../_lib/amgQueue";
import { koordinat } from "../_lib/kandidatWo";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  type PengukuranGardu,
  HIGH_CURRENT_A,
  HIGH_TEMP_C,
  OVERLOAD_PCT,
  getNominalCurrent,
} from "../_hooks/usePengukuranGardu";

// ── Helpers ───────────────────────────────────────────────────────────────────

function val(v: number | null | undefined) {
  return v != null ? Math.round(v) : "—";
}

function fmtTanggal(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

/** Jarak dua titik di permukaan bumi, dalam meter. */
function jarakMeter(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Di atas jarak ini, titik pengukuran patut ditengok — bukan berarti salah,
 *  tapi cukup jauh dari gardunya untuk layak dilihat orang. */
const JARAK_WAJAR_M = 500;

const fmtJarak = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;

function ArusHighlight({
  v,
  threshold = HIGH_CURRENT_A,
}: {
  v: number;
  threshold?: number;
}) {
  const high = v > threshold;
  return (
    <span
      className={`font-mono font-semibold ${high ? "text-red-600" : "text-ink"}`}
    >
      {Math.round(v)}
      {high && (
        <AlertTriangle size={10} className="inline ml-0.5 text-red-500" />
      )}
    </span>
  );
}

function StatBox({
  label,
  value,
  unit = "",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
}) {
  return (
    <div className="bg-white rounded-lg px-3 py-2.5 text-center">
      <p className="text-xs text-ink-soft mb-0.5">{label}</p>
      <p className="text-base font-bold text-ink">
        {value}
        <span className="text-xs font-normal text-ink-soft ml-0.5">
          {unit}
        </span>
      </p>
    </div>
  );
}

function BebanBar({ pct }: { pct: number }) {
  const color =
    pct >= OVERLOAD_PCT
      ? "bg-red-500"
      : pct >= 60
        ? "bg-amber-500"
        : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-navy-100 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span
        className={`text-sm font-bold w-12 text-right ${pct >= OVERLOAD_PCT ? "text-red-600" : pct >= 60 ? "text-amber-600" : "text-green-600"}`}
      >
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  row: PengukuranGardu | null;
  onClose: () => void;
  onEdit: (row: PengukuranGardu) => void;
  allData?: PengukuranGardu[];
  onPatchRow?: (id: string, patch: Partial<PengukuranGardu>) => void;
  onDeleteRow?: (id: string) => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GarduDetailModal({
  row,
  onClose,
  onEdit,
  allData,
  onPatchRow,
  onDeleteRow,
}: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showKirimWA, setShowKirimWA] = useState(false);
  const [dialogKembali, setDialogKembali] = useState(false);
  const toast = useToast();
  const pengguna = useCurrentUser();
  const [amgLoading, setAmgLoading] = useState(false);
  const [amgMarked, setAmgMarked] = useState(false);
  const [amgReset, setAmgReset] = useState(false);
  const [amgSuccess, setAmgSuccess] = useState(false);
  const [amgError, setAmgError] = useState<string | null>(null);

  /**
   * Titik gardu menurut master — pembanding untuk titik tempat pengukuran
   * diambil. Diambil di sini, bukan ikut dibawa `PengukuranGardu`: baris
   * pengukuran tidak menyimpan koordinat gardu, dan menambahkannya ke seluruh
   * daftar berarti menyeret dua kolom untuk ribuan baris demi satu modal.
   */
  const [titikGardu, setTitikGardu] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!row?.no_gardu) { setTitikGardu(null); return; }
    let batal = false;

    supabaseBrowser
      .from("gardu")
      .select("lat,lng")
      .eq("kode", row.no_gardu)
      .eq("ulp", row.petugas_unit)
      .maybeSingle()
      .then(({ data }) => {
        if (batal) return;
        // `koordinat()` yang membereskan: kolom lat/lng di tabel `gardu` warisan
        // migrasi Firebase dan tipenya tidak dipatok skrip mana pun, jadi bisa
        // datang sebagai teks — dan "" akan jadi 0 kalau dipaksa Number().
        const lat = koordinat(data?.lat);
        const lng = koordinat(data?.lng);
        setTitikGardu(lat !== null && lng !== null ? { lat, lng } : null);
      });

    return () => { batal = true; };
  }, [row?.no_gardu, row?.petugas_unit]);

  if (!row) return null;

  const titikUkur =
    koordinat(row.lokasi_lat) !== null && koordinat(row.lokasi_lng) !== null
      ? { lat: koordinat(row.lokasi_lat)!, lng: koordinat(row.lokasi_lng)! }
      : null;

  const jarakKeGardu =
    titikUkur && titikGardu
      ? jarakMeter(titikUkur.lat, titikUkur.lng, titikGardu.lat, titikGardu.lng)
      : null;

  const isSent = !amgReset && !!row.amg_sent_at;
  const isQueued = !amgReset && !isSent && (amgMarked || !!row.amg_queued_at);

  async function handleKirimAmg() {
    if (amgLoading) return;
    setAmgLoading(true);
    setAmgReset(false);
    setAmgError(null);
    try {
      const err = await antreKeAmg(row!.id);
      if (err) throw new Error(err);
      setAmgMarked(true);
      setAmgSuccess(true);
      setTimeout(() => setAmgSuccess(false), 2200);
      onPatchRow?.(row!.id, { amg_queued_at: new Date().toISOString(), amg_sent_at: null, amg_error: null });
    } catch (e) {
      setAmgError(e instanceof Error ? e.message : "Gagal memasukkan ke antrean");
    } finally {
      setAmgLoading(false);
    }
  }

  const perjurusan = row.perjurusan ?? {};
  const jurusanKeys = Object.keys(perjurusan).sort();
  const isOverload = row.persen_beban >= OVERLOAD_PCT;
  const isHighTemp = row.suhu_trafo > HIGH_TEMP_C;
  const iNominal = getNominalCurrent(row.kva_trafo);
  const maxPhaseArus = Math.max(
    row.total_arus_r,
    row.total_arus_s,
    row.total_arus_t,
  );
  const isPhaseOverload = maxPhaseArus >= iNominal;
  const isPhaseWarn = !isPhaseOverload && maxPhaseArus >= iNominal * 0.9;

  const history =
    allData
      ?.filter((d) => d.no_gardu === row.no_gardu)
      .sort((a, b) => {
        const byDate = b.tanggal_pengukuran.localeCompare(a.tanggal_pengukuran);
        if (byDate !== 0) return byDate;
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      }) ?? [];

  async function handleDelete(id: string) {
    if (!onDeleteRow || deleteLoading) return;
    setDeleteLoading(true);
    await onDeleteRow(id);
    setDeletingId(null);
    setDeleteLoading(false);
    if (id === row?.id) onClose();
  }

  return (
    <>
      <LoadingOverlay
        loading={amgLoading}
        success={amgSuccess}
        icon="📡"
        title="Memasukkan ke Antrean AMG"
        subtitle="Menandai untuk dikirim agen lokal..."
        successTitle="Masuk Antrean AMG"
        successSubtitle="Agen lokal akan mengirim ke AMG"
      />

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel slide-over kanan */}
      <div className="fixed top-0 right-0 h-full w-full max-w-5xl bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-navy-600 px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-bold text-lg">{row.no_gardu}</h2>
              {isOverload && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  OVERLOAD
                </span>
              )}
              {isHighTemp && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  SUHU TINGGI
                </span>
              )}
              {isPhaseOverload && (
                <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  OVERLOAD 1 FASA
                </span>
              )}
              {isPhaseWarn && (
                <span className="bg-amber-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  WARNING 1 FASA
                </span>
              )}
              {row.wo_sent_at && (
                <span className="bg-navy-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  WO DIKIRIM
                </span>
              )}
              {row.dikembalikan_at && (
                <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  DIKEMBALIKAN
                </span>
              )}
              {isSent && (
                <span className="bg-blue-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  AMG ✅
                </span>
              )}
              {isQueued && (
                <span className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  AMG ⏳ ANTRE
                </span>
              )}
            </div>
            <p className="text-white/60 text-sm mt-0.5">
              {row.penyulang ?? "—"} · {row.petugas_unit}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSent ? (
              <div className="flex flex-col items-end gap-1">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-200 text-xs font-medium cursor-default">
                  <CheckCircle2 size={13} /> Terkirim ke AMG
                </span>
                <button
                  onClick={() => { setAmgReset(true); setAmgError(null); }}
                  className="text-[10px] text-ink-soft hover:text-white underline leading-tight"
                >
                  Kirim Ulang
                </button>
              </div>
            ) : isQueued ? (
              <div className="flex flex-col items-end gap-1">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-200 text-xs font-medium cursor-default">
                  <span className="w-3 h-3 border border-amber-200/40 border-t-amber-200 rounded-full animate-spin" />
                  Antre — agen mengirim
                </span>
                {row.amg_error ? (
                  <span className="text-red-700 text-[10px] max-w-[220px] text-right leading-tight">Gagal: {row.amg_error} (akan dicoba lagi)</span>
                ) : null}
                <button
                  onClick={() => { setAmgReset(true); setAmgError(null); }}
                  className="text-[10px] text-ink-soft hover:text-white underline leading-tight"
                >
                  Kirim ulang
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={handleKirimAmg}
                  disabled={amgLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-medium hover:bg-white/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {amgLoading ? (
                    <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  {amgLoading ? "Memproses..." : "Kirim ke AMG"}
                </button>
                {amgError && (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-red-700 text-[10px] max-w-[200px] text-right leading-tight">{amgError}</span>
                    <button
                      onClick={handleKirimAmg}
                      className="text-[10px] text-accent-deep hover:text-white underline leading-tight"
                    >
                      Coba Lagi
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setShowKirimWA(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-medium hover:bg-white/25 transition-colors"
            >
              <MessageCircle size={13} /> Kirim WO via WA
            </button>
            <button
              onClick={() => onEdit(row)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-medium hover:bg-white/25 transition-colors"
            >
              <Pencil size={13} /> Edit Data Terbaru
            </button>
            {/* Kembalikan ke petugas (butir 2): yang harus diukur/diisi ulang
                petugasnya sendiri. Salah ketik kecil cukup lewat Edit. Tidak
                untuk yang sudah ke AMG — AMG tidak menarik data kembali. */}
            {!row.dikembalikan_at && !isSent && !isQueued && (
              <button
                onClick={() => setDialogKembali(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-medium hover:bg-white/25 transition-colors"
              >
                <Undo2 size={13} /> Kembalikan ke petugas
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {row.dikembalikan_at && (
            <p className="text-xs rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
              <b>Dikembalikan ke petugas:</b> {row.dikembalikan_alasan ?? "—"}. Tidak dihitung sebagai keadaan
              terkini gardu maupun realisasi WO sampai petugas mengirim ulang dari HP.
            </p>
          )}
          {/* Info Dasar */}
          <section>
            <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
              Informasi Gardu
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-ink-soft">Alamat</p>
                <p className="font-medium text-ink">
                  {row.alamat ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Kapasitas Trafo</p>
                <p className="font-medium text-ink">
                  {row.kva_trafo} KVA
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Tanggal Pengukuran</p>
                <p className="font-medium text-ink">
                  {fmtTanggal(row.tanggal_pengukuran)}
                  {row.jam_pengukuran && (
                    <span className="ml-1.5 text-ink-soft font-normal">
                      {row.jam_pengukuran}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Petugas</p>
                <p className="font-medium text-ink">
                  {row.petugas_nama ?? "—"}
                </p>
              </div>
            </div>
          </section>

          {/* Lokasi Pengukuran */}
          <section>
            <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
              Lokasi Pengukuran
            </h3>
            <div className="bg-white border border-line rounded-xl p-4">
              {!titikUkur ? (
                <p className="text-sm text-ink-muted">
                  Titik pengukuran tidak terekam
                  {row.dari_penyeimbangan
                    ? " — baris ini hasil pemerataan beban, bukan pengukuran rutin."
                    : ". Pengukuran lama belum merekam lokasi, atau GPS petugas tidak tersedia saat menyimpan."}
                </p>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm text-ink">
                      <MapPin size={14} className="text-navy-600 shrink-0" />
                      <span className="font-mono font-medium">
                        {titikUkur.lat.toFixed(6)}, {titikUkur.lng.toFixed(6)}
                      </span>
                      {row.lokasi_akurasi != null && (
                        <span className="text-xs text-ink-muted">
                          ±{Math.round(row.lokasi_akurasi)} m
                        </span>
                      )}
                    </p>
                    {jarakKeGardu === null ? (
                      <p className="text-xs text-ink-muted mt-1">
                        Jarak tidak bisa dihitung — titik gardu belum ada di master.
                      </p>
                    ) : (
                      <p
                        className={`text-xs mt-1 ${
                          jarakKeGardu > JARAK_WAJAR_M ? "text-amber-700 font-medium" : "text-ink-soft"
                        }`}
                      >
                        {fmtJarak(jarakKeGardu)} dari titik gardu
                        {jarakKeGardu > JARAK_WAJAR_M && " — cukup jauh, perlu ditengok"}
                      </p>
                    )}
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${titikUkur.lat},${titikUkur.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-ink-soft hover:text-navy-600 hover:border-navy-300 transition-colors"
                  >
                    Buka di Peta
                  </a>
                </div>
              )}
            </div>
          </section>

          {/* Beban Trafo */}
          <section>
            <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
              Beban Trafo
            </h3>
            <div className="bg-white border border-line rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-soft">
                  {Math.round(row.beban_kva)} KVA / {row.kva_trafo} KVA
                </span>
                <span
                  className={`text-sm font-bold ${isOverload ? "text-red-600" : "text-ink"}`}
                >
                  {isOverload ? "⚠ OVERLOAD" : "Normal"}
                </span>
              </div>
              <BebanBar pct={row.persen_beban} />
            </div>
          </section>

          {/* Pengukuran Total */}
          <section>
            <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
              Pengukuran Total
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-ink-soft mb-1.5 flex items-center gap-1">
                  <Zap size={11} /> Arus (Ampere)
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <StatBox
                    label="Fasa R"
                    value={<ArusHighlight v={row.total_arus_r} />}
                    unit=""
                  />
                  <StatBox
                    label="Fasa S"
                    value={<ArusHighlight v={row.total_arus_s} />}
                    unit=""
                  />
                  <StatBox
                    label="Fasa T"
                    value={<ArusHighlight v={row.total_arus_t} />}
                    unit=""
                  />
                  <StatBox
                    label="Netral"
                    value={val(row.total_arus_n)}
                    unit=""
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-ink-soft mb-1.5">
                  Tegangan Fasa-Netral (Volt)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <StatBox
                    label="V R-N"
                    value={val(row.total_teg_rn)}
                    unit=""
                  />
                  <StatBox
                    label="V S-N"
                    value={val(row.total_teg_sn)}
                    unit=""
                  />
                  <StatBox
                    label="V T-N"
                    value={val(row.total_teg_tn)}
                    unit=""
                  />
                </div>
              </div>
              {(row.total_teg_rs != null ||
                row.total_teg_st != null ||
                row.total_teg_rt != null) && (
                <div>
                  <p className="text-xs text-ink-soft mb-1.5">
                    Tegangan Fasa-Fasa (Volt)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <StatBox
                      label="V R-S"
                      value={val(row.total_teg_rs)}
                      unit=""
                    />
                    <StatBox
                      label="V S-T"
                      value={val(row.total_teg_st)}
                      unit=""
                    />
                    <StatBox
                      label="V R-T"
                      value={val(row.total_teg_rt)}
                      unit=""
                    />
                  </div>
                </div>
              )}
              <div
                className={`flex items-center justify-between px-4 py-3 rounded-xl border ${isHighTemp ? "bg-amber-50 border-amber-200" : "bg-white border-line"}`}
              >
                <div className="flex items-center gap-2">
                  <Thermometer
                    size={16}
                    className={isHighTemp ? "text-amber-600" : "text-ink-soft"}
                  />
                  <span
                    className={`text-sm font-medium ${isHighTemp ? "text-amber-700" : "text-ink-soft"}`}
                  >
                    Suhu Trafo
                  </span>
                  {isHighTemp && (
                    <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                      TINGGI
                    </span>
                  )}
                </div>
                <span
                  className={`text-xl font-bold ${isHighTemp ? "text-amber-600" : "text-ink"}`}
                >
                  {row.suhu_trafo}°C
                </span>
              </div>
            </div>
          </section>

          {/* Per Jurusan */}
          <section>
            <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2">
              Pengukuran Per Jurusan
            </h3>
            {jurusanKeys.length === 0 ? (
              <p className="text-sm text-ink-soft text-center py-4 bg-white rounded-xl">
                Tidak ada data perjurusan
              </p>
            ) : (
              <div className="border border-line rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-navy-50">
                      <th className="text-left px-4 py-2.5 text-xs text-accent-deep font-semibold">
                        Jurusan
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs text-accent-deep font-semibold">
                        Arus R (A)
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs text-accent-deep font-semibold">
                        Arus S (A)
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs text-accent-deep font-semibold">
                        Arus T (A)
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs text-accent-deep font-semibold">
                        Arus N (A)
                      </th>
                      <th className="text-center px-3 py-2.5 text-xs text-accent-deep font-semibold">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {jurusanKeys.map((key, i) => {
                      const j = perjurusan[key];
                      const arus = j?.arus ?? { R: 0, S: 0, T: 0, N: 0 };
                      const highR = arus.R > HIGH_CURRENT_A;
                      const highS = arus.S > HIGH_CURRENT_A;
                      const highT = arus.T > HIGH_CURRENT_A;
                      const anyHigh = highR || highS || highT;
                      const maxArus = Math.max(arus.R, arus.S, arus.T);
                      return (
                        <tr
                          key={key}
                          className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} ${anyHigh ? "border-l-2 border-l-red-400" : ""}`}
                        >
                          <td className="px-4 py-3 font-bold text-ink">
                            {key}
                          </td>
                          <td
                            className={`px-3 py-3 text-center ${highR ? "bg-red-50" : ""}`}
                          >
                            <span
                              className={`font-mono text-sm font-semibold ${highR ? "text-red-600" : "text-ink"}`}
                            >
                              {Math.round(arus.R)}
                              {highR && (
                                <AlertTriangle
                                  size={10}
                                  className="inline ml-0.5"
                                />
                              )}
                            </span>
                          </td>
                          <td
                            className={`px-3 py-3 text-center ${highS ? "bg-red-50" : ""}`}
                          >
                            <span
                              className={`font-mono text-sm font-semibold ${highS ? "text-red-600" : "text-ink"}`}
                            >
                              {Math.round(arus.S)}
                              {highS && (
                                <AlertTriangle
                                  size={10}
                                  className="inline ml-0.5"
                                />
                              )}
                            </span>
                          </td>
                          <td
                            className={`px-3 py-3 text-center ${highT ? "bg-red-50" : ""}`}
                          >
                            <span
                              className={`font-mono text-sm font-semibold ${highT ? "text-red-600" : "text-ink"}`}
                            >
                              {Math.round(arus.T)}
                              {highT && (
                                <AlertTriangle
                                  size={10}
                                  className="inline ml-0.5"
                                />
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-mono text-sm text-ink-soft">
                            {Math.round(arus.N ?? 0)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {anyHigh ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                <AlertTriangle size={9} /> {Math.round(maxArus)}
                                A
                              </span>
                            ) : maxArus > 0 ? (
                              <span className="text-xs text-green-600 font-semibold">
                                ✓ Normal
                              </span>
                            ) : (
                              <span className="text-xs text-ink-soft">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {jurusanKeys.some((k) => perjurusan[k]?.tegangan) && (
                  <div className="border-t border-line bg-white px-4 py-3">
                    <p className="text-xs font-semibold text-ink-soft mb-2">
                      Tegangan Ujung per Jurusan (V)
                    </p>
                    <div className="grid grid-cols-5 gap-2">
                      {jurusanKeys.map((key) => {
                        const teg = perjurusan[key]?.tegangan;
                        if (!teg) return null;
                        return (
                          <div
                            key={key}
                            className="bg-white rounded-lg p-2 text-center border border-line"
                          >
                            <p className="text-xs font-bold text-accent-deep">
                              {key}
                            </p>
                            <p className="text-xs text-ink-soft mt-0.5">
                              <span title="R">{Math.round(teg.R ?? 0)}</span>
                              <span className="text-ink-muted"> / </span>
                              <span title="S">{Math.round(teg.S ?? 0)}</span>
                              <span className="text-ink-muted"> / </span>
                              <span title="T">{Math.round(teg.T ?? 0)}</span>
                            </p>
                            <p className="text-[10px] text-ink-muted">R/S/T V</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Riwayat Pengukuran — collapsible */}
          {history.length > 1 && (
            <section>
              <button
                onClick={() => setHistoryOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl hover:bg-navy-50 transition-colors"
              >
                <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider flex items-center gap-1.5">
                  <History size={12} /> Riwayat Pengukuran ({history.length})
                </span>
                {historyOpen ? (
                  <ChevronUp size={14} className="text-ink-soft" />
                ) : (
                  <ChevronDown size={14} className="text-ink-soft" />
                )}
              </button>

              {historyOpen && (
                <div className="space-y-3 mt-3">
                  {history.map((h) => {
                    const isLatest = h.id === row.id;
                    const hOverload = h.persen_beban >= OVERLOAD_PCT;
                    const hHighTemp = h.suhu_trafo > HIGH_TEMP_C;
                    const hHighR = h.total_arus_r > HIGH_CURRENT_A;
                    const hHighS = h.total_arus_s > HIGH_CURRENT_A;
                    const hHighT = h.total_arus_t > HIGH_CURRENT_A;
                    const hPerjurusan = h.perjurusan ?? {};
                    const hJurusanKeys = Object.keys(hPerjurusan).sort();
                    const hasTeg = hJurusanKeys.some(
                      (k) => hPerjurusan[k]?.tegangan,
                    );

                    return (
                      <div
                        key={h.id}
                        className={`border rounded-xl overflow-hidden ${isLatest ? "border-navy-500" : "border-line"}`}
                      >
                        {/* Entry header */}
                        <div
                          className={`px-4 py-2.5 flex items-center justify-between ${isLatest ? "bg-navy-50" : "bg-white"}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-ink">
                              {fmtTanggal(h.tanggal_pengukuran)}
                              {h.jam_pengukuran && (
                                <span className="ml-1.5 text-xs text-ink-soft font-normal">
                                  {h.jam_pengukuran}
                                </span>
                              )}
                            </span>
                            {isLatest && (
                              <span className="text-[10px] bg-navy-600 text-white px-1.5 py-0.5 rounded-full font-semibold">
                                terbaru
                              </span>
                            )}
                            {hOverload && (
                              <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                                OVERLOAD
                              </span>
                            )}
                            {h.wo_sent_at && (
                              <span className="text-[10px] bg-navy-50 text-navy-600 border border-navy-200 px-1.5 py-0.5 rounded-full font-semibold">
                                WO
                              </span>
                            )}
                            {h.amg_sent_at && (
                              <span className="text-[10px] bg-blue-700/40 text-blue-700 border border-blue-600/40 px-1.5 py-0.5 rounded-full font-semibold">
                                AMG
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-3 text-xs">
                              <span
                                className={`font-bold font-mono ${hOverload ? "text-red-600" : "text-navy-600"}`}
                              >
                                {Math.round(h.persen_beban)}% ·{" "}
                                {Math.round(h.beban_kva)} KVA
                              </span>
                              <span
                                className={`font-mono ${hHighTemp ? "text-amber-600 font-semibold" : "text-ink-soft"}`}
                              >
                                {h.suhu_trafo}°C
                              </span>
                              <span className="text-ink-soft">
                                {h.petugas_nama ?? "—"}
                              </span>
                            </div>
                            <button
                              onClick={() => onEdit(h)}
                              className="flex items-center gap-1 text-[10px] text-navy-600 hover:text-navy-700 font-semibold transition-colors border border-navy-300 rounded px-1.5 py-0.5"
                            >
                              <Pencil size={9} /> Edit
                            </button>
                            {onDeleteRow && (
                              deletingId === h.id ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-red-600">Yakin hapus?</span>
                                  <button
                                    onClick={() => handleDelete(h.id)}
                                    disabled={deleteLoading}
                                    className="text-[10px] text-white bg-red-500 hover:bg-red-600 font-semibold rounded px-1.5 py-0.5 disabled:opacity-50"
                                  >
                                    Ya
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(null)}
                                    className="text-[10px] text-ink-soft hover:text-white border border-line rounded px-1.5 py-0.5"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeletingId(h.id)}
                                  className="flex items-center gap-1 text-[10px] text-red-600 hover:text-red-700 font-semibold transition-colors border border-red-200 rounded px-1.5 py-0.5"
                                >
                                  <Trash2 size={9} /> Hapus
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        {/* Pengukuran total grid */}
                        <div className="px-4 py-2.5 grid grid-cols-4 gap-x-6 gap-y-1 text-xs border-b border-line bg-white">
                          <div>
                            <span className="text-ink-soft">Arus R: </span>
                            <span
                              className={`font-mono font-semibold ${hHighR ? "text-red-600" : "text-ink"}`}
                            >
                              {Math.round(h.total_arus_r)} A
                              {hHighR && (
                                <AlertTriangle
                                  size={9}
                                  className="inline ml-0.5"
                                />
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="text-ink-soft">Arus S: </span>
                            <span
                              className={`font-mono font-semibold ${hHighS ? "text-red-600" : "text-ink"}`}
                            >
                              {Math.round(h.total_arus_s)} A
                              {hHighS && (
                                <AlertTriangle
                                  size={9}
                                  className="inline ml-0.5"
                                />
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="text-ink-soft">Arus T: </span>
                            <span
                              className={`font-mono font-semibold ${hHighT ? "text-red-600" : "text-ink"}`}
                            >
                              {Math.round(h.total_arus_t)} A
                              {hHighT && (
                                <AlertTriangle
                                  size={9}
                                  className="inline ml-0.5"
                                />
                              )}
                            </span>
                          </div>
                          <div>
                            <span className="text-ink-soft">Arus N: </span>
                            <span className="font-mono text-ink">
                              {Math.round(h.total_arus_n)} A
                            </span>
                          </div>
                          <div>
                            <span className="text-ink-soft">Teg R-N: </span>
                            <span className="font-mono text-ink">
                              {Math.round(h.total_teg_rn)} V
                            </span>
                          </div>
                          <div>
                            <span className="text-ink-soft">Teg S-N: </span>
                            <span className="font-mono text-ink">
                              {Math.round(h.total_teg_sn)} V
                            </span>
                          </div>
                          <div>
                            <span className="text-ink-soft">Teg T-N: </span>
                            <span className="font-mono text-ink">
                              {Math.round(h.total_teg_tn)} V
                            </span>
                          </div>
                          <div>
                            <span className="text-ink-soft">Suhu: </span>
                            <span
                              className={`font-mono font-semibold ${hHighTemp ? "text-amber-600" : "text-ink"}`}
                            >
                              {h.suhu_trafo} °C
                            </span>
                          </div>
                          {h.total_teg_rs != null && (
                            <div>
                              <span className="text-ink-soft">Teg R-S: </span>
                              <span className="font-mono text-ink">
                                {Math.round(h.total_teg_rs)} V
                              </span>
                            </div>
                          )}
                          {h.total_teg_st != null && (
                            <div>
                              <span className="text-ink-soft">Teg S-T: </span>
                              <span className="font-mono text-ink">
                                {Math.round(h.total_teg_st)} V
                              </span>
                            </div>
                          )}
                          {h.total_teg_rt != null && (
                            <div>
                              <span className="text-ink-soft">Teg R-T: </span>
                              <span className="font-mono text-ink">
                                {Math.round(h.total_teg_rt)} V
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Per jurusan */}
                        {hJurusanKeys.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs whitespace-nowrap">
                              <thead>
                                <tr className="bg-gray-50 border-b border-line">
                                  <th className="text-left px-3 py-1.5 text-ink-soft font-semibold">
                                    Jurusan
                                  </th>
                                  <th className="text-center px-2 py-1.5 text-ink-soft font-semibold">
                                    Arus R (A)
                                  </th>
                                  <th className="text-center px-2 py-1.5 text-ink-soft font-semibold">
                                    Arus S (A)
                                  </th>
                                  <th className="text-center px-2 py-1.5 text-ink-soft font-semibold">
                                    Arus T (A)
                                  </th>
                                  <th className="text-center px-2 py-1.5 text-ink-soft font-semibold">
                                    Arus N (A)
                                  </th>
                                  {hasTeg && (
                                    <>
                                      <th className="text-center px-2 py-1.5 text-ink-soft font-semibold">
                                        Teg Ujung R (V)
                                      </th>
                                      <th className="text-center px-2 py-1.5 text-ink-soft font-semibold">
                                        Teg Ujung S (V)
                                      </th>
                                      <th className="text-center px-2 py-1.5 text-ink-soft font-semibold">
                                        Teg Ujung T (V)
                                      </th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {hJurusanKeys.map((k, ki) => {
                                  const jd = hPerjurusan[k];
                                  const a = jd?.arus ?? {
                                    R: 0,
                                    S: 0,
                                    T: 0,
                                    N: 0,
                                  };
                                  const teg = jd?.tegangan;
                                  const jHR = a.R > HIGH_CURRENT_A;
                                  const jHS = a.S > HIGH_CURRENT_A;
                                  const jHT = a.T > HIGH_CURRENT_A;
                                  return (
                                    <tr
                                      key={k}
                                      className={
                                        ki % 2 === 0
                                          ? "bg-white"
                                          : "bg-gray-50/50"
                                      }
                                    >
                                      <td className="px-3 py-1.5 font-bold text-ink">
                                        {k}
                                      </td>
                                      <td
                                        className={`px-2 py-1.5 text-center font-mono ${jHR ? "text-red-600 font-semibold" : "text-ink-soft"}`}
                                      >
                                        {Math.round(a.R)}
                                        {jHR && (
                                          <AlertTriangle
                                            size={8}
                                            className="inline ml-0.5"
                                          />
                                        )}
                                      </td>
                                      <td
                                        className={`px-2 py-1.5 text-center font-mono ${jHS ? "text-red-600 font-semibold" : "text-ink-soft"}`}
                                      >
                                        {Math.round(a.S)}
                                        {jHS && (
                                          <AlertTriangle
                                            size={8}
                                            className="inline ml-0.5"
                                          />
                                        )}
                                      </td>
                                      <td
                                        className={`px-2 py-1.5 text-center font-mono ${jHT ? "text-red-600 font-semibold" : "text-ink-soft"}`}
                                      >
                                        {Math.round(a.T)}
                                        {jHT && (
                                          <AlertTriangle
                                            size={8}
                                            className="inline ml-0.5"
                                          />
                                        )}
                                      </td>
                                      <td className="px-2 py-1.5 text-center font-mono text-ink-soft">
                                        {Math.round(a.N ?? 0)}
                                      </td>
                                      {hasTeg && (
                                        <>
                                          <td className="px-2 py-1.5 text-center font-mono text-ink-soft">
                                            {Math.round(teg?.R ?? 0)}
                                          </td>
                                          <td className="px-2 py-1.5 text-center font-mono text-ink-soft">
                                            {Math.round(teg?.S ?? 0)}
                                          </td>
                                          <td className="px-2 py-1.5 text-center font-mono text-ink-soft">
                                            {Math.round(teg?.T ?? 0)}
                                          </td>
                                        </>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {dialogKembali && (
        <BatalkanModal
          judul={`Kembalikan pengukuran ${row.no_gardu} ke petugas?`}
          keterangan={`Muncul lagi di HP ${row.petugas_nama ?? "petugas"} sebagai draf berisi isian lama untuk diperbaiki dan dikirim ulang. Selama itu pengukuran ini tidak dihitung.`}
          labelTombol="Kembalikan ke petugas"
          placeholder="Apa yang harus diperbaiki — mis. arus fasa T tertukar dengan N, ukur ulang saat beban puncak"
          onTutup={() => setDialogKembali(false)}
          onBatalkan={async (alasan) => {
            const { error } = await supabaseBrowser.rpc("kembalikan_pengukuran", {
              p_id: row.id,
              p_alasan: alasan,
              p_nama: pengguna.name ?? pengguna.email ?? null,
            });
            if (error) {
              toast.error(error.message);
              return false;
            }
            onPatchRow?.(row.id, { dikembalikan_at: new Date().toISOString(), dikembalikan_alasan: alasan });
            toast.success(`Pengukuran ${row.no_gardu} dikembalikan ke petugas.`);
            return true;
          }}
        />
      )}
      {showKirimWA && (
        <KirimWAGarduModal
          data={row}
          onClose={() => setShowKirimWA(false)}
          onWoMarked={(sentAt, jenis) => onPatchRow?.(row.id, { wo_sent_at: sentAt, jenis_pemeliharaan: jenis })}
        />
      )}
    </>
  );
}
