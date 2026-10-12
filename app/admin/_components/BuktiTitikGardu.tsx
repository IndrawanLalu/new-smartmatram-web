"use client";

import { ExternalLink, MapPin } from "lucide-react";
import { EYEBROW } from "@/app/admin/_ui";
import PetaSebelumSesudah from "./PetaSebelumSesudah";

/**
 * Bukti satu usulan titik gardu: peta sebelum–sesudah, tautan Google Maps,
 * keterangan petugas, dan foto papan nama. Dipakai Persetujuan Pengukuran dan
 * Detail Pemeliharaan Gardu (12 Okt 2026) — keputusannya sama, jadi yang
 * dilihat admin juga harus sama.
 */

interface Props {
  lamaLat: number | null;
  lamaLng: number | null;
  baruLat: number;
  baruLng: number;
  akurasiM: number | null;
  selisihM: number | null;
  catatan: string | null;
  foto: string[];
  /** Kalimat akibat keputusan (master sudah/belum berubah). */
  keterangan: React.ReactNode;
}

/**
 * Verifikasi lewat Google Maps — citra satelit dan Street View di sana sering
 * lebih meyakinkan daripada peta dasar di sini untuk memastikan gardunya
 * memang berdiri di titik baru.
 */
const gmaps = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const TAUTAN =
  "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-navy-600 hover:border-navy-300 hover:bg-navy-50 transition-colors";

function TautanGmaps({
  lamaLat, lamaLng, baruLat, baruLng,
}: { lamaLat: number | null; lamaLng: number | null; baruLat: number; baruLng: number }) {
  const adaLama = lamaLat !== null && lamaLng !== null;
  return (
    <div>
      <p className={EYEBROW}>Buka di Google Maps</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {adaLama ? (
          <a href={gmaps(lamaLat, lamaLng)} target="_blank" rel="noreferrer" className={TAUTAN}>
            <MapPin size={13} className="text-slate-500" /> Titik sebelum <ExternalLink size={11} />
          </a>
        ) : (
          <span className="inline-flex items-center h-8 px-3 rounded-lg border border-dashed border-line text-xs text-ink-muted">
            Titik sebelum kosong
          </span>
        )}
        <a href={gmaps(baruLat, baruLng)} target="_blank" rel="noreferrer" className={TAUTAN}>
          <MapPin size={13} className="text-emerald-600" /> Titik sesudah <ExternalLink size={11} />
        </a>
        {/* Rute dari titik lama ke baru: dua titik tampil bersamaan di satu
            peta, lengkap dengan jaraknya. */}
        {adaLama && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${lamaLat},${lamaLng}&destination=${baruLat},${baruLng}&travelmode=walking`}
            target="_blank"
            rel="noreferrer"
            className={TAUTAN}
          >
            Sebelum → sesudah <ExternalLink size={11} />
          </a>
        )}
      </div>
      <p className="text-[11px] text-ink-muted mt-1 tabular-nums">
        {adaLama ? `${lamaLat.toFixed(6)}, ${lamaLng.toFixed(6)} → ` : ""}
        {baruLat.toFixed(6)}, {baruLng.toFixed(6)}
      </p>
    </div>
  );
}

export default function BuktiTitikGardu(p: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PetaSebelumSesudah
        titik={{
          lamaLat: p.lamaLat,
          lamaLng: p.lamaLng,
          baruLat: p.baruLat,
          baruLng: p.baruLng,
          akurasiM: p.akurasiM,
          selisihM: p.selisihM,
        }}
      />

      <div>
        <TautanGmaps lamaLat={p.lamaLat} lamaLng={p.lamaLng} baruLat={p.baruLat} baruLng={p.baruLng} />

        {p.catatan && (
          <p className="text-xs text-ink-soft mt-3">
            Keterangan: <i>“{p.catatan}”</i>
          </p>
        )}

        {/* Foto papan nama gardu — satu-satunya yang membedakan koreksi dari
            petugas yang salah gardu. Ditampilkan, bukan di balik tombol. */}
        {p.foto.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {p.foto.map((f) => (
              <a key={f} href={f} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f} alt="Bukti" className="w-28 h-28 object-cover rounded-lg border border-line bg-surface" />
              </a>
            ))}
          </div>
        ) : (
          <p className="text-xs text-amber-700 mt-2">
            Tidak ada foto bukti. Tanpa papan nama gardunya, perpindahan ini tidak bisa
            dibedakan dari petugas yang salah gardu.
          </p>
        )}

        <p className="text-[11px] text-ink-muted mt-3">{p.keterangan}</p>
      </div>
    </div>
  );
}
