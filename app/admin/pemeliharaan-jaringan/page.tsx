"use client";

import { useState } from "react";
import { Download, LayoutDashboard, ListChecks, Loader2, Search, Settings2, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { usePemeliharaanJaringan, BULAN, STATUS_TABEL, type JenisJaringan } from "./_hooks/usePemeliharaanJaringan";
import TabelPemeliharaan from "./_components/TabelPemeliharaan";
import DetailPemeliharaanModal from "./_components/DetailPemeliharaanModal";
import DashboardPemeliharaan from "./_components/DashboardPemeliharaan";
import PengaturanKategori from "./_components/PengaturanKategori";

/**
 * Pemeliharaan Jaringan JTM/JTR.
 *
 * Pola halaman Kinerja Pelayanan Teknik (acuan: Optimasi Trafo,
 * teknisaplikasi.md butir 7): Daftar → Dashboard → Pengaturan. Status
 * verifikasi adalah CHIP penyaring di daftar, bukan tab tersendiri.
 *
 * DICATAT DARI HP, DIPERIKSA DI SINI. Tidak ada tombol "tambah" di web: bukti
 * pekerjaan ini adalah foto sebelum-sesudah dan titiknya, dan ketiganya cuma
 * berarti kalau diambil di tempat kejadian.
 */

const TABS = [
  { key: "daftar", label: "Daftar Pemeliharaan", icon: ListChecks },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "pengaturan", label: "Pengaturan Kategori", icon: Settings2 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const JENIS: ("SEMUA" | JenisJaringan)[] = ["SEMUA", "JTM", "JTR"];

export default function PemeliharaanJaringanPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const [idDetail, setIdDetail] = useState<string | null>(null);
  const [mengunduh, setMengunduh] = useState(false);
  const o = usePemeliharaanJaringan(user);
  const oleh = user.name ?? user.email ?? "";

  // Modal membaca dari daftar LENGKAP yang hidup — status berubah langsung
  // sesudah verifikasi, dan baris yang keluar dari saringan tidak menutup modal.
  const detail = idDetail ? (o.semua.find((b) => b.id === idDetail) ?? null) : null;

  const unduh = async () => {
    setMengunduh(true);
    try {
      const { unduhExcelPemeliharaan } = await import("./_lib/unduhExcel");
      const periode = o.bulan === 0 ? `${o.tahun}` : `${o.tahun}-${String(o.bulan).padStart(2, "0")}`;
      await unduhExcelPemeliharaan(o.baris, `Pemeliharaan_Jaringan_${o.ulp === "SEMUA" ? "SemuaULP" : o.ulp}_${periode}.xlsx`);
    } finally {
      setMengunduh(false);
    }
  };

  const dashboard = tab === "dashboard";

  return (
    <div className="text-ink flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`${CHIP} ${tab === key ? CHIP_ON : CHIP_OFF}`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === "pengaturan" ? (
        <PengaturanKategori kategori={o.kategori} onSimpan={o.simpanKategori} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={o.ulp}
              onChange={(e) => o.setUlp(e.target.value)}
              className={`${FIELD} w-[170px]`}
              disabled={o.daftarUlp.length <= 1}
              aria-label="ULP"
            >
              {o.daftarUlp.map((u) => (
                <option key={u} value={u}>{u === "SEMUA" ? "Semua ULP" : u}</option>
              ))}
            </select>

            {/* Dashboard selalu setahun penuh — penyaring bulan disembunyikan
                di sana supaya tidak dikira ikut berlaku. */}
            {!dashboard && (
              <select value={o.bulan} onChange={(e) => o.setBulan(Number(e.target.value))} className={`${FIELD} w-[160px]`} aria-label="Bulan">
                <option value={0}>Sepanjang tahun</option>
                {BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
              </select>
            )}
            <select value={o.tahun} onChange={(e) => o.setTahun(Number(e.target.value))} className={`${FIELD} w-[100px]`} aria-label="Tahun">
              {o.daftarTahun.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            {!dashboard && (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input
                    value={o.cari}
                    onChange={(e) => o.setCari(e.target.value)}
                    placeholder="Cari penyulang / pekerjaan / petugas"
                    className={`${FIELD} w-[250px] pl-8`}
                  />
                </div>
                {JENIS.map((j) => (
                  <button key={j} onClick={() => o.setJenis(j)} className={`${CHIP} ${o.jenis === j ? CHIP_ON : CHIP_OFF}`}>
                    {j === "SEMUA" ? "JTM & JTR" : j}
                  </button>
                ))}
              </>
            )}
          </div>

          {!dashboard && (
            <div className="flex flex-wrap items-center gap-2 -mt-1">
              <button onClick={() => o.setStatus("SEMUA")} className={`${CHIP} ${o.status === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>
                Semua
              </button>
              {STATUS_TABEL.map((s) => (
                <button key={s} onClick={() => o.setStatus(s)} className={`${CHIP} ${o.status === s ? CHIP_ON : CHIP_OFF}`}>
                  {s} <span className="opacity-70">{o.loading ? "" : o.hitung[s]}</span>
                </button>
              ))}
              <button
                onClick={() => void unduh()}
                disabled={o.loading || !!o.galat || o.baris.length === 0 || mengunduh}
                title="Mengunduh baris yang sedang tampil di tabel"
                className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded-lg bg-navy-600 text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {mengunduh ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Download XLSX
              </button>
            </div>
          )}

          {dashboard ? (
            // key: ganti ULP/tahun = pasang ulang, jadi keadaan "memuat" tidak
            // menampilkan angka periode sebelumnya.
            <DashboardPemeliharaan key={`${o.ulp}-${o.tahun}`} ulp={o.ulp} tahun={o.tahun} kategori={o.kategori} />
          ) : o.galat && !o.loading ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-semibold text-amber-800">Daftar gagal dimuat</p>
                <p className="mt-0.5 text-amber-700">
                  {o.galat} — kosongnya tabel bukan berarti tidak ada pekerjaan.
                </p>
                <button onClick={o.muat} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">
                  Muat ulang
                </button>
              </div>
            </div>
          ) : (
            <TabelPemeliharaan baris={o.baris} loading={o.loading} onDetail={(b) => setIdDetail(b.id)} />
          )}
        </>
      )}

      {detail && (
        <DetailPemeliharaanModal
          b={detail}
          kategori={o.kategori}
          oleh={oleh}
          onTutup={() => setIdDetail(null)}
          onVerifikasi={o.verifikasi}
          onBatalkan={o.batalkan}
          onKembalikan={o.kembalikan}
          onKoreksi={o.koreksi}
        />
      )}
    </div>
  );
}
