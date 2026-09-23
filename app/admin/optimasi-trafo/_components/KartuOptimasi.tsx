"use client";

import { ArrowRight, Ban, Check, Link2, Loader2, MapPin, TriangleAlert } from "lucide-react";
import { CARD, BTN_GHOST } from "@/app/admin/_ui";
import type { BarisOptimasi, Jejak } from "../_hooks/useOptimasiTrafo";

/**
 * Satu optimasi trafo, disusun untuk DIPUTUSKAN — bukan sekadar dibaca.
 *
 * Yang admin perlu tahu sebelum menekan Verifikasi ada tiga, dan ketiganya
 * ditaruh di permukaan:
 *   1. Apa yang berubah di master (kVA dan nomor seri, lama → baru).
 *   2. Apakah papan nama trafo lama cocok dengan master SEBELUM pekerjaan ini.
 *      Kalau tidak, masternya sudah salah sejak lama — temuan tersendiri.
 *   3. Apakah perpindahan trafonya sudah bersambung ke gardu seberang lewat
 *      nomor seri, atau masih jejak yang terbuka.
 * Foto papan nama lama dan baru berdampingan, karena dari situlah nomor seri
 * dibaca dan diperiksa.
 */

const NADA: Record<string, string> = {
  Selesai: "bg-amber-50 text-amber-700 border-amber-200",
  Diverifikasi: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};

const NADA_JEJAK: Record<Exclude<Jejak, null>, string> = {
  bersambung: "text-emerald-700",
  dipastikan: "text-navy-600",
  terbuka: "text-amber-700",
};

const KATA_JEJAK: Record<Exclude<Jejak, null>, string> = {
  bersambung: "tersambung lewat nomor seri",
  dipastikan: "dipastikan admin",
  terbuka: "belum ada catatan di gardu itu",
};

const tanggal = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const seriBeda = (a: string | null, b: string | null) =>
  !!a && !!b && a.toUpperCase().replace(/[^A-Z0-9]/g, "") !== b.toUpperCase().replace(/[^A-Z0-9]/g, "");

