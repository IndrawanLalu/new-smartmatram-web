"use client";

import { useState } from "react";
import { Camera, ExternalLink, Radio, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import type { FotoFasa, PenyeimbanganGardu } from "../_hooks/usePenyeimbangan";

const FASA = ["R", "S", "T", "N"] as const;
const JURUSAN = ["A", "B", "C", "D", "K"];

/** Warna label fasa mengikuti kebiasaan lapangan, bukan palet dekorasi:
 *  R merah, S kuning, T hitam, N biru. */
const FASA_CLS: Record<string, string> = {
  R: "bg-red-100 text-red-700",
  S: "bg-amber-100 text-amber-800",
  T: "bg-slate-200 text-slate-700",
  N: "bg-blue-100 text-blue-700",
};

/** Rumus sama dengan yang dikirim ke AMG (buildBody di /api/kirim-amg). */
function unbalance(r: number, s: number, t: number): number {
  const avg = (r + s + t) / 3;
  if (avg === 0) return 0;
  return ((Math.abs(r - avg) + Math.abs(s - avg) + Math.abs(t - avg)) / (3 * avg)) * 100;
}

const fmt = (n: number, d = 1) => Number(n ?? 0).toFixed(d).replace(".", ",");

function fmtTanggal(s: string): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  const bulan = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return `${Number(d)} ${bulan[Number(m)]} ${y}`;
}

interface JurusanData {
  arus?: { R?: number; S?: number; T?: number; N?: number };
  tegangan?: { R?: number; S?: number; T?: number };
}

interface Props {
  record: PenyeimbanganGardu;
  amgBusy: boolean;
  onKirimAmg: (row: PenyeimbanganGardu) => void;
  onClose: () => void;
}

