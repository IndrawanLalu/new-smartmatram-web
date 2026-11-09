"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { StatusProNtb } from "../_hooks/useStatusProNtb";
import type { RingkasKunci } from "../_lib/cekProNtb";

/**
 * Isi kolom "PRO NTB" Rekap Kinerja satu jenis pekerjaan: sudah sama dengan
 * spreadsheet PRO NTB atau belum, menurut cek TERAKHIR (bukan saat ini).
 * WO dan realisasi dinilai terpisah (9 Nov 2026): jumlahnya di PRO NTB sama
 * dengan yang dikirim SMART atau tidak. Realisasi SMART = termasuk belum
 * disetujui — sama dengan yang dikirim.
 */

interface Props {
  kunci: string;
  satuan: string;
  desimal: boolean;
  status: StatusProNtb | null;
}

const angka = (n: number, desimal: boolean) =>
  desimal ? n.toFixed(2).replace(".", ",") : n.toLocaleString("id-ID");

const sama = (a: number, b: number) => Math.abs(a - b) < 0.005;
/** null = hasil cek lama, belum menyimpan WO. */
const woSesuai = (r: RingkasKunci) => (r.smart_wo === null || r.sheet_wo === null ? null : sama(r.smart_wo, r.sheet_wo));
const realSesuai = (r: RingkasKunci) => sama(r.smart_jumlah, r.sheet_jumlah);
const sesuai = (r: RingkasKunci) => woSesuai(r) !== false && realSesuai(r);

/** Satu baris status: "WO sesuai · kms 152,63" atau "WO selisih: SMART … · PRO NTB …". */
interface BarisProps {
  label: string;
  ok: boolean;
  smart: number;
  sheet: number;
  satuan: string;
  desimal: boolean;
}

function Baris({ label, ok, smart, sheet, satuan, desimal }: BarisProps) {
  return ok ? (
    <span className="block text-emerald-700">
      <CheckCircle2 size={12} className="inline -mt-0.5 mr-1" />
      <b>{label} sesuai</b> · {satuan} {angka(smart, desimal)}
    </span>
  ) : (
    <span className="block text-amber-800">
      <TriangleAlert size={12} className="inline -mt-0.5 mr-1" />
      <b>{label} selisih</b>: SMART {angka(smart, desimal)} · PRO NTB {angka(sheet, desimal)} {satuan}
    </span>
  );
}

export const waktuCek = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Makassar", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function rinci(r: RingkasKunci) {
  return [
    r.hanya_smart && `${r.hanya_smart} belum masuk`,
    r.hanya_sheet && `${r.hanya_sheet} hanya di PRO NTB`,
    r.beda && `${r.beda} beda isi`,
  ].filter(Boolean).join(" · ");
}

export default function SelProNtb({ kunci, satuan, desimal, status }: Props) {
  if (!status) return <span className="text-ink-muted">—</span>;
  if (!status.ulp.length) return <span className="text-ink-muted">spreadsheet PRO NTB belum diatur</span>;

  // Satu ULP: rincian lengkap.
  if (status.ulp.length === 1) {
    const u = status.ulp[0];
    const c = status.cek.get(u);
    if (!c) return <span className="text-ink-muted italic">belum dicek</span>;
    const r = status.ringkas.get(u)?.get(kunci);
    const kaki = <span className="block text-[10px] text-ink-muted">dicek {waktuCek(c.dicek_at)}</span>;
    if (c.galat) return <span className="text-amber-700">cek gagal: {c.galat}{kaki}</span>;
    if (!r) return <span className="text-ink-muted">belum ada pekerjaan{kaki}</span>;
    const wo = woSesuai(r);
    const rin = rinci(r);
    return (
      <span>
        {wo !== null && <Baris label="WO" ok={wo} smart={r.smart_wo ?? 0} sheet={r.sheet_wo ?? 0} satuan={satuan} desimal={desimal} />}
        <Baris label="Realisasi" ok={realSesuai(r)} smart={r.smart_jumlah} sheet={r.sheet_jumlah} satuan={satuan} desimal={desimal} />
        {rin && <span className="block text-[10px] text-amber-800">{rin}</span>}
        {kaki}
      </span>
    );
  }

  // Semua ULP: ringkas per ULP.
  const ok: string[] = [];
  const beda: string[] = [];
  const belum: string[] = [];
  for (const u of status.ulp) {
    const c = status.cek.get(u);
    if (!c || c.galat) { belum.push(u); continue; }
    const r = status.ringkas.get(u)?.get(kunci);
    if (!r || sesuai(r)) ok.push(u);
    else beda.push(`${u} ${[woSesuai(r) === false && "WO selisih", !realSesuai(r) && "realisasi selisih"].filter(Boolean).join(" · ")}`);
  }
  return (
    <span className={beda.length ? "text-amber-800" : "text-emerald-700"}>
      {ok.length > 0 && <span className="block">WO &amp; realisasi sesuai di {ok.length} ULP</span>}
      {beda.map((b) => <span key={b} className="block">{b}</span>)}
      {belum.length > 0 && <span className="block text-ink-muted">belum dicek: {belum.join(", ")}</span>}
    </span>
  );
}
