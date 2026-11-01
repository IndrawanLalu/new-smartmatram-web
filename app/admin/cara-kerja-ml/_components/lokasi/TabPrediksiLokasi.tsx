"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import ChipSaring from "@/app/admin/_kit/ChipSaring";
import Tombol from "@/app/admin/_kit/Tombol";
import { KotakCari } from "@/app/admin/_kit/Field";
import { PilihPeriode, PilihUlp } from "@/app/admin/_kit/Saringan";
import { usePrediksiLokasi, type SaringTemuan } from "../../_hooks/usePrediksiLokasi";
import TabelGangguan from "./TabelGangguan";
import PanelRapor from "./PanelRapor";
import DetailLokasiModal from "./DetailLokasiModal";

/**
 * Tab "Prediksi Lokasi Gangguan" (31 Okt 2026). Semua gangguan — sheet dan
 * laporan WA — bisa dibuka untuk melihat prediksi lokasinya, dan UP3/admin
 * mengisi tiang tempat gangguan benar-benar ditemukan, termasuk gangguan lama.
 * Lokasi temuan itulah bahan kalibrasi & rapor akurasi.
 */
export default function TabPrediksiLokasi() {
  const user = useCurrentUser();
  const o = usePrediksiLokasi(user);
  const [kunci, setKunci] = useState<string | null>(null);
  // Modal membaca baris hidup dari daftar lengkap (teknisaplikasi butir 7).
  const detail = kunci ? o.semua.find((b) => b.kunci === kunci) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <IsiTopbar>
        <PilihUlp nilai={o.ulp} onUbah={o.setUlp} daftar={o.daftarUlp} />
        <PilihPeriode tahun={o.tahun} bulan={o.bulan} daftarTahun={o.daftarTahun} onTahun={o.setTahun} onBulan={o.setBulan} />
        <KotakCari nilai={o.cari} onUbah={o.setCari} placeholder="Cari penyulang, recloser, tiang" lebar="w-[240px]" />
      </IsiTopbar>

      <div className="rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 text-xs text-brand-800 flex gap-2">
        <Info size={15} className="shrink-0 mt-0.5" />
        <p>
          Lokasi diperkirakan dari arus gangguan dan data jaringan JTM. <b>OC</b> (antar fasa): area calon berpatokan, urut paling cocok.
          <b> EF</b> (tanah): NGR 40 Ω membuat arusnya tidak peka jarak, jadi yang diberikan zona: cek peralatan dulu, lalu seksi terpanjang. Laporan
          dispatcher yang diteruskan ke japri bot WA langsung dibalas prediksinya; angka dari sheet menggantikannya bila ada koreksi.
        </p>
      </div>

      <PanelRapor kalibrasi={o.kalibrasi} rapor={o.rapor} bolehIsi={o.bolehIsi} onSelesai={o.muatUlang} />

      <ChipSaring<SaringTemuan>
        item={[
          { kunci: "SEMUA", label: "Semua", angka: o.loading ? null : o.hitung.SEMUA },
          { kunci: "BELUM", label: "Lokasi belum diisi", angka: o.loading ? null : o.hitung.BELUM },
          { kunci: "SUDAH", label: "Lokasi sudah diisi", angka: o.loading ? null : o.hitung.SUDAH },
        ]}
        aktif={o.saring}
        onPilih={o.setSaring}
      />

      {o.galat ? (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>Daftar gangguan gagal dimuat: {o.galat} — kosongnya tabel bukan berarti tidak ada gangguan.</span>
          <Tombol ukuran="sm" onClick={o.muatUlang}>Muat ulang</Tombol>
        </div>
      ) : (
        <TabelGangguan baris={o.baris} loading={o.loading} onDetail={(b) => setKunci(b.kunci)} />
      )}

      {detail && (
        <DetailLokasiModal
          key={detail.kunci}
          baris={detail}
          bolehIsi={o.bolehIsi}
          onTemuan={o.tambalTemuan}
          onClose={() => setKunci(null)}
        />
      )}
    </div>
  );
}
