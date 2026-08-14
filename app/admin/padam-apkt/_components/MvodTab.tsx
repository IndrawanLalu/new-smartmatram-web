"use client";

import { useMemo } from "react";
import { Settings2, TriangleAlert } from "lucide-react";
import {
  hitungMvod, layakMvod, isKodeJ, durasiMenit, fmtDurasi, fmtMvod,
  MIN_DURASI_MENIT, type BarisPadam, type HasilMvod, type Sisi,
} from "../_lib/mvod";
import { adaKoreksi } from "../_lib/koreksi";

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

interface SisiHasil {
  semua: HasilMvod;
  murni: HasilMvod;
  layak: number;
  belumDiklasifikasi: number;
  perUlp: Map<string, HasilMvod>;
}

/** Skala 0–200: 100 = tepat SLA, 200 = sempurna, 0 = dua kali SLA atau lebih. */
const warnaMvod = (v: number | null) =>
  v === null ? "text-[#5D6D7E]"
    : v >= 100 ? "text-green-700"
    : v > 0 ? "text-amber-600"
    : "text-red-600";

const beda = (a: number | null, b: number | null) =>
  a !== null && b !== null && Math.abs(a - b) >= 0.05;

function hitungSisi(rows: BarisPadam[], slaMenit: number, sisi: Sisi): SisiHasil {
  const layak = rows.filter((r) => layakMvod(r, sisi));
  const murni = layak.filter((r) => r.status_gangguan === "murni");

  const perUlp = new Map<string, BarisPadam[]>();
  for (const r of layak) {
    const k = r.ulp ?? "—";
    perUlp.set(k, [...(perUlp.get(k) ?? []), r]);
  }

  return {
    semua: hitungMvod(layak, slaMenit, sisi),
    murni: hitungMvod(murni, slaMenit, sisi),
    layak: layak.length,
    belumDiklasifikasi: layak.filter((r) => !r.status_gangguan).length,
    perUlp: new Map([...perUlp.entries()].map(([nama, isi]) => [nama, hitungMvod(isi, slaMenit, sisi)])),
  };
}

