"use client";

import { useState } from "react";
import { CalendarDays, FileText, MapPin, RefreshCw, Table2, Target, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import TabPil, { type ItemTab } from "@/app/admin/_kit/TabPil";
import { PilihField } from "@/app/admin/_kit/Field";
import Tombol from "@/app/admin/_kit/Tombol";
import { BULAN, useKinerjaYantek } from "./_hooks/useKinerjaYantek";
import TabelKinerja from "./_components/TabelKinerja";
import AturSlaModal from "./_components/AturSlaModal";
import CetakWoModal from "./_components/CetakWoModal";
import CentangRealisasiModal from "./_components/CentangRealisasiModal";
import RealisasiHarian from "./_components/RealisasiHarian";

/**
 * Rekap Kinerja Pelayanan Teknik.
 *
 * Satu layar yang menjawab satu pertanyaan: dari sebelas jenis pekerjaan
 * Pelayanan Teknik, berapa yang diterbitkan, berapa yang jadi, dan berapa yang
 * masih menunggu persetujuan.
 *
 * Sengaja TIDAK memakai kartu KPI besar di atas tabel (ditegaskan lagi user
 * 15 Okt 2026 saat UI baru — kartu mockup tidak dipasang). Angka besar di puncak
 * layar menuntut satu angka tunggal yang mewakili semuanya — dan di sini tidak
 * ada: satuannya berbeda-beda, dan separuh barisnya belum punya WO sama sekali.
 * Angka tunggal yang menutupi kenyataan itu akan dikutip di rapat, lalu
 * dipercaya.
 *
 * Tab "Realisasi Harian" (6 Okt 2026): pekerjaan yang dikirim regu pada satu
 * tanggal + teks WA-nya. Tabel bulanan tidak berubah. 7 Okt: ditambah "Per
 * bulan" (perbandingan antar-ULP, rata-rata per hari berealisasi), dan "Semua
 * ULP" di Per hari tampil berkolom per ULP.
 */

type Tab = "bulanan" | "harian";

const TABS: ItemTab<Tab>[] = [
  { kunci: "bulanan", label: "Rekap Bulanan", ikon: Table2 },
  { kunci: "harian", label: "Realisasi Harian", ikon: CalendarDays },
];

export default function KinerjaYantekPage() {
  const user = useCurrentUser();
  const {
    baris, loading, adaGagal, tahun, setTahun, bulan, setBulan,
    ulp, setUlp, daftarUlp, daftarTahun, muatUlang,
  } = useKinerjaYantek(user);

  const periode = bulan === 0 ? String(tahun) : `${BULAN[bulan - 1]} ${tahun}`;
  // SLA diisi UP3 (semua ULP) atau admin ULP sendiri — dijaga database juga.
  const bolehSla = user.role === "UP3" || user.role === "admin";
  const [aturSla, setAturSla] = useState(false);
  const [cetakWo, setCetakWo] = useState(false);
  const [centang, setCentang] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("bulanan");
  const bulanIni = new Date().getMonth() + 1;
  const periodeCentang = `${tahun}-${String(bulan || bulanIni).padStart(2, "0")}`;

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiKepala>
        <TabPil tab={TABS} aktif={tab} onPilih={setTab} />
      </IsiKepala>

      {tab === "harian" ? (
        <RealisasiHarian
          ulpAwal={ulp}
          daftarUlp={daftarUlp}
          daftarTahun={daftarTahun}
          pengatur={bolehSla ? user.name ?? user.email : null}
        />
      ) : (
      <>
      <IsiTopbar>
        <PilihField
          ikon={CalendarDays}
          label="Periode"
          lebar="w-[175px]"
          nilai={`${tahun}-${bulan}`}
          onUbah={(v) => {
            const [t, b] = v.split("-").map(Number);
            if (t !== tahun) setTahun(t);
            if (b !== bulan) setBulan(b);
          }}
        >
          {daftarTahun.map((t) => (
            <optgroup key={t} label={String(t)}>
              {BULAN.map((b, i) => <option key={b} value={`${t}-${i + 1}`}>{b} {t}</option>)}
              <option value={`${t}-0`}>Seluruh tahun {t}</option>
            </optgroup>
          ))}
        </PilihField>
        <PilihField ikon={MapPin} label="ULP" lebar="w-[155px]" nilai={ulp} onUbah={setUlp} disabled={daftarUlp.length <= 1}>
          {daftarUlp.map((u) => <option key={u} value={u}>{u === "SEMUA" ? "Semua ULP" : u}</option>)}
        </PilihField>
        <Tombol onClick={muatUlang} disabled={loading} ikon={<RefreshCw size={15} className={loading ? "animate-spin" : ""} />}>
          Muat ulang
        </Tombol>
      </IsiTopbar>

      {bolehSla && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Tombol onClick={() => setCetakWo(true)} ikon={<FileText size={15} />}>Cetak / Kirim WO</Tombol>
          <Tombol onClick={() => setAturSla(true)} ikon={<Target size={15} />}>Atur SLA</Tombol>
        </div>
      )}

      {adaGagal && !loading && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">Sebagian data gagal dibaca dari server</p>
            <p className="mt-0.5 text-amber-700">
              Baris yang bertanda <span className="font-semibold">gagal dimuat</span> angkanya
              dikosongkan, bukan ditulis nol — rekap ini belum lengkap dan belum bisa dipakai
              sebagai dasar penilaian. Coba muat ulang.
            </p>
          </div>
        </div>
      )}

      <TabelKinerja baris={baris} loading={loading} periode={periode} onCentang={bolehSla ? setCentang : undefined} />
      </>
      )}

      {aturSla && (
        <AturSlaModal
          user={user}
          ulpAwal={ulp === "SEMUA" ? null : ulp}
          onTutup={() => setAturSla(false)}
          onTersimpan={muatUlang}
        />
      )}

      {cetakWo && (
        <CetakWoModal
          user={user}
          ulpAwal={ulp === "SEMUA" ? null : ulp}
          onTutup={() => setCetakWo(false)}
          onBerubah={muatUlang}
        />
      )}

      {centang && (
        <CentangRealisasiModal
          user={user}
          kunci={centang}
          ulpAwal={ulp === "SEMUA" ? null : ulp}
          periodeAwal={periodeCentang}
          onTutup={() => setCentang(null)}
          onBerubah={muatUlang}
        />
      )}
    </div>
  );
}
