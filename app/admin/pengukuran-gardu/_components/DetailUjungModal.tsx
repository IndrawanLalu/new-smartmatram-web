"use client";

import { useState } from "react";
import { BadgeCheck, ExternalLink, Loader2, TriangleAlert, Undo2, XCircle } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW } from "@/app/admin/_ui";
import PetaUjung from "./PetaUjung";
import type { TitikUjung } from "../_hooks/useTeganganUjung";

/**
 * Rincian satu titik tegangan ujung untuk diverifikasi admin: peta (gardu,
 * titik ukur, ujung JTR terjauh bila ada), foto alat ukur, angka, petugas.
 * Setujui / Kembalikan (petugas memperbaiki) / Batalkan (salah objek).
 */

export const NADA_UJUNG: Record<TitikUjung["status_tampil"], string> = {
  "Menunggu verifikasi": "bg-amber-50 text-amber-700 border-amber-200",
  Disetujui: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dikembalikan: "bg-orange-50 text-orange-700 border-orange-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};

export const meter = (v: number | null) =>
  v === null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(2).replace(".", ",")} km` : `${Math.round(v)} m`;

function Baris({ label, nilai }: { label: string; nilai: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <span className="w-40 shrink-0 text-ink-muted">{label}</span>
      <span className="text-ink">{nilai}</span>
    </div>
  );
}

interface Props {
  t: TitikUjung;
  onTutup: () => void;
  setujui: (t: TitikUjung) => Promise<boolean>;
  kembalikan: (t: TitikUjung, alasan: string) => Promise<boolean>;
  batalkan: (t: TitikUjung, alasan: string) => Promise<boolean>;
}

export default function DetailUjungModal({ t, onTutup, setujui, kembalikan, batalkan }: Props) {
  const [sibuk, setSibuk] = useState(false);
  const [aksi, setAksi] = useState<"kembali" | "batal" | null>(null);
  const amgTerkunci = !!t.amg_sent_at || !!t.amg_queued_at;
  const menunggu = t.status_tampil === "Menunggu verifikasi";

  const klikSetujui = async () => {
    setSibuk(true);
    const ok = await setujui(t);
    setSibuk(false);
    if (ok) onTutup();
  };

  return (
    <>
      <ModalShell
        title={`Tegangan ujung ${t.gardu_kode} · jurusan ${t.jurusan}`}
        subtitle={`${t.gardu_nama ?? "—"} · ${t.penyulang ?? "—"} · ${t.ulp}`}
        maxWidth="max-w-4xl"
        onClose={onTutup}
        footer={
          <>
            <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Tutup</button>
            {t.status === "Terkirim" && !amgTerkunci && (
              <>
                <button onClick={() => setAksi("batal")} className={`${BTN_GHOST} text-red-700`} disabled={sibuk}>
                  <XCircle size={14} /> Batalkan
                </button>
                <button onClick={() => setAksi("kembali")} className={`${BTN_GHOST} text-orange-700`} disabled={sibuk}>
                  <Undo2 size={14} /> Kembalikan
                </button>
              </>
            )}
            {menunggu && (
              <button onClick={() => void klikSetujui()} className={BTN_PRIMARY} disabled={sibuk}>
                {sibuk ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />} Setujui
              </button>
            )}
          </>
        }
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <PetaUjung
              titik={{
                ukurLat: t.lat,
                ukurLng: t.lng,
                akurasiM: t.akurasi_m,
                garduLat: t.gardu_lat,
                garduLng: t.gardu_lng,
                tiangLat: t.tiang_lat,
                tiangLng: t.tiang_lng,
              }}
            />
            <p className="text-[11px] mt-1.5 text-ink-soft">
              Titik ukur <b className="text-ink">{meter(t.jarak_gardu_m)}</b> dari gardu
              {t.tiang_terdekat_kode && (
                <> · <b className="text-ink">{meter(t.jarak_tiang_terdekat_m ?? null)}</b> dari tiang JTR terdekat ({t.tiang_terdekat_kode})</>
              )}
              {t.tiang_rekomendasi_kode
                ? <> · <b className="text-ink">{meter(t.jarak_rekomendasi_m)}</b> dari ujung terjauh yang direkomendasikan (tiang {t.tiang_rekomendasi_kode}, {meter(t.panjang_jaringan_m)} jaringan)</>
                : " · data JTR gardu ini belum ada, tidak ada tiang pembanding"}
              {t.akurasi_m !== null && <> · GPS ±{Math.round(t.akurasi_m)} m</>}
            </p>
            {t.jarak_gardu_m !== null && t.jarak_gardu_m < 30 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                Titik ukur hanya {meter(t.jarak_gardu_m)} dari gardu — periksa apakah benar diukur di ujung jaringan.
              </p>
            )}
            <a
              href={`https://www.google.com/maps?q=${t.lat},${t.lng}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-navy-600 hover:underline"
            >
              Buka titik ukur di Google Maps <ExternalLink size={11} />
            </a>
          </div>

          <div>
            <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_UJUNG[t.status_tampil]}`}>
              {t.status_tampil}
            </span>
            {t.alasan && <p className="text-xs text-orange-700 mt-1.5">Alasan: {t.alasan}</p>}

            <p className={`${EYEBROW} mt-4`}>Tegangan fasa-netral</p>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {([["R-N", t.v_rn], ["S-N", t.v_sn], ["T-N", t.v_tn]] as const).map(([l, v]) => (
                <div key={l} className={`rounded-lg border px-3 py-2 text-center ${Number(v) < 198 ? "border-red-200 bg-red-50" : "border-line"}`}>
                  <p className="text-[10px] font-semibold text-ink-muted">{l}</p>
                  <p className={`text-lg font-bold tabular-nums ${Number(v) < 198 ? "text-red-700" : "text-ink"}`}>{v}</p>
                </div>
              ))}
            </div>
            {t.di_bawah_standar && <p className="text-[11px] text-red-700 mt-1">Di bawah 198 V (220 V −10%).</p>}

            <div className="mt-4">
              <Baris label="Tanggal ukur" nilai={`${t.tgl_ukur} ${t.jam_ukur?.slice(0, 5) ?? ""}`} />
              <Baris label="Beban pasangan" nilai={t.tgl_beban ?? "—"} />
              <Baris label="Petugas" nilai={t.petugas_nama ?? "—"} />
              {t.verified_at && <Baris label="Disetujui" nilai={`${t.verified_by ?? "—"} · ${t.verified_at.slice(0, 10)}`} />}
              {amgTerkunci && <Baris label="AMG" nilai="Sudah masuk antrean/terkirim — tidak bisa dikembalikan" />}
            </div>

            <p className={`${EYEBROW} mt-4`}>Foto alat ukur</p>
            <a href={t.foto_url} target="_blank" rel="noreferrer" title="Buka ukuran penuh">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.foto_url} alt={`Foto alat ukur ${t.gardu_kode} jurusan ${t.jurusan}`} className="mt-1 w-full max-h-64 object-contain rounded-lg border border-line bg-surface" />
            </a>
          </div>
        </div>
      </ModalShell>

      {aksi && (
        <BatalkanModal
          judul={aksi === "kembali" ? `Kembalikan tegangan ujung ${t.gardu_kode} jurusan ${t.jurusan}?` : `Batalkan tegangan ujung ${t.gardu_kode} jurusan ${t.jurusan}?`}
          keterangan={
            aksi === "kembali"
              ? "Titik ini kembali ke HP petugas sebagai draf berisi isian lama untuk diperbaiki lalu dikirim ulang."
              : "Titik ini tidak dihitung lagi dan tidak dikirim ke AMG. Pakai untuk salah objek, bukan salah ukur."
          }
          labelTombol={aksi === "kembali" ? "Kembalikan" : "Batalkan"}
          placeholder={aksi === "kembali" ? "Alasan — mis. foto alat ukur tidak terbaca" : "Alasan — mis. diukur di gardu, bukan di ujung jaringan"}
          onTutup={() => setAksi(null)}
          onBatalkan={async (alasan) => {
            const ok = aksi === "kembali" ? await kembalikan(t, alasan) : await batalkan(t, alasan);
            if (ok) onTutup();
            return ok;
          }}
        />
      )}
    </>
  );
}
