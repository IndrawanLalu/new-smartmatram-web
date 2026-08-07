"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  MapPin, ExternalLink, AlertTriangle, Building2, Zap, Cable,
  ShieldCheck, ArrowDownToLine,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

const LocationMap = dynamic(() => import("@/app/admin/_components/LocationMap"), { ssr: false });

interface MasterRow {
  kode: string;
  ulp: string | null;
  kode_amg: string | null;
  nama: string | null;
  alamat: string | null;
  feeder: string | null;
  daya: number | null;
  merk: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
  data_amg: Record<string, string> | null;
}

// ── Pemetaan kolom AMG ke kartu ───────────────────────────────────────────────
//
// Ekspor AMG punya 27 kolom, dan ke-27-nya terpetakan ke salah satu kartu di
// bawah. `SISA` di bagian bawah panel menangkap kolom yang belum dikenal —
// normalnya kosong, tapi menjaga agar penambahan kolom di sisi AMG tidak
// hilang begitu saja tanpa ada yang sadar.

interface Field {
  key: string;
  label: string;
  satuan?: string;
}

const UMUM: Field[] = [
  { key: "NAMA AREA", label: "Area" },
  { key: "ID UP", label: "ID UP" },
  { key: "ID PENYULANG", label: "ID Penyulang" },
  { key: "JURUSAN OPERASI", label: "Jurusan Operasi" },
  { key: "GRD KHUSUS", label: "Gardu Khusus" },
  { key: "STATUS", label: "Status AMG" },
  { key: "TGL OPERASI", label: "Tanggal Operasi" },
  { key: "TGL MUTASI", label: "Tanggal Mutasi" },
  { key: "TGL LOG", label: "Tanggal Log" },
];

const SPEK_TRAFO: Field[] = [
  { key: "NO SERI", label: "No Seri" },
  { key: "TAHUN PEMBUATAN", label: "Tahun Pembuatan" },
  { key: "KONS TRAFO", label: "Konstruksi" },
  { key: "HUB BELITAN", label: "Hubungan Belitan" },
  { key: "ARUS PRIMER", label: "Arus Primer", satuan: "A" },
  { key: "ARUS SEKUNDER", label: "Arus Nominal", satuan: "A" },
];

const SPEK_KABEL: Field[] = [
  { key: "JENIS KABEL INC", label: "Jenis Kabel Masuk" },
  { key: "PENAMPANG INC", label: "Penampang Masuk", satuan: "mm²" },
  { key: "JENIS KABEL OUT", label: "Jenis Kabel Keluar" },
  { key: "PENAMPANG OUT", label: "Penampang Keluar", satuan: "mm²" },
];

/** Sudah tampil di salah satu kartu — tidak diulang di bagian "Data Lain". */
const SUDAH_TAMPIL = new Set([
  ...UMUM.map((f) => f.key),
  ...SPEK_TRAFO.map((f) => f.key),
  ...SPEK_KABEL.map((f) => f.key),
  "NO GARDU", "DAYA", "MERK", "ALAMAT", "NAMA RAYON", "NAMA PENYULANG",
  "KOORDINAT X", "KOORDINAT Y",
]);

// ── Bagian tampilan ───────────────────────────────────────────────────────────

function Baris({ label, nilai, tebal }: {
  label: string;
  nilai: React.ReactNode;
  tebal?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <span className="text-xs font-medium text-ink-soft w-32 shrink-0">{label}</span>
      <span className={`text-sm min-w-0 break-words ${tebal ? "font-semibold text-ink" : "text-ink"}`}>
        {nilai}
      </span>
    </div>
  );
}

function Kartu({ judul, ikon, catatan, rapat, children }: {
  judul: string;
  ikon: React.ReactNode;
  catatan?: string;
  /** Lewati padding isi — untuk kartu yang isinya peta. */
  rapat?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line overflow-hidden bg-white">
      <div className="flex items-center gap-2 bg-surface px-3.5 py-2 border-b border-line">
        {ikon}
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink">{judul}</h3>
      </div>
      <div className={rapat ? "" : "px-3.5 py-1.5 divide-y divide-line/60"}>{children}</div>
      {catatan && (
        <p className="px-3.5 pb-2.5 pt-1.5 text-xs leading-relaxed text-ink-soft border-t border-line/60">
          {catatan}
        </p>
      )}
    </section>
  );
}

