"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { IKON } from "@/lib/ikonUi";
import { BarisMemuat, DuaBaris, KakiTabel, KartuTabel, Kolom, MenuBaris, TD, type AksiBaris } from "@/app/admin/_kit/Tabel";
import { useUrutan } from "@/app/admin/_kit/urutan";
import PilStatus from "@/app/admin/_kit/PilStatus";
import LencanaGaransi from "@/app/admin/_components/LencanaGaransi";
import { useGaransiItem } from "@/app/admin/_hooks/useGaransi";
import { hariIniWita } from "@/app/admin/kinerja-yantek/_lib/realisasiHarian";
import { STATUS_RABAS, type BarisRabas } from "../_hooks/useDaftarPerabasan";
import { rentangKerja, tanggal, umurStatus } from "../_lib/tampilan";

/**
 * Daftar segmen perabasan — satu baris satu segmen (teknisaplikasi.md butir 7),
 * UI baru (rencana-ui-baru.md, 14 Okt 2026): kepala kolom berikon & menempel,
 * urut per kolom, WO + tgl WO dan regu + petugas digabung, umur tunggakan di
 * bawah status, menu ⋯ sesuai status. Klik baris → modal rincian.
 *
 * Kolom centang: keluarkan beberapa segmen dari WO sekaligus. Hanya segmen
 * yang BELUM dikerjakan (Dijadwalkan) yang bisa dicentang.
 */

const PER_HAL = 20;
const URUT_STATUS = new Map(STATUS_RABAS.map((s, i) => [s, i]));
const kmTeks = (v: number | null) => (v === null ? "—" : v.toFixed(2).replace(".", ","));

interface Props {
  baris: BarisRabas[];
  loading: boolean;
  onDetail: (b: BarisRabas) => void;
  dipilih: Set<string>;
  onPilih: (id: string[], aktif: boolean) => void;
  bisaPilih: (b: BarisRabas) => boolean;
  /** Aksi di menu ⋯ (penugasan langsung; keputusan lewat modal rincian). */
  aksi: (b: BarisRabas) => AksiBaris[];
}

export default function TabelRabas({ baris, loading, onDetail, dipilih, onPilih, bisaPilih, aksi }: Props) {
  // Segmen yang di-WO-kan selagi perabasan sebelumnya masih bergaransi.
  const garansi = useGaransiItem("perabasan", "");
  const hariIni = hariIniWita();
  const u = useUrutan(baris, {
    penyulang: (b) => b.penyulang,
    panjang: (b) => b.panjangKm,
    regu: (b) => b.regu,
    kerja: (b) => b.tglMulai ?? b.tglSelesai,
    status: (b) => URUT_STATUS.get(b.status),
  });
  const [halaman, setHalaman] = useState(1);
  const total = Math.max(1, Math.ceil(u.baris.length / PER_HAL));
  const hal = Math.min(halaman, total);
  const tampil = u.baris.slice((hal - 1) * PER_HAL, hal * PER_HAL);
  const bisaDiHal = tampil.filter(bisaPilih).map((b) => b.id);
  const semuaHal = bisaDiHal.length > 0 && bisaDiHal.every((id) => dipilih.has(id));

  return (
    <KartuTabel
      kaki={
        loading ? null : (
          <KakiTabel
            hal={hal}
            total={total}
            onHal={setHalaman}
            ringkas={
              <>
                {baris.length === 0 ? 0 : (hal - 1) * PER_HAL + 1}–{Math.min(hal * PER_HAL, baris.length)} dari {baris.length} segmen ·{" "}
                <b className="text-ink">{kmTeks(baris.reduce((a, b) => a + (b.panjangKm ?? 0), 0))} km</b>
              </>
            }
          />
        )
      }
    >
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <Kolom lebar="w-10">
              <input
                type="checkbox"
                checked={semuaHal}
                disabled={bisaDiHal.length === 0}
                onChange={() => onPilih(bisaDiHal, !semuaHal)}
                className="accent-brand-600"
                aria-label="Pilih semua segmen di halaman ini yang belum dikerjakan"
              />
            </Kolom>
            <Kolom ikon={IKON.penyulang} urut={u.kolom("penyulang")}>Penyulang</Kolom>
            <Kolom ikon={IKON.segmen}>Segmen</Kolom>
            <Kolom ikon={IKON.panjang} kanan urut={u.kolom("panjang")}>Panjang</Kolom>
            <Kolom ikon={IKON.wo}>WO</Kolom>
            <Kolom ikon={IKON.regu} urut={u.kolom("regu")}>Regu · petugas</Kolom>
            <Kolom ikon={IKON.tanggal} urut={u.kolom("kerja")}>Tgl pekerjaan</Kolom>
            <Kolom ikon={IKON.status} urut={u.kolom("status")}>Status</Kolom>
            <Kolom lebar="w-12" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <BarisMemuat kolom={9} />
          ) : (
            tampil.map((b) => (
              <tr
                key={b.id}
                onClick={() => onDetail(b)}
                className={`cursor-pointer transition-colors ${dipilih.has(b.id) ? "bg-brand-50/70" : "hover:bg-surface/70"}`}
              >
                <td className={TD} onClick={(e) => e.stopPropagation()}>
                  {bisaPilih(b) && (
                    <input
                      type="checkbox"
                      checked={dipilih.has(b.id)}
                      onChange={(e) => onPilih([b.id], e.target.checked)}
                      className="accent-brand-600"
                      aria-label={`Pilih ${b.segmenNama}`}
                    />
                  )}
                </td>
                <td className={TD}><DuaBaris utama={b.penyulang} bawah={b.ulp} /></td>
                <td className={`${TD} max-w-64`}>
                  <span className="text-ink">{b.segmenNama}</span>
                  {garansi.get(b.id) && <div className="mt-1"><LencanaGaransi g={garansi.get(b.id)!} /></div>}
                </td>
                <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>
                  <span className="font-semibold text-ink">{kmTeks(b.panjangKm)}</span>
                  <span className="text-ink-muted"> km</span>
                  {b.panjangDari === "ketikan" && (
                    <Pencil size={11} className="inline ml-1 -mt-0.5 text-amber-500" aria-label="Panjang masih angka ketikan" />
                  )}
                </td>
                <td className={`${TD} max-w-56`}>
                  <p className="text-ink-soft line-clamp-2 leading-snug">{b.woNama ?? "—"}</p>
                  {b.woTgl && <p className="text-[11px] text-ink-muted">{tanggal(b.woTgl)}</p>}
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {b.regu ? (
                    <DuaBaris utama={b.regu} bawah={b.petugasNama && b.petugasNama !== b.regu ? b.petugasNama : null} />
                  ) : (
                    <span className="text-red-700 font-semibold">belum dibagi</span>
                  )}
                </td>
                <td className={`${TD} text-ink whitespace-nowrap`}>{rentangKerja(b.tglMulai, b.tglSelesai)}</td>
                <td className={TD}><PilStatus status={b.status} hari={umurStatus(b, hariIni)} /></td>
                <td className={`${TD} text-right`}>
                  <MenuBaris aksi={aksi(b)} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </KartuTabel>
  );
}
