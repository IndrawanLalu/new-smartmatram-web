"use client";

import { useState } from "react";
import { FileText, RefreshCw, Target, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { BTN_GHOST, FIELD } from "@/app/admin/_ui";
import { BULAN, useKinerjaYantek } from "./_hooks/useKinerjaYantek";
import TabelKinerja from "./_components/TabelKinerja";
import AturSlaModal from "./_components/AturSlaModal";
import CetakWoModal from "./_components/CetakWoModal";
import CentangRealisasiModal from "./_components/CentangRealisasiModal";

/**
 * Rekap Kinerja Pelayanan Teknik.
 *
 * Satu layar yang menjawab satu pertanyaan: dari sebelas jenis pekerjaan
 * Pelayanan Teknik, berapa yang diterbitkan, berapa yang jadi, dan berapa yang
 * masih menunggu persetujuan.
 *
 * Sengaja TIDAK memakai kartu KPI besar di atas tabel. Angka besar di puncak
 * layar menuntut satu angka tunggal yang mewakili semuanya — dan di sini tidak
 * ada: satuannya berbeda-beda, dan separuh barisnya belum punya WO sama sekali.
 * Angka tunggal yang menutupi kenyataan itu akan dikutip di rapat, lalu
 * dipercaya.
 */

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
  const bulanIni = new Date().getMonth() + 1;
  const periodeCentang = `${tahun}-${String(bulan || bulanIni).padStart(2, "0")}`;

  return (
    <div className="text-ink flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tahun}
          onChange={(e) => setTahun(Number(e.target.value))}
          className={`${FIELD} w-[110px]`}
          aria-label="Tahun"
        >
          {daftarTahun.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Bulan sebelum ULP: yang paling sering diganti ditaruh paling dekat
            dengan tahun, dan ULP jarang berubah dalam satu sesi. */}
        <select
          value={bulan}
          onChange={(e) => setBulan(Number(e.target.value))}
          className={`${FIELD} w-[150px]`}
          aria-label="Bulan"
        >
          <option value={0}>Seluruh tahun</option>
          {BULAN.map((b, i) => (
            <option key={b} value={i + 1}>{b}</option>
          ))}
        </select>

        <select
          value={ulp}
          onChange={(e) => setUlp(e.target.value)}
          className={`${FIELD} w-[170px]`}
          disabled={daftarUlp.length <= 1}
          aria-label="ULP"
        >
          {daftarUlp.map((u) => (
            <option key={u} value={u}>{u === "SEMUA" ? "Semua ULP" : u}</option>
          ))}
        </select>

        <button onClick={muatUlang} className={BTN_GHOST} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Muat ulang
        </button>

        {bolehSla && (
          <>
            <button onClick={() => setCetakWo(true)} className={`${BTN_GHOST} ml-auto`}>
              <FileText size={14} />
              Cetak / Kirim WO
            </button>
            <button onClick={() => setAturSla(true)} className={BTN_GHOST}>
              <Target size={14} />
              Atur SLA
            </button>
          </>
        )}
      </div>

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
