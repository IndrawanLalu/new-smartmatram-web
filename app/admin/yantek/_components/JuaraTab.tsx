"use client";

import { useMemo, useState } from "react";
import { Gauge, Star, Timer, Trophy, Wrench, Zap } from "lucide-react";
import { CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW } from "@/app/admin/_ui";
import { BOBOT_RATING, buildPapanJuara, juaraKategori, KRITERIA, POIN_NETRAL, type KriteriaKey } from "../_lib/juara";
import type { YantekRow } from "../_lib/yantek";
import type { SlaAktif } from "../_hooks/useYantekSla";
import KategoriJuaraCard from "./KategoriJuaraCard";
import PapanPeringkat from "./PapanPeringkat";
import PetugasDetailModal from "./PetugasDetailModal";
import Podium from "./Podium";

/**
 * Dashboard kompetisi petugas yantek.
 *
 * Alur bacanya menurun: panggung juara umum → juara tiap kriteria → klasemen
 * lengkap. Semua angka berasal dari baris yang SAMA dengan tab lain (sudah
 * tersaring bulan & ULP di level halaman), jadi juara di sini tidak mungkin
 * berbeda dengan tabel rekap.
 */

const IKON: Record<KriteriaKey, typeof Star> = {
  rating: Star,
  wo: Wrench,
  response: Zap,
  recovery: Timer,
};

/** Ambang minimal WO agar ikut diperingkat. Tanpa ini papan juara dimenangkan
 *  orang yang kebetulan cuma menangani satu gangguan mudah. */
const PILIHAN_MIN_WO = [1, 3, 5, 10];
const MIN_WO_BAWAAN = 5;

interface JuaraTabProps {
  rows: YantekRow[];
  sla: SlaAktif;
  bulanKey: string;
  periode: string;
  cakupan: string;
}

export default function JuaraTab({ rows, sla, bulanKey, periode, cakupan }: JuaraTabProps) {
  const [minWo, setMinWo] = useState(MIN_WO_BAWAAN);
  const [terbuka, setTerbuka] = useState<string | null>(null);

  const { papan, totalPetugas } = useMemo(() => buildPapanJuara(rows, minWo), [rows, minWo]);

  const tiga = papan.slice(0, 3);
  const rowsTerbuka = terbuka ? (papan.find((p) => p.nama === terbuka)?.rows ?? []) : [];

  if (papan.length === 0) {
    return (
      <div className={`${CARD} py-16 flex flex-col items-center gap-2 text-ink-muted`}>
        <Trophy className="w-10 h-10 opacity-25" />
        <p className="text-sm">
          {totalPetugas === 0
            ? "Belum ada data petugas pada periode ini"
            : `Tidak ada petugas dengan minimal ${minWo} WO pada periode ini`}
        </p>
        {totalPetugas > 0 && (
          <button
            onClick={() => setMinWo(1)}
            className="text-xs font-medium text-navy-600 hover:underline"
          >
            Tampilkan semua petugas
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Podium tiga={tiga} periode={periode} cakupan={cakupan} onPilih={setTerbuka} />

      {/* Aturan main — dibuat terlihat, bukan disembunyikan di dalam kode.
          Papan peringkat orang sungguhan harus bisa dibantah, dan itu hanya
          mungkin kalau syarat & cara hitungnya terbaca di layar yang sama. */}
      <div className={`${CARD} px-4 py-2.5`}>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Gauge size={14} className="text-navy-600 shrink-0" />
          <span className={EYEBROW}>Syarat ikut peringkat</span>
          <span className="text-xs text-ink-soft">Minimal</span>
          {PILIHAN_MIN_WO.map((n) => (
            <button
              key={n}
              onClick={() => setMinWo(n)}
              className={`${CHIP} ${minWo === n ? CHIP_ON : CHIP_OFF}`}
            >
              {n === 1 ? "Semua" : `${n} WO`}
            </button>
          ))}
          <span className="text-xs text-ink-muted ml-auto">
            {papan.length} dari {totalPetugas} petugas memenuhi syarat
          </span>
        </div>
        <p className="text-[11px] text-ink-muted mt-2 leading-relaxed border-t border-line pt-2">
          Skor gabungan 0–100 dengan <b>rating berbobot {Math.round(BOBOT_RATING * 100)}%</b> —
          kepuasan pelanggan adalah hasil yang dikejar, WO/response/recovery adalah caranya, dan
          ketiganya berbagi {Math.round((1 - BOBOT_RATING) * 100)}% sisanya.{" "}
          <b>Poin rating = mutu × bukti</b>: mutu dari rata-rata bintang (sama persis dengan kolom
          Avg ★ di tab Rekap, 1★=0 sampai 5★=100), bukti dari banyaknya penilaian — 5,00 dari 80
          pelanggan bernilai lebih daripada 5,00 dari satu pelanggan. Tanpa satu pun penilaian
          mendapat 0, jadi tidak bisa jadi juara umum tanpa dinilai pelanggan.{" "}
          <b>WO, response, dan recovery</b> diukur sebagai perbandingan terhadap yang terbaik di
          papan ini, bukan urutan peringkat — supaya selisih 3 menit tetap terasa seperti 3 menit.
          Yang datanya tidak ada diberi poin netral {POIN_NETRAL} dan tidak bisa memenangkan
          kategorinya.
        </p>
      </div>

      {/* Juara per kriteria */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        {KRITERIA.map((k, i) => (
          <KategoriJuaraCard
            key={k.key}
            kriteria={k}
            icon={IKON[k.key]}
            tiga={juaraKategori(papan, k)}
            urutan={i}
            onPilih={setTerbuka}
          />
        ))}
      </div>

      <PapanPeringkat papan={papan} onPilih={setTerbuka} />

      {terbuka && (
        <PetugasDetailModal
          nama={terbuka}
          rows={rowsTerbuka}
          sla={sla}
          bulanKey={bulanKey}
          awalHanyaLanggar={false}
          onClose={() => setTerbuka(null)}
        />
      )}
    </div>
  );
}
