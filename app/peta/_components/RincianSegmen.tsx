"use client";

import Link from "next/link";
import { ExternalLink, Loader2, Network } from "lucide-react";
import { km, rentangKerja, statusTampil } from "@/app/admin/jtm/_lib/tampilan";
import type { LabelIsian, RekapSegmen, SegmenPeta } from "../_hooks/useSegmenPeta";
import { GARIS, JUDUL_BAGIAN, PANEL } from "../_ui";
import { Baris, TOMBOL_PANEL } from "./InfoTiang";

/**
 * Rincian satu segmen JTM — "Segmen ini saja" (12 Okt 2026). Isinya dipakai
 * dua tempat: panel sendiri (dari pohon segmen di folder JTM) dan di dalam
 * Persetujuan JTM, supaya yang dinilai admin selalu terlihat utuh.
 *
 * Dua sumber yang sengaja dipisah judulnya: data MASTER segmen (panjang dari
 * titik tiang, jumlah tiang) dan HASIL INSPEKSI yang sudah dikirim (konduktor,
 * jenis tiang, peralatan). Yang kedua kosong sampai segmen itu diinspeksi.
 */

const DAFTAR: { kunci: keyof LabelIsian; judul: string; satuan: "km" | "batang" | "buah" }[] = [
  { kunci: "ukuran", judul: "Ukuran konduktor", satuan: "km" },
  { kunci: "jenis", judul: "Jenis konduktor", satuan: "km" },
  { kunci: "jenis_tiang", judul: "Jenis tiang", satuan: "batang" },
  { kunci: "peralatan", judul: "Peralatan", satuan: "buah" },
];

const LABEL_KHUSUS: Record<string, string> = { "-": "Belum diisi", menumpang: "Menumpang" };

