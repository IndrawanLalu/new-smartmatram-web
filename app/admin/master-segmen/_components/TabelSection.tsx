"use client";

import { Fragment, useState } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { BTN_GHOST, CARD } from "@/app/admin/_ui";
import type { GarduBelum, GarduSegmen, SectionSegmen, SegmenBaris } from "../_hooks/useMasterSegmen";
import type { KelompokPenyulang, KelompokSection } from "../_lib/kelompokSection";
import GarduBelumMasuk from "./GarduBelumMasuk";

/**
 * Tampilan Per section (X4) — tabel bertingkat seperti Rekap Data Master
 * Penyulang: klik penyulang → section-nya (hulu ke hilir), klik section →
 * segmennya. Panjang, tiang & gardu section dari seluruh pohon tiangnya, jadi
 * yang belum masuk segmen tetap terhitung. Gardu & kVA dari master gardu;
 * "Gardu belum masuk segmen" = gardu master penyulang itu yang belum ada di
 * segmen mana pun — daftarnya tampil tepat di bawah penyulang yang dibuka.
 */

const TH = "px-2.5 py-2 font-semibold text-center whitespace-nowrap border-l border-white/15";
const TD = "px-2.5 py-2 text-right tabular-nums whitespace-nowrap border-l border-line";
const KOSONG = "text-ink-muted/50";
const KOLOM = 11;

