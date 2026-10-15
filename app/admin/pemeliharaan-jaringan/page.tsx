"use client";

import { useState } from "react";
import { ClipboardList, Download, LayoutDashboard, ListChecks, Loader2, Settings2, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CHIP, CHIP_OFF, CHIP_ON } from "@/app/admin/_ui";
import { usePemeliharaanJaringan, STATUS_TABEL, type JenisJaringan } from "./_hooks/usePemeliharaanJaringan";
import TabelPemeliharaan from "./_components/TabelPemeliharaan";
import DetailPemeliharaanModal from "./_components/DetailPemeliharaanModal";
import DashboardPemeliharaan from "./_components/DashboardPemeliharaan";
import PengaturanKategori from "./_components/PengaturanKategori";
import TugasHarjar from "./_components/TugasHarjar";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import TabPil from "@/app/admin/_kit/TabPil";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import { KotakCari } from "@/app/admin/_kit/Field";
import { PilihPeriode, PilihTahun, PilihUlp } from "@/app/admin/_kit/Saringan";
import ChipSaring from "@/app/admin/_kit/ChipSaring";
import { nadaStatus } from "@/lib/statusUi";

/**
 * Pemeliharaan Jaringan JTM/JTR.
 *
 * Pola halaman Kinerja Pelayanan Teknik (acuan: Optimasi Trafo,
 * teknisaplikasi.md butir 7): Daftar → Dashboard → Pengaturan. Status
 * verifikasi adalah CHIP penyaring di daftar, bukan tab tersendiri.
 *
 * DICATAT DARI HP, DIPERIKSA DI SINI. Tidak ada tombol "tambah catatan" di
 * web: bukti pekerjaan ini adalah foto sebelum-sesudah dan titiknya, dan
 * ketiganya cuma berarti kalau diambil di tempat kejadian. Yang dibuat di web
 * hanya PERINTAH kerjanya — tab "Tugas" (6 Okt 2026).
 */

const TABS = [
  { key: "daftar", label: "Daftar Pemeliharaan", icon: ListChecks },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "tugas", label: "Tugas", icon: ClipboardList },
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
  const tugas = tab === "tugas";
  // Penyaring khusus catatan pekerjaan (cari, jenis, status) tidak berlaku di
  // Dashboard maupun Tugas — Tugas punya chip & cari sendiri.
  const saringCatatan = !dashboard && !tugas;

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiKepala>
        <TabPil tab={TABS.map((t) => ({ kunci: t.key, label: t.label, ikon: t.icon }))} aktif={tab} onPilih={setTab} />
      </IsiKepala>

      {tab === "pengaturan" ? (
        <PengaturanKategori kategori={o.kategori} onSimpan={o.simpanKategori} />
      ) : (
        <>
          <IsiTopbar>
            <PilihUlp nilai={o.ulp} onUbah={o.setUlp} daftar={o.daftarUlp} />
            {/* Dashboard selalu setahun penuh — penyaring bulan disembunyikan
                di sana supaya tidak dikira ikut berlaku. */}
            {dashboard ? (
              <PilihTahun tahun={o.tahun} daftarTahun={o.daftarTahun} onTahun={o.setTahun} />
            ) : (
              <PilihPeriode tahun={o.tahun} bulan={o.bulan} daftarTahun={o.daftarTahun} onTahun={o.setTahun} onBulan={o.setBulan} />
            )}
            {saringCatatan && (
              <KotakCari nilai={o.cari} onUbah={o.setCari} placeholder="Cari penyulang, pekerjaan, petugas" lebar="w-[240px]" />
            )}
          </IsiTopbar>

          {saringCatatan && (
            <div className="flex flex-wrap items-center gap-2">
              {JENIS.map((j) => (
                <button key={j} onClick={() => o.setJenis(j)} className={`${CHIP} ${o.jenis === j ? CHIP_ON : CHIP_OFF}`}>
                  {j === "SEMUA" ? "JTM & JTR" : j}
                </button>
              ))}
            </div>
          )}

          {saringCatatan && (
            <div className="flex flex-wrap items-center gap-2 -mt-1">
              <ChipSaring
                item={[
                  { kunci: "SEMUA" as const, label: "Semua" },
                  ...STATUS_TABEL.map((s) => ({ kunci: s, label: s, angka: o.loading ? null : o.hitung[s], nada: nadaStatus(s) })),
                ]}
                aktif={o.status}
                onPilih={o.setStatus}
              />
              <button
                onClick={() => void unduh()}
                disabled={o.loading || !!o.galat || o.baris.length === 0 || mengunduh}
                title="Mengunduh baris yang sedang tampil di tabel"
                className="ml-auto inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 text-white text-[13px] font-semibold shadow-sm hover:bg-brand-700 transition-colors disabled:opacity-40"
              >
                {mengunduh ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Download XLSX
              </button>
            </div>
          )}

          {tugas ? (
            <TugasHarjar key={`${o.ulp}`} ulp={o.ulp} tahun={o.tahun} bulan={o.bulan} oleh={oleh} />
          ) : dashboard ? (
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