function Rincian({ isi, label, satuan }: { isi: Record<string, number>; label: Map<string, string> | undefined; satuan: string }) {
  const baris = Object.entries(isi).filter(([, n]) => Number(n) > 0);
  if (baris.length === 0) return <span className="text-gray-500">—</span>;
  return (
    <span className="block space-y-0.5">
      {baris.map(([kode, n]) => (
        <span key={kode} className="flex gap-2">
          <span className="flex-1 min-w-0 break-words">{LABEL_KHUSUS[kode] ?? label?.get(kode) ?? kode.toUpperCase()}</span>
          <span className="tabular-nums text-gray-300">
            {satuan === "km" ? km(n, 3) : `${Number(n).toLocaleString("id-ID")} ${satuan}`}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Hasil inspeksi terkirim — satu segmen, atau gabungan satu penyulang. */
export function HasilInspeksi({ r, label, kosong }: { r: RekapSegmen | null; label: LabelIsian | null; kosong: string }) {
  if (!r || r.tiang === 0) {
    return <p className="text-xs text-gray-500 mt-1">{kosong}</p>;
  }
  return (
    <div className="mt-0.5">
      <Baris label="Panjang dinilai" nilai={`${km(r.kms, 3)} · ${r.tiang.toLocaleString("id-ID")} tiang`} />
      {DAFTAR.map((d) => (
        <Baris key={d.kunci} label={d.judul} nilai={<Rincian isi={r[d.kunci]} label={label?.[d.kunci]} satuan={d.satuan} />} />
      ))}
      <Baris
        label="Gardu"
        nilai={r.gardu > 0 ? `${r.gardu} gardu · ${r.gardu_kva.toLocaleString("id-ID")} kVA` : "—"}
      />
    </div>
  );
}

/** Isi rincian, tanpa bingkai — dipakai panel ini dan Persetujuan JTM. */
export function IsiRincianSegmen({ s, tanpaJudul }: { s: SegmenPeta; tanpaJudul?: boolean }) {
  if (s.galat) return <p className="text-xs text-red-300">{s.galat}</p>;
  if (s.memuat || !s.ringkas) {
    return (
      <p className="text-xs text-gray-400 flex items-center gap-2">
        <Loader2 size={12} className="animate-spin" /> Memuat segmen…
      </p>
    );
  }
  const g = s.ringkas;
  const i = s.inspeksi;
  return (
    <div className="space-y-3">
      {!tanpaJudul && (
        <div>
          <p className={JUDUL_BAGIAN}>Segmen ini saja</p>
          <p className="text-sm font-semibold mt-0.5 break-words">{g.nama}</p>
          <p className="text-[11px] text-gray-400">{g.penyulang} · {g.ulp}</p>
        </div>
      )}

      <div>
        <p className={JUDUL_BAGIAN}>Master segmen</p>
        <Baris
          label="Panjang"
          nilai={
            <>
              {km(g.panjang_km, 3)}
              {g.gawang_tanpa_titik > 0 && (
                <span className="block text-[11px] text-amber-300">
                  {g.gawang_tanpa_titik} bentang tanpa titik — panjang sebenarnya lebih dari ini
                </span>
              )}
            </>
          }
        />
        <Baris label="Tiang" nilai={`${g.jumlah_tiang.toLocaleString("id-ID")} tiang · ${g.jumlah_gawang.toLocaleString("id-ID")} bentang`} />
        {g.gawang_terpanjang_m !== null && (
          <Baris label="Bentang terpanjang" nilai={`${Math.round(g.gawang_terpanjang_m).toLocaleString("id-ID")} m`} />
        )}
        <Baris label="Dari" nilai={g.titik_awal_nama || "—"} />
        <Baris label="Sampai" nilai={g.titik_akhir_nama || "—"} />
        {g.penghantar_jenis && (
          <Baris label="Penghantar" nilai={`${g.penghantar_jenis}${g.penghantar_ukuran ? ` ${g.penghantar_ukuran}` : ""}`} />
        )}
        {g.induk_nama && <Baris label="Induk segmen" nilai={g.induk_nama} />}
        {g.jumlah_anak > 0 && <Baris label="Cabang" nilai={`${g.jumlah_anak} segmen`} />}
      </div>

      <div>
        <p className={JUDUL_BAGIAN}>Hasil inspeksi</p>
        <HasilInspeksi r={s.rekap} label={s.label} kosong="Belum ada hasil inspeksi yang dikirim untuk segmen ini." />
      </div>

      <div>
        <p className={JUDUL_BAGIAN}>Inspeksi terakhir</p>
        {i ? (
          <>
            <Baris label="Status" nilai={`${statusTampil(i.status)} · tier ${i.tier}`} />
            <Baris label="Tanggal" nilai={rentangKerja(i.tgl_mulai, i.tgl_selesai)} />
            <Baris label="Regu" nilai={i.petugas_nama} />
          </>
        ) : (
          <p className="text-xs text-gray-500 mt-1">Segmen ini belum pernah diinspeksi.</p>
        )}
      </div>
    </div>
  );
}

/** Panel kanan "Segmen ini saja" — dari pohon segmen di folder JTM. */
export default function RincianSegmen({ s, onSemua }: { s: SegmenPeta; onSemua: () => void }) {
  return (
    <aside
      className="absolute z-[1100] top-14 right-3 w-[330px] max-w-[calc(100%-1.5rem)] max-h-[calc(100%-4.25rem)] overflow-y-auto rounded-xl border shadow-2xl p-3 space-y-3 text-[#e2e8f0]"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <IsiRincianSegmen s={s} />
      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={onSemua} className={`${TOMBOL_PANEL} border-[#00897B] text-[#5eead4]`}>
          <Network size={13} /> Tampilkan semua jaringan
        </button>
        {s.inspeksi && (
          <Link href={`/admin/jtm?inspeksi=${s.inspeksi.id}`} className={TOMBOL_PANEL}>
            <ExternalLink size={13} /> Rincian inspeksi
          </Link>
        )}
      </div>
    </aside>
  );
}