function Foto({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 group" title={`Buka ${label} ukuran penuh`}>
      {/* next/image sengaja tidak dipakai — sama dengan Pemeliharaan Jaringan. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="w-full h-32 object-cover rounded-lg border border-line group-hover:border-navy-300" />
      <span className="block text-[10px] text-ink-muted mt-1">{label}</span>
    </a>
  );
}

function BarisJejak({ label, isi, jejak }: { label: string; isi: string; jejak: Jejak }) {
  return (
    <p className="text-xs text-ink-soft">
      <span className="text-ink-muted">{label}:</span> {isi}
      {jejak && <span className={`ml-1.5 text-[11px] font-semibold ${NADA_JEJAK[jejak]}`}>· {KATA_JEJAK[jejak]}</span>}
    </p>
  );
}

interface Props {
  b: BarisOptimasi;
  sibuk: boolean;
  onVerifikasi: () => void;
  onBatalkan: () => void;
  onPastikan: () => void;
}

export default function KartuOptimasi({ b, sibuk, onVerifikasi, onBatalkan, onPastikan }: Props) {
  const naik = b.kvaBaru > b.kvaLama ? "Uprating" : b.kvaBaru < b.kvaLama ? "Downrating" : "Ganti setara";
  const kvaMasterBeda = b.kvaLamaMaster !== null && b.kvaLamaMaster !== b.kvaLama;
  const seriMasterBeda = seriBeda(b.noSeriLama, b.noSeriLamaMaster);
  const jejakTerbuka = b.jejakAsal === "terbuka" || b.jejakTujuan === "terbuka";

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[260px] flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink">{b.kodeGardu}</span>
            <span className="text-xs text-ink-muted">{b.ulp}{b.penyulang ? ` · ${b.penyulang}` : ""}</span>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${NADA[b.status] ?? NADA.Selesai}`}>
              {b.status}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-navy-50 border border-navy-200 text-[10px] font-bold text-navy-700">
              {b.pengukuranId ? "WO" : "di luar WO"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            {b.kvaLama} kVA <ArrowRight size={14} className="text-ink-muted" /> {b.kvaBaru} kVA
            <span className="text-[11px] font-medium text-ink-soft">({naik})</span>
          </div>
          <p className="text-xs text-ink-soft font-mono">
            {b.seriLamaTakTerbaca ? "seri lama tak terbaca" : b.noSeriLama} → {b.noSeriBaru}
            {(b.merkBaru || b.tahunBaru) && (
              <span className="font-sans text-ink-muted"> · {[b.merkBaru, b.tahunBaru].filter(Boolean).join(" ")}</span>
            )}
          </p>

          {(kvaMasterBeda || seriMasterBeda) && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <TriangleAlert size={12} className="mt-0.5 shrink-0" />
              Papan nama trafo lama tidak cocok dengan master
              {kvaMasterBeda && ` — master ${b.kvaLamaMaster} kVA`}
              {seriMasterBeda && ` — master seri ${b.noSeriLamaMaster}`}. Masternya sudah salah sebelum pekerjaan ini.
            </p>
          )}

          <BarisJejak
            label="Trafo baru dari"
            isi={b.asal === "GARDU" ? `gardu ${b.asalKode} (${b.asalUlp})` : "gudang"}
            jejak={b.jejakAsal}
          />
          <BarisJejak
            label="Trafo lama ke"
            isi={b.tujuan === "GARDU" ? `gardu ${b.tujuanKode} (${b.tujuanUlp})` : b.tujuan.toLowerCase()}
            jejak={b.jejakTujuan}
          />

          <p className="text-xs text-ink-soft">
            {b.alasanLabel} · operasi {tanggal(b.tglOperasi)}
            {b.petugasNama ? ` · ${b.petugasNama}` : ""}
          </p>
          {b.catatan && <p className="text-[11px] text-ink-muted italic">{b.catatan}</p>}

          <div className="flex items-center gap-3 flex-wrap text-[11px]">
            {b.lat !== null && b.lng !== null ? (
              <a href={`https://www.google.com/maps?q=${b.lat},${b.lng}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-navy-600 hover:text-navy-500">
                <MapPin size={12} /> {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1 text-ink-muted"><MapPin size={12} /> titik tidak terbaca</span>
            )}
            <span className="text-ink-muted">
              usulan master: {b.usulanMenunggu} menunggu · {b.usulanDisetujui} diterapkan
            </span>
            {b.verifiedBy && <span className="text-ink-muted">{b.status.toLowerCase()} oleh {b.verifiedBy}</span>}
          </div>
        </div>

        <div className="w-full sm:w-[300px] shrink-0">
          <p className="text-[10px] font-semibold text-ink-muted mb-1.5">PAPAN NAMA LAMA &amp; BARU</p>
          <div className="flex gap-2">
            <Foto url={b.fotoLama} label="trafo lama" />
            <Foto url={b.fotoBaru} label="trafo baru" />
          </div>
        </div>
      </div>

      {(b.status === "Selesai" || (jejakTerbuka && b.status !== "Dibatalkan")) && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-line">
          {b.status === "Selesai" && (
            <button
              onClick={onVerifikasi}
              disabled={sibuk}
              title="Menyetujui catatan ini sekaligus menerapkan usulan kVA dan nomor seri ke master gardu"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-navy-600 text-white hover:bg-navy-500 disabled:opacity-40"
            >
              {sibuk ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Verifikasi &amp; terapkan ke master
            </button>
          )}
          {jejakTerbuka && (
            <button onClick={onPastikan} disabled={sibuk} className={`${BTN_GHOST} h-8 px-3 text-xs`}>
              <Link2 size={12} /> Gardu seberang sudah dipastikan
            </button>
          )}
          {b.status === "Selesai" && (
            <button onClick={onBatalkan} disabled={sibuk} className={`${BTN_GHOST} h-8 px-3 text-xs`}>
              <Ban size={12} /> Salah input
            </button>
          )}
        </div>
      )}
    </div>
  );
}
