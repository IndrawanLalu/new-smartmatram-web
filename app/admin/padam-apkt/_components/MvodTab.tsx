"use client";

import { useMemo } from "react";
import { Settings2, TriangleAlert } from "lucide-react";
import {
  hitungMvod, layakMvod, isKodeJ, durasiMenit, fmtDurasi, fmtMvod,
  MIN_DURASI_MENIT, type BarisPadam, type HasilMvod,
} from "../_lib/mvod";

interface Props {
  /** Baris pada periode & ULP yang sedang dipilih — penyaringan MVOD dilakukan
   *  di dalam komponen ini supaya aturannya tidak tersebar. */
  rows: BarisPadam[];
  slaMenit: number;
  /** `false` = SLA masih memakai bawaan kode, belum pernah disetel. */
  slaTersimpan: boolean;
  bisaAturSla: boolean;
  onAturSla: () => void;
  periodeLabel: string;
}

/** Skala 0–200: 100 = tepat SLA, 200 = sempurna, 0 = dua kali SLA atau lebih. */
const warnaMvod = (v: number | null) =>
  v === null ? "text-[#5D6D7E]"
    : v >= 100 ? "text-green-700"
    : v > 0 ? "text-amber-600"
    : "text-red-600";

function KartuMvod({ judul, keterangan, hasil, utama = false }: {
  judul: string; keterangan: string; hasil: HasilMvod; utama?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${utama ? "border-[#00897B]/40" : "border-[#E2E8F0]"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#5D6D7E]">{judul}</p>
      <p className={`font-bold leading-none mt-2 ${utama ? "text-5xl" : "text-4xl"} ${warnaMvod(hasil.mvod)}`}>
        {fmtMvod(hasil.mvod)}
      </p>
      <p className="text-xs text-[#5D6D7E] mt-1.5">{keterangan}</p>
      {/* Nol adalah LANTAI, bukan dasar skala. Tanpa penanda ini, unit yang
          rata-ratanya 2,1x SLA dan yang 3x SLA sama-sama terbaca "0" dan
          tampak setara — padahal jaraknya jauh. */}
      {hasil.mentah < 0 && hasil.kali > 0 && (
        <p className="text-[11px] text-red-600 mt-1">
          Tertahan di 0 — rata-rata {fmtDurasi(hasil.rataMenit)} sudah melewati
          dua kali SLA
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-[#E2E8F0]">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#5D6D7E]">Kali padam</p>
          <p className="text-lg font-bold text-[#1B2631] leading-tight">{hasil.kali}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#5D6D7E]">Total durasi</p>
          <p className="text-lg font-bold text-[#1B2631] leading-tight">{fmtDurasi(hasil.totalMenit)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#5D6D7E]">Rata-rata</p>
          <p className="text-lg font-bold text-[#1B2631] leading-tight">
            {hasil.kali ? fmtDurasi(hasil.rataMenit) : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function MvodTab({
  rows, slaMenit, slaTersimpan, bisaAturSla, onAturSla, periodeLabel,
}: Props) {
  const d = useMemo(() => {
    const layak = rows.filter(layakMvod);
    const murni = layak.filter((r) => r.status_gangguan === "murni");

    // Sebaran per ULP, hanya yang punya kejadian.
    const perUlp = new Map<string, BarisPadam[]>();
    for (const r of layak) {
      const k = r.ulp ?? "—";
      perUlp.set(k, [...(perUlp.get(k) ?? []), r]);
    }

    return {
      semua: hitungMvod(layak, slaMenit),
      murni: hitungMvod(murni, slaMenit),
      ulp: [...perUlp.entries()]
        .map(([nama, isi]) => ({ nama, ...hitungMvod(isi, slaMenit) }))
        // Terburuk di atas — nilai terkecil, karena skalanya makin besar makin baik.
        .sort((a, b) => (a.mvod ?? 0) - (b.mvod ?? 0)),
      // Angka penyaringan — supaya terlihat berapa yang dibuang dan kenapa.
      total: rows.length,
      bukanJ: rows.filter((r) => !isKodeJ(r)).length,
      jPendek: rows.filter((r) => isKodeJ(r) && durasiMenit(r) <= MIN_DURASI_MENIT).length,
      layak: layak.length,
      belumDiklasifikasi: layak.filter((r) => !r.status_gangguan).length,
    };
  }, [rows, slaMenit]);

  return (
    <div className="space-y-4">
      {/* Kepala: rumus + tombol setelan */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#1B2631]">MVOD — {periodeLabel}</h3>
          <p className="text-xs text-[#5D6D7E] mt-0.5">
            maks(0, 2 − ((total durasi ÷ kali padam) ÷ SLA <b>{slaMenit}</b> menit)) × 100 ·
            skala 0–200, <b>100</b> = tepat memenuhi SLA
            {!slaTersimpan && <span className="ml-1 text-amber-600">· masih bawaan, belum disetel</span>}
          </p>
        </div>
        {bisaAturSla && (
          <button
            onClick={onAturSla}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-[#5D6D7E] border border-[#E2E8F0] hover:text-[#00897B] hover:border-[#00897B]/40 transition-colors"
          >
            <Settings2 size={13} /> Atur SLA
          </button>
        )}
      </div>

      {d.layak === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] py-16 text-center">
          <p className="text-sm text-[#5D6D7E]">Tidak ada gangguan yang memenuhi kriteria MVOD.</p>
          <p className="text-xs text-[#5D6D7E] mt-1">
            Dari {d.total} baris: {d.bukanJ} bukan kode J, {d.jPendek} berdurasi ≤{MIN_DURASI_MENIT} menit.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KartuMvod
              judul="MVOD — Semua Gangguan"
              keterangan={`Seluruh gangguan kode J berdurasi >${MIN_DURASI_MENIT} menit`}
              hasil={d.semua}
              utama
            />
            <KartuMvod
              judul="MVOD — Gangguan Murni"
              keterangan="Hanya yang berstatus gangguan murni"
              hasil={d.murni}
            />
          </div>

          {/* Cakupan klasifikasi. Ini bukan hiasan: kalau sebagian besar baris
              belum berstatus, angka "gangguan murni" berdiri di atas segelintir
              kejadian dan tidak boleh dibaca sebagai mewakili keseluruhan. */}
          {d.belumDiklasifikasi > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <TriangleAlert size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-[#1B2631] leading-relaxed">
                <b>{d.belumDiklasifikasi} dari {d.layak} kejadian belum diisi status gangguannya.</b>{" "}
                Angka MVOD Gangguan Murni di atas hanya menghitung {d.murni.kali} kejadian, jadi belum
                bisa dibandingkan dengan MVOD Semua Gangguan secara setara. Isi status di tab Detail
                untuk melengkapinya.
              </p>
            </div>
          )}

          {/* Jejak penyaringan — berapa yang dibuang dan atas dasar apa. */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5D6D7E] mb-2.5">
              Dasar perhitungan
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-[#5D6D7E] text-xs">Total baris</p>
                <p className="font-bold text-[#1B2631]">{d.total}</p>
              </div>
              <div>
                <p className="text-[#5D6D7E] text-xs">Bukan kode J</p>
                <p className="font-bold text-[#5D6D7E]">−{d.bukanJ}</p>
              </div>
              <div>
                <p className="text-[#5D6D7E] text-xs">Kode J ≤{MIN_DURASI_MENIT} menit</p>
                <p className="font-bold text-[#5D6D7E]">−{d.jPendek}</p>
              </div>
              <div>
                <p className="text-[#5D6D7E] text-xs">Masuk hitungan</p>
                <p className="font-bold text-[#00897B]">{d.layak}</p>
              </div>
            </div>
          </div>

          {/* Per ULP — hanya bermakna saat melihat semua ULP sekaligus. */}
          {d.ulp.length > 1 && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E2E8F0]">
                <h4 className="text-sm font-semibold text-[#1B2631]">MVOD per ULP</h4>
                <p className="text-xs text-[#5D6D7E] mt-0.5">Diurutkan dari yang terburuk</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#E0F2F1] text-[#00695C]">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold">ULP</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold">Kali Padam</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold">Total Durasi</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold">Rata-rata</th>
                    <th className="px-5 py-2.5 text-right text-xs font-semibold">MVOD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {d.ulp.map((u) => (
                    <tr key={u.nama}>
                      <td className="px-5 py-2.5 font-semibold text-[#1B2631]">{u.nama}</td>
                      <td className="px-4 py-2.5 text-center text-[#5D6D7E] tabular-nums">{u.kali}</td>
                      <td className="px-4 py-2.5 text-center text-[#5D6D7E] tabular-nums">{fmtDurasi(u.totalMenit)}</td>
                      <td className="px-4 py-2.5 text-center text-[#5D6D7E] tabular-nums">{fmtDurasi(u.rataMenit)}</td>
                      <td className={`px-5 py-2.5 text-right font-bold tabular-nums ${warnaMvod(u.mvod)}`}>
                        {fmtMvod(u.mvod)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