/** Kartu yang datanya memang belum ada sumbernya — dikatakan apa adanya,
 *  bukan dibiarkan kosong tanpa penjelasan. */
function KartuKosong({ judul, ikon, pesan }: {
  judul: string;
  ikon: React.ReactNode;
  pesan: string;
}) {
  return (
    <Kartu judul={judul} ikon={ikon} rapat>
      <div className="px-3.5 py-5 text-center">
        <p className="text-sm text-ink-soft leading-relaxed max-w-sm mx-auto">{pesan}</p>
      </div>
    </Kartu>
  );
}

function isiField(amg: Record<string, string>, daftar: Field[]) {
  return daftar
    .filter((f) => amg[f.key])
    .map((f) => (
      <Baris
        key={f.key}
        label={f.label}
        nilai={f.satuan ? `${amg[f.key]} ${f.satuan}` : amg[f.key]}
      />
    ));
}

const IKON = "w-3.5 h-3.5 text-navy-600";

// ── Panel ─────────────────────────────────────────────────────────────────────

interface Props {
  kode: string;
  ulp: string | null;
  /** kVA yang dipakai pada pengukuran terakhir — dibandingkan dengan master. */
  kvaPengukuran?: number | null;
}

export default function DataGarduPanel({ kode, ulp, kvaPengukuran }: Props) {
  const [row, setRow] = useState<MasterRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      let q = supabaseBrowser
        .from("gardu")
        .select("kode,ulp,kode_amg,nama,alamat,feeder,daya,merk,status,lat,lng,data_amg")
        .eq("kode", kode);
      // Kode gardu tidak unik lintas ULP — tanpa penyaring ULP, gardu Cakra bisa
      // tampil di detail gardu Gerung pada kode yang kebetulan sama.
      if (ulp) q = q.eq("ulp", ulp);
      const { data } = await q.limit(1).maybeSingle();
      if (!hidup) return;
      setRow((data as MasterRow) ?? null);
      setLoading(false);
    })();
    return () => { hidup = false; };
  }, [kode, ulp]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-ink-soft text-sm">
        <div className="w-5 h-5 border-4 border-line border-t-navy-600 rounded-full animate-spin" />
        Memuat data gardu...
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <AlertTriangle size={28} className="text-attention opacity-60" />
        <p className="text-sm font-medium text-ink">Gardu ini belum ada di master</p>
        <p className="text-sm text-ink-soft max-w-md">
          Pengukurannya tercatat, tapi <b>{kode}</b>{ulp ? ` (${ulp})` : ""} tidak ditemukan di
          data master. Impor master gardu dari AMG untuk melengkapinya.
        </p>
      </div>
    );
  }

  const amg = row.data_amg ?? {};
  const lain = Object.entries(amg).filter(([k]) => !SUDAH_TAMPIL.has(k));
  const kvaBeda =
    typeof kvaPengukuran === "number" && row.daya !== null &&
    Math.abs(kvaPengukuran - row.daya) > 0.01;
  const punyaKoordinat = row.lat !== null && row.lng !== null;
  // Impor AMG mengisi `nama` dari alamat — menampilkan keduanya cuma mengulang.
  const namaBeda = row.nama && row.nama !== row.alamat;

  return (
    <div className="space-y-4">
      {kvaBeda && (
        <div className="rounded-xl border border-attention/30 bg-attention-tint p-3 flex items-start gap-2.5">
          <AlertTriangle size={15} className="text-attention shrink-0 mt-0.5" />
          <div className="text-xs text-ink">
            <p className="font-semibold text-attention">kVA berbeda dari master</p>
            <p className="mt-0.5">
              Pengukuran terakhir memakai <b>{kvaPengukuran} kVA</b>, master mencatat{" "}
              <b>{row.daya} kVA</b>. Entah trafonya diganti dan master belum diperbarui, atau
              kVA salah diketik saat mengukur — persentase bebannya ikut terpengaruh.
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Kartu judul="Data Gardu" ikon={<Building2 className={IKON} />}>
          <Baris label="Kode Gardu" nilai={<span className="font-mono">{row.kode}</span>} tebal />
          <Baris label="ULP" nilai={row.ulp ?? "—"} />
          <Baris label="Kode AMG" nilai={<span className="font-mono">{row.kode_amg ?? "—"}</span>} />
          <Baris label="Penyulang" nilai={row.feeder ?? amg["NAMA PENYULANG"] ?? "—"} />
          {namaBeda && <Baris label="Nama Gardu" nilai={row.nama} />}
          <Baris label="Alamat" nilai={row.alamat ?? "—"} />
          <Baris
            label="Status"
            nilai={
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                row.status === "Nonaktif"
                  ? "bg-surface text-ink-muted"
                  : "bg-emerald-50 text-emerald-700"
              }`}>
                {row.status ?? "Aktif"}
              </span>
            }
          />
          {isiField(amg, UMUM)}
        </Kartu>

        <Kartu
          judul="Data Spesifikasi Trafo"
          ikon={<Zap className={IKON} />}
          catatan="Arus nominal adalah pembagi persentase beban. Kalau daya trafo di sini berbeda dengan yang diketik saat mengukur, persentasenya ikut melenceng."
        >
          <Baris
            label="Daya Trafo"
            nilai={row.daya !== null ? `${row.daya} kVA` : "—"}
            tebal
          />
          <Baris label="Merk" nilai={row.merk ?? "—"} />
          {isiField(amg, SPEK_TRAFO)}
        </Kartu>

        <Kartu judul="Data Spesifikasi Kabel" ikon={<Cable className={IKON} />}>
          {SPEK_KABEL.some((f) => amg[f.key])
            ? isiField(amg, SPEK_KABEL)
            : <Baris label="Kabel" nilai={<span className="text-ink-muted">belum ada data</span>} />}
        </Kartu>

        <KartuKosong
          judul="Data Pengaman Trafo"
          ikon={<ShieldCheck className={IKON} />}
          pesan="Ekspor master AMG tidak memuat data pengaman — tidak ada NH Fuse, Fuse Cut Out, maupun arrester di antara 27 kolomnya. Kolomnya perlu ditambahkan ke template unggahan supaya bisa diisi manual."
        />

        <KartuKosong
          judul="Data Pentanahan"
          ikon={<ArrowDownToLine className={IKON} />}
          pesan="Ekspor master AMG tidak memuat nilai pentanahan. Tahanan pentanahan netral, badan trafo, dan arrester perlu kolom sendiri di template unggahan."
        />

        <Kartu judul="Keterangan Trafo" ikon={<MapPin className={IKON} />} rapat>
          {punyaKoordinat ? (
            <>
              <LocationMap lat={row.lat!} lng={row.lng!} label={row.nama ?? row.kode} />
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-t border-line">
                <span className="font-mono text-sm text-ink-soft">
                  {row.lat!.toFixed(6)}, {row.lng!.toFixed(6)}
                </span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:text-navy-500 shrink-0"
                >
                  Buka di Google Maps
                  <ExternalLink size={12} />
                </a>
              </div>
            </>
          ) : (
            <div className="px-3.5 py-8 text-center">
              <MapPin size={22} className="text-ink-muted opacity-50 mx-auto mb-2" />
              <p className="text-sm text-ink-soft leading-relaxed max-w-sm mx-auto">
                Koordinat gardu ini belum ada. Bisa dilengkapi lewat unggahan master —
                cukup isi kolom KODE, ULP, LAT, dan LNG.
              </p>
            </div>
          )}
        </Kartu>
      </div>

      {lain.length > 0 && (
        <Kartu judul="Data Lain dari AMG" ikon={<Building2 className={IKON} />}>
          {lain.map(([k, v]) => <Baris key={k} label={k} nilai={v} />)}
        </Kartu>
      )}
    </div>
  );
}
