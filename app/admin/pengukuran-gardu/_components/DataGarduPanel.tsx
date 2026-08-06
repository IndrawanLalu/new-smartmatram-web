"use client";

import { useEffect, useState } from "react";
import { MapPin, ExternalLink, AlertTriangle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { EYEBROW } from "@/app/admin/_ui";

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

/**
 * Kolom ekspor AMG yang layak ditonjolkan, beserta labelnya.
 *
 * Sisanya tetap ditampilkan di bagian "Data lain" — semua 27 field disimpan,
 * jadi tidak ada yang disembunyikan hanya karena belum sempat diberi label.
 */
const SOROT: { key: string; label: string }[] = [
  { key: "KONS TRAFO", label: "Konstruksi" },
  { key: "HUB BELITAN", label: "Hubungan Belitan" },
  { key: "JURUSAN OPERASI", label: "Jurusan Operasi" },
  { key: "NO SERI", label: "No Seri" },
  { key: "TAHUN PEMBUATAN", label: "Tahun Pembuatan" },
  { key: "TGL OPERASI", label: "Tanggal Operasi" },
  { key: "ARUS PRIMER", label: "Arus Primer (A)" },
  { key: "ARUS SEKUNDER", label: "Arus Sekunder (A)" },
  { key: "JENIS KABEL INC", label: "Kabel Masuk" },
  { key: "PENAMPANG INC", label: "Penampang Masuk (mm²)" },
  { key: "JENIS KABEL OUT", label: "Kabel Keluar" },
  { key: "PENAMPANG OUT", label: "Penampang Keluar (mm²)" },
  { key: "STATUS", label: "Status AMG" },
  { key: "GRD KHUSUS", label: "Gardu Khusus" },
  { key: "ID PENYULANG", label: "ID Penyulang" },
];

/** Sudah tampil sebagai kolom sendiri di atas — tidak diulang di "Data lain". */
const SUDAH_TAMPIL = new Set([
  ...SOROT.map((s) => s.key),
  "NO GARDU", "DAYA", "ID UP", "NAMA PENYULANG", "ALAMAT", "MERK",
  "KOORDINAT X", "KOORDINAT Y", "NAMA AREA", "NAMA RAYON",
]);

function Baris({ label, nilai }: { label: string; nilai: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 border-b border-line/60 last:border-0">
      <span className="text-[11px] text-ink-muted w-44 shrink-0">{label}</span>
      <span className="text-sm text-ink min-w-0 break-words">{nilai}</span>
    </div>
  );
}

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
        <p className="text-xs text-ink-muted max-w-md">
          Pengukurannya tercatat, tapi <b>{kode}</b>{ulp ? ` (${ulp})` : ""} tidak ditemukan di
          data master. Impor master gardu dari AMG untuk melengkapinya.
        </p>
      </div>
    );
  }

  const amg = row.data_amg ?? {};
  const sorot = SOROT.filter((s) => amg[s.key]);
  const lain = Object.entries(amg).filter(([k]) => !SUDAH_TAMPIL.has(k));
  const kvaBeda =
    typeof kvaPengukuran === "number" && row.daya !== null &&
    Math.abs(kvaPengukuran - row.daya) > 0.01;

  return (
    <div className="space-y-5">
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

      <section>
        <p className={`${EYEBROW} mb-1.5`}>Identitas</p>
        <Baris label="Kode Gardu" nilai={<span className="font-mono font-semibold">{row.kode}</span>} />
        <Baris label="ULP" nilai={row.ulp ?? "—"} />
        <Baris label="Kode AMG" nilai={<span className="font-mono">{row.kode_amg ?? "—"}</span>} />
        <Baris label="Penyulang" nilai={row.feeder ?? "—"} />
        <Baris
          label="Daya Trafo"
          nilai={<span className="font-semibold">{row.daya !== null ? `${row.daya} kVA` : "—"}</span>}
        />
        <Baris label="Merk" nilai={row.merk ?? "—"} />
        <Baris label="Status" nilai={row.status ?? "—"} />
        <Baris label="Alamat" nilai={row.alamat ?? "—"} />
        <Baris
          label="Koordinat"
          nilai={
            row.lat !== null && row.lng !== null ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-navy-600 hover:text-navy-500 font-mono"
              >
                <MapPin size={12} />
                {row.lat.toFixed(6)}, {row.lng.toFixed(6)}
                <ExternalLink size={11} />
              </a>
            ) : (
              <span className="text-ink-muted">belum ada</span>
            )
          }
        />
      </section>

      {sorot.length > 0 && (
        <section>
          <p className={`${EYEBROW} mb-1.5`}>Data Teknis</p>
          {sorot.map((s) => <Baris key={s.key} label={s.label} nilai={amg[s.key]} />)}
        </section>
      )}

      {lain.length > 0 && (
        <section>
          <p className={`${EYEBROW} mb-1.5`}>Data Lain dari AMG</p>
          {lain.map(([k, v]) => <Baris key={k} label={k} nilai={v} />)}
        </section>
      )}

      {Object.keys(amg).length === 0 && (
        <p className="text-xs text-ink-muted">
          Gardu ini belum punya data rinci dari AMG — kemungkinan tercatat sebelum
          impor master, atau diisi lewat template.
        </p>
      )}
    </div>
  );
}