function KartuMvod({ judul, keterangan, asli, koreksi, banding, utama = false }: {
  judul: string; keterangan: string;
  asli: HasilMvod; koreksi: HasilMvod;
  /** `false` = tidak ada koreksi sama sekali, tampilkan satu angka saja. */
  banding: boolean; utama?: boolean;
}) {
  const utamaHasil = banding ? koreksi : asli;
  const berubah = banding && beda(asli.mvod, koreksi.mvod);

  return (
    <div className={`bg-white rounded-xl border p-5 ${utama ? "border-[#00897B]/40" : "border-[#E2E8F0]"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#5D6D7E]">{judul}</p>
      <div className="flex items-baseline gap-3 mt-2 flex-wrap">
        <p className={`font-bold leading-none ${utama ? "text-5xl" : "text-4xl"} ${warnaMvod(utamaHasil.mvod)}`}>
          {fmtMvod(utamaHasil.mvod)}
        </p>
        {berubah && (
          <p className="text-sm text-[#94a3b8]">
            asli <span className="line-through">{fmtMvod(asli.mvod)}</span>
          </p>
        )}
      </div>
      <p className="text-xs text-[#5D6D7E] mt-1.5">
        {keterangan}
        {banding && <span className="text-[#00695C]"> · setelah koreksi waktu nyala</span>}
      </p>
      {/* Nol adalah LANTAI, bukan dasar skala. Tanpa penanda ini, unit yang
          rata-ratanya 2,1x SLA dan yang 3x SLA sama-sama terbaca "0" dan
          tampak setara — padahal jaraknya jauh. */}
      {utamaHasil.mentah < 0 && utamaHasil.kali > 0 && (
        <p className="text-[11px] text-red-600 mt-1">
          Tertahan di 0 — rata-rata {fmtDurasi(utamaHasil.rataMenit)} sudah melewati
          dua kali SLA
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-[#E2E8F0]">
        <AngkaDasar label="Kali padam" nilai={String(utamaHasil.kali)}
          asli={banding && asli.kali !== koreksi.kali ? String(asli.kali) : null} />
        <AngkaDasar label="Total durasi" nilai={fmtDurasi(utamaHasil.totalMenit)}
          asli={banding && Math.round(asli.totalMenit) !== Math.round(koreksi.totalMenit)
            ? fmtDurasi(asli.totalMenit) : null} />
        <AngkaDasar label="Rata-rata" nilai={utamaHasil.kali ? fmtDurasi(utamaHasil.rataMenit) : "—"}
          asli={banding && utamaHasil.kali && Math.round(asli.rataMenit) !== Math.round(koreksi.rataMenit)
            ? fmtDurasi(asli.rataMenit) : null} />
      </div>
    </div>
  );
}

function AngkaDasar({ label, nilai, asli }: { label: string; nilai: string; asli: string | null }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[#5D6D7E]">{label}</p>
      <p className="text-lg font-bold text-[#1B2631] leading-tight">{nilai}</p>
      {asli && <p className="text-[10px] text-[#94a3b8] line-through leading-tight">{asli}</p>}
    </div>
  );
}

export default function MvodTab({
  rows, slaMenit, slaTersimpan, bisaAturSla, onAturSla, periodeLabel,
}: Props) {
  const d = useMemo(() => {
    const asli = hitungSisi(rows, slaMenit, "asli");
    const koreksi = hitungSisi(rows, slaMenit, "koreksi");

    // Daftar ULP gabungan: sebuah ULP bisa muncul di satu sisi saja kalau
    // koreksi mendorong satu-satunya kejadiannya melewati ambang 5 menit.
    const namaUlp = [...new Set([...asli.perUlp.keys(), ...koreksi.perUlp.keys()])];

    return {
      asli,
      koreksi,
      dikoreksi: rows.filter(adaKoreksi).length,
      ulp: namaUlp
        .map((nama) => ({
          nama,
          asli: asli.perUlp.get(nama) ?? null,
          kor: koreksi.perUlp.get(nama) ?? null,
        }))
        // Terburuk di atas — nilai terkecil, karena skalanya makin besar makin baik.
        .sort((a, b) => ((a.kor ?? a.asli)?.mvod ?? 0) - ((b.kor ?? b.asli)?.mvod ?? 0)),
      // Angka penyaringan — supaya terlihat berapa yang dibuang dan kenapa.
      total: rows.length,
      bukanJ: rows.filter((r) => !isKodeJ(r)).length,
      jPendek: rows.filter((r) => isKodeJ(r) && durasiMenit(r) <= MIN_DURASI_MENIT).length,
    };
  }, [rows, slaMenit]);

  const banding = d.dikoreksi > 0;
  const tampil = banding ? d.koreksi : d.asli;

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

      {banding && (
        <div className="rounded-xl border border-[#B2DFDB] bg-[#E0F2F1]/50 px-4 py-3 text-xs text-[#00695C]">
          <b>{d.dikoreksi} kejadian</b> waktu nyalanya sudah dikoreksi. Angka utama di
          bawah memakai waktu setelah koreksi; angka asli APKT ditampilkan tercoret
          sebagai pembanding.
          {d.asli.layak !== d.koreksi.layak && (
            <> Jumlah kejadian yang masuk hitungan berubah dari <b>{d.asli.layak}</b> jadi{" "}
              <b>{d.koreksi.layak}</b> — koreksi menggeser sebagian melewati ambang
              {" "}{MIN_DURASI_MENIT} menit.</>
          )}
        </div>
      )}

      {tampil.layak === 0 ? (
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
              asli={d.asli.semua}
              koreksi={d.koreksi.semua}
              banding={banding}
              utama
            />
            <KartuMvod
              judul="MVOD — Gangguan Murni"
              keterangan="Hanya yang berstatus gangguan murni"
              asli={d.asli.murni}
              koreksi={d.koreksi.murni}
              banding={banding}
            />
          </div>

          {/* Cakupan klasifikasi. Ini bukan hiasan: kalau sebagian besar baris
              belum berstatus, angka "gangguan murni" berdiri di atas segelintir
              kejadian dan tidak boleh dibaca sebagai mewakili keseluruhan. */}
          {tampil.belumDiklasifikasi > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <TriangleAlert size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-[#1B2631] leading-relaxed">
                <b>{tampil.belumDiklasifikasi} dari {tampil.layak} kejadian belum diisi status gangguannya.</b>{" "}
                Angka MVOD Gangguan Murni di atas hanya menghitung {tampil.murni.kali} kejadian, jadi belum
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
                <p className="font-bold text-[#00897B]">{tampil.layak}</p>
              </div>
            </div>
          </div>

          {/* Per ULP — hanya bermakna saat melihat semua ULP sekaligus. */}
          {d.ulp.length > 1 && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E2E8F0]">
                <h4 className="text-sm font-semibold text-[#1B2631]">MVOD per ULP</h4>
                <p className="text-xs text-[#5D6D7E] mt-0.5">
                  Diurutkan dari yang terburuk{banding && " · angka setelah koreksi"}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#E0F2F1] text-[#00695C]">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold">ULP</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold">Kali Padam</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold">Total Durasi</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold">Rata-rata</th>
                    {banding && (
                      <th className="px-4 py-2.5 text-right text-xs font-semibold border-l border-[#B2DFDB]">
                        MVOD Asli
                      </th>
                    )}
                    <th className="px-5 py-2.5 text-right text-xs font-semibold">
                      {banding ? "MVOD Koreksi" : "MVOD"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {d.ulp.map((u) => {
                    const t = (banding ? u.kor : u.asli) ?? u.asli ?? u.kor;
                    if (!t) return null;
                    return (
                      <tr key={u.nama}>
                        <td className="px-5 py-2.5 font-semibold text-[#1B2631]">{u.nama}</td>
                        <td className="px-4 py-2.5 text-center text-[#5D6D7E] tabular-nums">{t.kali}</td>
                        <td className="px-4 py-2.5 text-center text-[#5D6D7E] tabular-nums">{fmtDurasi(t.totalMenit)}</td>
                        <td className="px-4 py-2.5 text-center text-[#5D6D7E] tabular-nums">{fmtDurasi(t.rataMenit)}</td>
                        {banding && (
                          <td className="px-4 py-2.5 text-right tabular-nums text-[#94a3b8] border-l border-[#E2E8F0]">
                            {fmtMvod(u.asli?.mvod ?? null)}
                          </td>
                        )}
                        <td className={`px-5 py-2.5 text-right font-bold tabular-nums ${warnaMvod(t.mvod)}`}>
                          {fmtMvod(t.mvod)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