export default function DetailPemerataanModal({ record, amgBusy, onKirimAmg, onClose }: Props) {
  const unbBefore = unbalance(record.arus_r_before, record.arus_s_before, record.arus_t_before);
  const unbAfter = unbalance(record.arus_r_after, record.arus_s_after, record.arus_t_after);
  const membaik = unbAfter <= unbBefore;

  const before = (record.perjurusan_before ?? {}) as Record<string, JurusanData>;
  const after = (record.perjurusan_after ?? {}) as Record<string, JurusanData>;
  const jurusanTampil = JURUSAN.filter((j) => {
    const isi = (x?: JurusanData) =>
      !!x?.arus && ((x.arus.R ?? 0) + (x.arus.S ?? 0) + (x.arus.T ?? 0) + (x.arus.N ?? 0)) > 0;
    return isi(before[j]) || isi(after[j]);
  });

  const fotoJurusan = Object.entries(record.foto_perjurusan ?? {}).filter(
    ([, f]) => f && Object.keys(f).length > 0,
  );
  const adaFotoTotal = !!record.foto_total && Object.keys(record.foto_total).length > 0;
  const adaFoto = adaFotoTotal || fotoJurusan.length > 0;

  return (
    <ModalShell
      title={`Pemerataan Beban — Gardu ${record.no_gardu}`}
      subtitle={`${record.penyulang ?? "—"} · ${fmtTanggal(record.tgl_penyeimbangan)} · ${record.petugas_penyeimbang ?? "—"}`}
      maxWidth="max-w-3xl"
      onClose={onClose}
      footer={<AmgFooter record={record} busy={amgBusy} onKirim={onKirimAmg} />}
    >
      <div className="space-y-5">
        {/* Hasil — angka yang menentukan berhasil-tidaknya pekerjaan */}
        <div className="grid grid-cols-2 gap-3">
          <Kotak label="Unbalance">
            <span className="text-ink-soft">{fmt(unbBefore)}%</span>
            <span className="mx-1.5 text-ink-muted">→</span>
            <span className={membaik ? "text-emerald-600" : "text-red-600"}>{fmt(unbAfter)}%</span>
          </Kotak>
          <Kotak label="Beban trafo">
            <span className="text-ink-soft">{fmt(record.beban_pct_before)}%</span>
            <span className="mx-1.5 text-ink-muted">→</span>
            <span className="text-ink">{fmt(record.beban_pct_after)}%</span>
          </Kotak>
        </div>

        {/* Keterangan */}
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-xs grid grid-cols-2 gap-x-6 gap-y-2">
          <Info label="ULP" nilai={record.ulp ?? "—"} />
          <Info label="Daya trafo" nilai={`${record.kva_trafo} kVA`} />
          <Info label="Jenis" nilai={record.jenis_pemeliharaan ?? "—"} />
          <Info label="Status" nilai={record.status} />
          {record.alamat && <Info label="Alamat" nilai={record.alamat} span />}
        </div>

        {/* Arus sebelum → sesudah */}
        <div>
          <h4 className="text-sm font-semibold text-ink mb-2">Arus (A)</h4>
          <TabelArus
            judul="Total gardu"
            before={{ R: record.arus_r_before, S: record.arus_s_before, T: record.arus_t_before, N: record.arus_n_before }}
            after={{ R: record.arus_r_after, S: record.arus_s_after, T: record.arus_t_after, N: record.arus_n_after }}
          />
          {jurusanTampil.map((j) => (
            <TabelArus
              key={j}
              judul={`Jurusan ${j}`}
              before={before[j]?.arus ?? {}}
              after={after[j]?.arus ?? {}}
            />
          ))}
        </div>

        {record.catatan && (
          <div className="rounded-xl border border-navy-100 bg-navy-50 px-4 py-3">
            <p className="text-[10px] font-bold text-navy-600 uppercase tracking-wide">Catatan</p>
            <p className="mt-1 text-xs text-ink leading-relaxed">{record.catatan}</p>
          </div>
        )}

        {/* Bukti foto */}
        <div>
          <h4 className="text-sm font-semibold text-ink mb-2">Bukti Foto</h4>
          {!adaFoto ? (
            <div className="rounded-xl border border-dashed border-line py-8 text-center">
              <Camera size={24} className="mx-auto text-ink-muted mb-2" />
              <p className="text-xs text-ink-soft">Rekap ini tidak punya foto bukti.</p>
              <p className="text-[11px] text-ink-muted mt-0.5">
                Foto hanya terekam untuk pekerjaan yang dicatat lewat aplikasi lapangan.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {adaFotoTotal && <FotoFasaGrid judul="Total Gardu" foto={record.foto_total!} />}
              {fotoJurusan.map(([kode, foto]) => (
                <FotoFasaGrid key={kode} judul={`Jurusan ${kode}`} foto={foto} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

// ── Sub-komponen ─────────────────────────────────────────────────────────────

function Kotak({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <p className="text-[11px] font-semibold text-ink-muted">{label}</p>
      <p className="mt-1 text-lg font-bold">{children}</p>
    </div>
  );
}

function Info({ label, nilai, span }: { label: string; nilai: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <span className="text-ink-muted">{label}: </span>
      <span className="text-ink font-medium">{nilai}</span>
    </div>
  );
}

/** Sebelum dan sesudah disandingkan per fasa — selisihnya harus terbaca sekali
 *  lihat, bukan dihitung sendiri oleh yang memeriksa. */
function TabelArus({
  judul, before, after,
}: {
  judul: string;
  before: { R?: number; S?: number; T?: number; N?: number };
  after: { R?: number; S?: number; T?: number; N?: number };
}) {
  return (
    <div className="mb-3">
      <p className="text-[11px] font-semibold text-navy-600 mb-1">{judul}</p>
      <table className="w-full text-xs border border-line rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-surface">
            <th className="px-3 py-1.5 text-left font-semibold text-ink-muted w-24" />
            {FASA.map((f) => (
              <th key={f} className="px-3 py-1.5 text-center">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${FASA_CLS[f]}`}>{f}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line">
            <td className="px-3 py-1.5 text-ink-muted">Sebelum</td>
            {FASA.map((f) => (
              <td key={f} className="px-3 py-1.5 text-center text-ink-soft">{Math.round(before[f] ?? 0)}</td>
            ))}
          </tr>
          <tr className="border-t border-line">
            <td className="px-3 py-1.5 text-ink-muted">Sesudah</td>
            {FASA.map((f) => (
              <td key={f} className="px-3 py-1.5 text-center font-bold text-ink">{Math.round(after[f] ?? 0)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FotoFasaItem({ fasa, url }: { fasa: string; url?: string }) {
  const [error, setError] = useState(false);

  return (
    <div className="relative rounded-lg overflow-hidden border border-line bg-surface aspect-4/3">
      <span className={`absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded text-[10px] font-bold ${FASA_CLS[fasa]}`}>
        {fasa}
      </span>

      {!url ? (
        <div className="w-full h-full grid place-items-center text-[11px] text-ink-muted">
          tidak difoto
        </div>
      ) : error ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full h-full grid place-items-center gap-1 text-[11px] text-navy-600 hover:underline"
        >
          <ExternalLink size={14} />
          buka foto
        </a>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" title="Buka ukuran penuh">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Foto fasa ${fasa}`}
            className="w-full h-full object-cover"
            onError={() => setError(true)}
          />
        </a>
      )}
    </div>
  );
}

/** Petak 2×2 — "satu foto berisi empat foto R S T N". Digabung saat ditampilkan,
 *  bukan dijahit di HP, supaya foto asli tetap utuh sebagai bukti. */
function FotoFasaGrid({ judul, foto }: { judul: string; foto: FotoFasa }) {
  const jumlah = FASA.filter((f) => foto[f]).length;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <p className="text-[11px] font-semibold text-navy-600">{judul}</p>
        <span className="text-[11px] text-ink-muted">{jumlah} dari 4 fasa</span>
      </div>
      <div className="grid grid-cols-2 gap-2 max-w-md">
        {FASA.map((f) => <FotoFasaItem key={f} fasa={f} url={foto[f]} />)}
      </div>
    </div>
  );
}

/** Status & aksi AMG dijadikan footer modal supaya keputusan "kirim" diambil
 *  setelah orang melihat angka dan fotonya, bukan dari baris tabel. */
function AmgFooter({
  record, busy, onKirim,
}: {
  record: PenyeimbanganGardu;
  busy: boolean;
  onKirim: (row: PenyeimbanganGardu) => void;
}) {
  const after = record.pengukuran_after?.[0];

  if (!after) {
    return (
      <p className="text-xs text-ink-muted">
        Belum ada baris pengukuran untuk AMG. Akan terbentuk sendiri saat rekap ini
        dikoreksi lewat aplikasi lapangan.
      </p>
    );
  }
  if (after.amg_sent_at) {
    return (
      <p className="text-xs font-semibold text-emerald-600">
        Sudah terkirim ke AMG · {fmtTanggal(after.amg_sent_at.split("T")[0])}
      </p>
    );
  }
  if (after.amg_queued_at) {
    return <p className="text-xs font-semibold text-navy-600">Dalam antrean — menunggu dikirim agen lokal</p>;
  }

  return (
    <div className="flex items-center gap-3">
      {after.amg_error && (
        <span className="text-xs text-red-600" title={after.amg_error}>
          Gagal{after.amg_attempts >= 3 ? " 3× — berhenti dicoba" : ""}
        </span>
      )}
      <button
        onClick={() => onKirim(record)}
        disabled={busy}
        className="ml-auto flex items-center gap-1.5 rounded-lg bg-navy-600 px-3 py-1.5 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
        {after.amg_error ? "Coba kirim lagi" : "Kirim ke AMG"}
      </button>
    </div>
  );
}
