"use client";

import { useState } from "react";
import { CalendarDays, Cable, Zap, Activity, Database, MapPin, Target } from "lucide-react";
import { BarisMemuat, DuaBaris, KakiTabel, KartuTabel, Kolom, TabelKosong, TD } from "@/app/admin/_kit/Tabel";
import { bacaArus } from "@/lib/prediksiGangguan/arus";
import type { BarisGangguan } from "../../_hooks/usePrediksiLokasi";
import { LABEL_JENIS, teksRapor } from "./label";

const PER_HAL = 20;
const SUMBER: Record<BarisGangguan["sumber"], string> = { sheet: "Sheet", wa: "WA", "sheet+wa": "Sheet + WA" };

const tgl = (iso: string) => iso.split("-").reverse().join("-");
const a = (v: number | null) => (v == null ? "–" : Math.round(v).toLocaleString("id-ID"));

interface Props {
  baris: BarisGangguan[];
  loading: boolean;
  onDetail: (b: BarisGangguan) => void;
}

export default function TabelGangguan({ baris, loading, onDetail }: Props) {
  const [hal, setHal] = useState(1);
  const total = Math.max(1, Math.ceil(baris.length / PER_HAL));
  const h = Math.min(hal, total);
  const isi = baris.slice((h - 1) * PER_HAL, h * PER_HAL);

  if (!loading && !baris.length)
    return <TabelKosong judul="Tidak ada gangguan di periode ini">Gangguan berasal dari sheet gangguan penyulang dan laporan dispatcher yang diteruskan ke bot WA.</TabelKosong>;

  return (
    <KartuTabel kaki={<KakiTabel hal={h} total={total} onHal={setHal} ringkas={`${baris.length} gangguan`} />}>
      <table className="w-full border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-white">
          <tr>
            <Kolom ikon={CalendarDays}>Tanggal</Kolom>
            <Kolom ikon={Cable}>Penyulang · trip</Kolom>
            <Kolom ikon={Zap}>Arus R · S · T · N (A)</Kolom>
            <Kolom ikon={Activity}>Jenis</Kolom>
            <Kolom ikon={Database}>Data</Kolom>
            <Kolom ikon={MapPin}>Lokasi temuan</Kolom>
            <Kolom ikon={Target}>Hasil prediksi</Kolom>
          </tr>
        </thead>
        <tbody>
          {loading ? <BarisMemuat kolom={7} /> : isi.map((b) => {
            const jenis = bacaArus(b.arus, b.bebanKw).jenis;
            return (
              <tr key={b.kunci} onClick={() => onDetail(b)} className="cursor-pointer hover:bg-surface/60">
                <td className={TD}><DuaBaris utama={tgl(b.tanggal)} bawah={b.jam?.slice(0, 5) ?? "–"} /></td>
                <td className={TD}><DuaBaris utama={b.penyulang} bawah={b.keypoint ?? "PMT di GI"} /></td>
                <td className={`${TD} tabular-nums whitespace-nowrap`}>{a(b.arus.r)} · {a(b.arus.s)} · {a(b.arus.t)} · {a(b.arus.n)}</td>
                <td className={TD}>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${LABEL_JENIS[jenis].kelas}`}>{LABEL_JENIS[jenis].singkat}</span>
                </td>
                <td className={`${TD} text-ink-soft`}>{SUMBER[b.sumber]}</td>
                <td className={TD}>{b.temuan?.tiang_kode ?? <span className="text-ink-muted">–</span>}</td>
                <td className={`${TD} text-ink-soft`}>{b.temuan ? teksRapor(b.temuan) : <span className="text-ink-muted">–</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </KartuTabel>
  );
}
