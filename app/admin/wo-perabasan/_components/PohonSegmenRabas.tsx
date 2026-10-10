"use client";

import { Loader2, MapPin } from "lucide-react";
import { EYEBROW } from "@/app/admin/_ui";
import type { PohonSegmen } from "../_hooks/usePohonSegmenRabas";

/**
 * Pohon satu segmen dalam tiga kelompok (Cek Perabasan C4, 10 Okt 2026):
 * hasil pengecekan (paling atas — itulah yang wajib dirabas regu), perabasan
 * (bukti sebelum–sesudah), dan inspeksi (yang belum tersentuh regu ditandai).
 */

const LABEL_VEGETASI: Record<string, string> = { berpotensi: "berpotensi mengganggu", menyentuh: "menyentuh jaringan" };

function Foto({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block" title={`Buka foto ${label.toLowerCase()}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto Supabase Storage */}
      <img src={url} alt={label} className="w-24 h-24 object-cover rounded-lg border border-line bg-surface" />
      <span className="block text-[10px] text-ink-muted text-center mt-0.5">{label}</span>
    </a>
  );
}

const titik = (lat: number | null, lng: number | null) =>
  lat !== null && lng !== null ? (
    <a
      href={`https://www.google.com/maps?q=${lat},${lng}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-navy-600 hover:underline mt-0.5"
    >
      <MapPin size={11} /> {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
    </a>
  ) : null;

interface Props {
  isi: PohonSegmen | null;
  galat: string | null;
  /** Keterangan regu bila tidak ada pohon dilaporkan. */
  catatanRegu: string | null;
}

export default function PohonSegmenRabas({ isi, galat, catatanRegu }: Props) {
  if (galat) return <p className="text-xs text-amber-700">Pohon gagal dimuat: {galat}</p>;
  if (!isi) {
    return <p className="text-xs text-ink-muted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Memuat pohon…</p>;
  }

  const dirabasTiang = new Set(isi.realisasi.map((r) => r.tiang_id).filter(Boolean));
  const cekSisa = isi.cek.filter((c) => !c.dirabas).length;
  const inspeksiBelum = isi.inspeksi.filter((p) => !dirabasTiang.has(p.tiang_id));

  return (
    <div className="space-y-5">
      {isi.cek.length > 0 && (
        <div>
          <p className={`${EYEBROW} mb-2 text-red-700`}>
            Pohon hasil pengecekan · {isi.cek.length}
            <span className="normal-case"> — {cekSisa ? `${cekSisa} belum dirabas` : "semua sudah dirabas"}</span>
          </p>
          <div className="flex flex-col gap-3">
            {isi.cek.map((c) => (
              <div key={c.id} className="flex flex-wrap items-start gap-3 pb-3 border-b border-line last:border-0">
                <div className="flex gap-2">
                  {[c.foto_url, c.foto_url_2, c.foto_url_3].filter(Boolean).map((u, i) => (
                    <Foto key={u} url={u as string} label={i === 0 ? "Pengecek" : `Pengecek ${i + 1}`} />
                  ))}
                  {c.rabas_foto_sesudah_url && <Foto url={c.rabas_foto_sesudah_url} label="Sesudah dirabas" />}
                </div>
                <div className="flex-1 min-w-[160px] text-xs">
                  <p className="font-medium text-ink">{c.jenis_pohon}</p>
                  <p className="text-ink-muted mt-0.5">
                    putaran {c.putaran}{c.dicek_oleh && ` · dicek ${c.dicek_oleh}`}
                  </p>
                  {c.catatan && <p className="text-ink-soft mt-0.5">{c.catatan}</p>}
                  <p className={`mt-0.5 font-semibold ${c.dirabas ? "text-emerald-700" : "text-red-700"}`}>
                    {c.dirabas ? `sudah dirabas${c.dirabas_oleh ? ` · ${c.dirabas_oleh}` : ""}` : "belum dirabas"}
                  </p>
                  {titik(c.lat, c.lng)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className={`${EYEBROW} mb-2`}>Pohon perabasan · {isi.realisasi.length} dilaporkan</p>
        {isi.realisasi.length === 0 ? (
          <p className="text-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            Tidak ada pohon dilaporkan. Keterangan regu: {catatanRegu ? <i>“{catatanRegu}”</i> : "— tidak ada —"}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {isi.realisasi.map((p) => (
              <div key={p.id} className="flex flex-wrap items-start gap-3 pb-3 border-b border-line last:border-0">
                <div className="flex gap-2">
                  <Foto url={p.foto_sebelum_url} label="Sebelum" />
                  <Foto url={p.foto_sesudah_url} label="Sesudah" />
                </div>
                <div className="flex-1 min-w-[160px] text-xs">
                  <p className="font-medium text-ink">{p.jenis_pohon || "Jenis tidak dicatat"}</p>
                  <p className="text-ink-muted mt-0.5">
                    {p.cek_pohon_id ? "hasil pengecekan" : p.tiang_id ? "dari inspeksi JTM" : "temuan regu"}
                    {p.petugas_nama && ` · ${p.petugas_nama}`}
                  </p>
                  {p.catatan && <p className="text-ink-soft mt-0.5">{p.catatan}</p>}
                  {titik(p.lat, p.lng)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isi.inspeksi.length > 0 && (
        <div>
          <p className={`${EYEBROW} mb-2`}>
            Pohon inspeksi · {isi.inspeksi.length}
            {inspeksiBelum.length > 0 && <span className="normal-case text-amber-700"> — {inspeksiBelum.length} tanpa laporan rabas</span>}
          </p>
          <ul className="text-xs divide-y divide-line rounded-lg border border-line">
            {isi.inspeksi.map((p) => {
              const sudah = dirabasTiang.has(p.tiang_id);
              return (
                <li key={p.tiang_id} className="px-3 py-1.5 flex items-center gap-2">
                  <span className="font-medium text-ink w-36 truncate">{p.tiang_kode ?? "tiang tanpa nama"}</span>
                  <span className="flex-1 text-ink-soft truncate">
                    {p.jenis_pohon || "jenis tidak dicatat"} · {LABEL_VEGETASI[p.vegetasi] ?? p.vegetasi}
                    {!p.terverifikasi && " · inspeksi belum disetujui"}
                  </span>
                  <span className={`font-semibold ${sudah ? "text-emerald-700" : "text-amber-700"}`}>{sudah ? "dirabas" : "tanpa laporan"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