const fmtKm = (v: number) => (v ? v.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
const fmtJml = (v: number) => (v ? v.toLocaleString("id-ID") : "–");

interface Angka {
  segmen: number;
  km: number;
  tiang: number;
  gardu: number;
  kva: number;
  tanpaSegmen: number;
  belumInspeksi: number;
}

const BELUM_DITITIK = "Belum dititik";
const NOL: Angka = { segmen: 0, km: 0, tiang: 0, gardu: 0, kva: 0, tanpaSegmen: 0, belumInspeksi: 0 };

function angkaSection(k: KelompokSection): Angka {
  const belumInspeksi = k.baris.filter((b) => !b.terakhir_inspeksi).length;
  if (!k.rekap) {
    // Belum dititik: tiang & gardunya belum ada, dan panjangnya hanya ketikan
    // impor/tempelan — TIDAK ikut panjang penyulang maupun Jumlah (keputusan
    // user 25 Okt). Panjang ketikan tetap terlihat di baris segmennya (✎).
    return { ...NOL, segmen: k.baris.length, belumInspeksi };
  }
  const r = k.rekap;
  return {
    segmen: k.baris.length, km: r.panjang_km, tiang: r.jumlah_tiang, gardu: r.jumlah_gardu, kva: r.gardu_kva,
    tanpaSegmen: r.tiang_tanpa_segmen, belumInspeksi,
  };
}

const jumlahkan = (a: Angka[]): Angka =>
  a.reduce(
    (n, x) => ({
      segmen: n.segmen + x.segmen, km: n.km + x.km, tiang: n.tiang + x.tiang, gardu: n.gardu + x.gardu, kva: n.kva + x.kva,
      tanpaSegmen: n.tanpaSegmen + x.tanpaSegmen, belumInspeksi: n.belumInspeksi + x.belumInspeksi,
    }),
    NOL,
  );

function SelAngka({ a, garduBelum }: { a: Angka; garduBelum?: number }) {
  return (
    <>
      <td className={`${TD} ${a.segmen ? "" : KOSONG}`}>{fmtJml(a.segmen)}</td>
      <td className={`${TD} font-bold text-navy-700`}>{fmtKm(a.km)}</td>
      <td className={`${TD} ${a.tiang ? "" : KOSONG}`}>{fmtJml(a.tiang)}</td>
      <td className={`${TD} ${a.gardu ? "" : KOSONG}`}>{fmtJml(a.gardu)}</td>
      <td className={`${TD} ${a.kva ? "" : KOSONG}`}>{fmtJml(a.kva)}</td>
      <td className={`${TD} ${garduBelum ? "text-amber-700 font-semibold" : KOSONG}`}>{garduBelum === undefined ? "" : fmtJml(garduBelum)}</td>
      <td className={`${TD} ${a.tanpaSegmen ? "text-amber-700 font-semibold" : KOSONG}`}>{fmtJml(a.tanpaSegmen)}</td>
      <td className={`${TD} ${a.belumInspeksi ? "text-amber-700 font-semibold" : KOSONG}`}>{fmtJml(a.belumInspeksi)}</td>
      <td className="border-l border-line" />
    </>
  );
}

export default function TabelSection({
  kelompok,
  sectionDari,
  garduSegmen,
  garduBelum,
}: {
  kelompok: KelompokPenyulang[];
  sectionDari: Map<string, SectionSegmen>;
  garduSegmen: Map<string, GarduSegmen>;
  garduBelum: GarduBelum[];
}) {
  const [buka, setBuka] = useState<Set<string>>(new Set());
  const alih = (k: string) =>
    setBuka((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const belumPer = new Map<string, GarduBelum[]>();
  for (const g of garduBelum) {
    const k = g.penyulang.toUpperCase();
    belumPer.set(k, [...(belumPer.get(k) ?? []), g]);
  }
  const belumDari = (p: KelompokPenyulang) => belumPer.get(p.penyulang.toUpperCase()) ?? [];

  const kp = (p: KelompokPenyulang) => `${p.penyulang}|${p.ulp}`;
  const ks = (p: KelompokPenyulang, k: KelompokSection) => `${kp(p)}|${k.rekap?.section_id ?? BELUM_DITITIK}`;
  const semuaKunci = kelompok.flatMap((p) => [kp(p), ...p.bagian.map((k) => ks(p, k))]);
  const semuaTerbuka = semuaKunci.length > 0 && semuaKunci.every((k) => buka.has(k));
  const total = jumlahkan(kelompok.flatMap((p) => p.bagian.map(angkaSection)));
  const totalBelum = kelompok.reduce((n, p) => n + belumDari(p).length, 0);

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-center gap-2 px-5 pt-4 pb-3">
        <p className="text-xs text-ink-soft">
          Klik penyulang untuk melihat section-nya (hulu ke hilir), klik section untuk melihat segmennya. Gardu &amp; kVA dari
          master gardu.
        </p>
        <button onClick={() => setBuka(semuaTerbuka ? new Set() : new Set(semuaKunci))} className={`${BTN_GHOST} ml-auto`}>
          {semuaTerbuka ? "Tutup semua" : "Buka semua"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] text-ink">
          <thead>
            <tr className="bg-navy-600 text-white">
              <th className={`${TH} text-left sticky left-0 z-10 bg-navy-600 min-w-[280px] !border-l-0`}>Penyulang / section / segmen</th>
              <th className={TH}>ULP</th>
              <th className={TH}>Segmen</th>
              <th className={TH}>Panjang (km)</th>
              <th className={TH}>Tiang</th>
              <th className={TH}>Gardu</th>
              <th className={TH}>kVA</th>
              <th className={TH}>Gardu belum masuk segmen</th>
              <th className={TH}>Tiang belum masuk segmen</th>
              <th className={TH}>Belum pernah diinspeksi</th>
              <th className={TH}>Terakhir diinspeksi</th>
            </tr>
          </thead>
          <tbody>
            {kelompok.map((p) => {
              const kunciP = kp(p);
              const terbukaP = buka.has(kunciP);
              const section = p.bagian.filter((k) => k.rekap).length;
              const belum = belumDari(p);
              return (
                <Fragment key={kunciP}>
                  <tr onClick={() => alih(kunciP)} className={`border-b border-line cursor-pointer font-medium ${terbukaP ? "bg-navy-50/60" : "bg-white hover:bg-navy-50/40"}`}>
                    <td className={`px-2.5 py-2 font-semibold sticky left-0 ${terbukaP ? "bg-navy-50" : "bg-white"}`}>
                      <span className="inline-flex items-center gap-1">
                        <ChevronRight size={14} className={`text-ink-muted transition-transform ${terbukaP ? "rotate-90" : ""}`} />
                        {p.penyulang}
                        <span className="text-ink-soft font-normal text-xs">· {section} section</span>
                      </span>
                    </td>
                    <td className="px-2.5 py-2 border-l border-line">{p.ulp}</td>
                    <SelAngka a={jumlahkan(p.bagian.map(angkaSection))} garduBelum={belum.length} />
                  </tr>
                  {terbukaP && belum.length > 0 && <GarduBelumMasuk belum={belum} kolom={KOLOM} />}
                  {terbukaP &&
                    p.bagian.map((k) => {
                      const kunciS = ks(p, k);
                      const terbukaS = buka.has(kunciS);
                      return (
                        <Fragment key={kunciS}>
                          <tr onClick={() => alih(kunciS)} className="border-b border-line cursor-pointer bg-white hover:bg-navy-50/30">
                            <td className="pl-7 pr-2.5 py-2 sticky left-0 bg-white">
                              <span className="inline-flex items-center gap-1">
                                <ChevronRight size={13} className={`text-ink-muted transition-transform ${terbukaS ? "rotate-90" : ""}`} />
                                <span className={k.rekap ? "font-medium" : "text-ink-muted italic"}>{k.rekap?.nama ?? BELUM_DITITIK}</span>
                              </span>
                            </td>
                            <td className="border-l border-line" />
                            <SelAngka a={angkaSection(k)} />
                          </tr>
                          {terbukaS &&
                            k.baris.map((b) => (
                              <BarisSegmen
                                key={b.segmen_id}
                                b={b}
                                gardu={garduSegmen.get(b.segmen_id)}
                                lintas={sectionDari.get(b.segmen_id)?.lintas ?? false}
                              />
                            ))}
                          {terbukaS && k.baris.length === 0 && (
                            <tr className="border-b border-line bg-white">
                              <td colSpan={KOLOM} className="pl-14 py-2 text-xs text-ink-muted">Belum ada segmen di section ini.</td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-navy-50 font-bold text-navy-800 border-t-2 border-navy-200">
              <td className="px-2.5 py-2.5 sticky left-0 bg-navy-50">Jumlah</td>
              <td className="border-l border-line" />
              <SelAngka a={total} garduBelum={totalBelum} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function BarisSegmen({ b, gardu, lintas }: { b: SegmenBaris; gardu: GarduSegmen | undefined; lintas: boolean }) {
  return (
    <tr className="border-b border-line bg-white text-ink">
      <td className="pl-14 pr-2.5 py-1.5 sticky left-0 bg-white max-w-[380px]" title={b.nama}>
        <span className="block truncate">└ {b.nama}</span>
        {lintas && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] text-amber-700"
            title="Isinya juga di section lain (melewati REC/LBS/LBSM) — pecah di keypoint-nya lewat Peta → JTM → Section"
          >
            <TriangleAlert size={10} /> lintas section
          </span>
        )}
      </td>
      <td className="border-l border-line" />
      <td className="border-l border-line" />
      <td className={TD}>
        {b.panjang_pakai_km !== null ? fmtKm(b.panjang_pakai_km) : "–"}
        {b.panjang_dari === "ketikan" && <span className="ml-0.5 text-amber-600 text-xs">✎</span>}
      </td>
      <td className={`${TD} ${b.jumlah_tiang ? "" : KOSONG}`}>{fmtJml(b.jumlah_tiang)}</td>
      <td className={`${TD} ${gardu ? "" : KOSONG}`} title={gardu?.gardu}>{fmtJml(gardu?.jumlah_gardu ?? 0)}</td>
      <td className={`${TD} ${gardu?.gardu_kva ? "" : KOSONG}`}>{fmtJml(gardu?.gardu_kva ?? 0)}</td>
      <td className="border-l border-line" />
      <td className="border-l border-line" />
      <td className={`${TD} ${b.terakhir_inspeksi ? KOSONG : "text-amber-700 font-semibold"}`}>{b.terakhir_inspeksi ? "–" : "belum"}</td>
      <td className="px-2.5 py-1.5 border-l border-line whitespace-nowrap text-ink-soft">
        {b.terakhir_inspeksi ? (
          <>
            {b.terakhir_inspeksi}
            <span className={`ml-1.5 text-[10px] font-semibold ${(b.umur_inspeksi_bulan ?? 0) >= 12 ? "text-red-600" : (b.umur_inspeksi_bulan ?? 0) >= 6 ? "text-amber-700" : "text-ink-muted"}`}>
              {b.umur_inspeksi_bulan} bln
            </span>
          </>
        ) : (
          "–"
        )}
      </td>
    </tr>
  );
}
