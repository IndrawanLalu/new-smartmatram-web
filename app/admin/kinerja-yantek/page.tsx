"use client";

import { RefreshCw } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { BTN_GHOST, FIELD } from "@/app/admin/_ui";
import { BULAN, useKinerjaYantek } from "./_hooks/useKinerjaYantek";
import TabelKinerja from "./_components/TabelKinerja";

/**
 * Rekap Kinerja Pelayanan Teknik.
 *
 * Satu layar yang menjawab satu pertanyaan: dari delapan jenis pekerjaan
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
    baris, loading, tahun, setTahun, bulan, setBulan,
    ulp, setUlp, daftarUlp, daftarTahun, muatUlang,
  } = useKinerjaYantek(user);

  const periode = bulan === 0 ? String(tahun) : `${BULAN[bulan - 1]} ${tahun}`;

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
      </div>

      <TabelKinerja baris={baris} loading={loading} periode={periode} />
    </div>
  );
}
