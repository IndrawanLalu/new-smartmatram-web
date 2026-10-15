"use client";

import { useState } from "react";
import { Download, ListChecks, Loader2, Settings2, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useOptimasiTrafo, STATUS_TABEL } from "./_hooks/useOptimasiTrafo";
import TabelOptimasi from "./_components/TabelOptimasi";
import DetailOptimasiModal from "./_components/DetailOptimasiModal";
import PengaturanAlasan from "./_components/PengaturanAlasan";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import TabPil from "@/app/admin/_kit/TabPil";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import { KotakCari } from "@/app/admin/_kit/Field";
import { PilihPeriode, PilihUlp } from "@/app/admin/_kit/Saringan";
import ChipSaring from "@/app/admin/_kit/ChipSaring";
import { nadaStatus } from "@/lib/statusUi";
import CatatanInfo from "@/app/admin/_kit/CatatanInfo";

/**
 * Optimasi Trafo — uprating/downrating kapasitas trafo.
 *
 * DICATAT DARI HP, DIPERIKSA & DIPUTUSKAN DI SINI. Tidak ada tombol "tambah"
 * di web: nomor seri dibaca dari papan nama, dan fotonya cuma berarti kalau
 * diambil di depan trafonya. Admin bisa mengoreksi salah input selama catatan
 * belum diverifikasi.
 *
 * Bedanya dengan modul lain: memverifikasi di sini MENGUBAH MASTER GARDU.
 * Rencana lengkap: `rencana-optimasi-trafo.md`.
 */

const TABS = [
  { key: "daftar", label: "Daftar Optimasi", icon: ListChecks },
  { key: "pengaturan", label: "Pengaturan Alasan", icon: Settings2 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function OptimasiTrafoPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const [kunciDetail, setKunciDetail] = useState<string | null>(null);
  const [mengunduh, setMengunduh] = useState(false);
  const o = useOptimasiTrafo(user);
  const oleh = user.name ?? user.email ?? "";

  // Modal membaca dari daftar LENGKAP yang hidup, bukan salinan saat dibuka —
  // sesudah verifikasi statusnya langsung berubah di modal, dan baris yang
  // keluar dari saringan status tidak ikut menutup modalnya.
  // Yang diunduh = yang tampil. exceljs dimuat saat tombol ditekan saja.
  const unduh = async () => {
    setMengunduh(true);
    try {
      const { unduhExcelOptimasi } = await import("./_lib/unduhExcel");
      const periode = o.bulan === 0 ? `${o.tahun}` : `${o.tahun}-${String(o.bulan).padStart(2, "0")}`;
      const unit = o.ulp === "SEMUA" ? "SemuaULP" : o.ulp;
      await unduhExcelOptimasi(o.baris, `Optimasi_Trafo_${unit}_${periode}.xlsx`);
    } finally {
      setMengunduh(false);
    }
  };

  const detail = kunciDetail ? (o.semua.find((b) => b.kunci === kunciDetail) ?? null) : null;

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiKepala>
        <TabPil tab={TABS.map((t) => ({ kunci: t.key, label: t.label, ikon: t.icon }))} aktif={tab} onPilih={setTab} />
      </IsiKepala>

      {tab === "pengaturan" ? (
        <PengaturanAlasan alasan={o.alasan} onSimpan={o.simpanAlasan} />
      ) : (
        <>
          <IsiTopbar>
            <PilihUlp nilai={o.ulp} onUbah={o.setUlp} daftar={o.daftarUlp} />
            <PilihPeriode tahun={o.tahun} bulan={o.bulan} daftarTahun={o.daftarTahun} onTahun={o.setTahun} onBulan={o.setBulan} />
            <KotakCari nilai={o.cari} onUbah={o.setCari} placeholder="Cari gardu, penyulang" lebar="w-[210px]" />
          </IsiTopbar>

          <div className="flex flex-wrap items-center gap-2">
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

          {(o.galat || o.galatWo) && !o.loading && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-semibold text-amber-800">
                  {o.galat ? "Daftar gagal dimuat" : "WO yang belum dikerjakan gagal dimuat"}
                </p>
                <p className="mt-0.5 text-amber-700">
                  {o.galat ?? o.galatWo} —{" "}
                  {o.galat
                    ? "kosongnya tabel di bawah bukan berarti tidak ada pekerjaan."
                    : "tabel di bawah hanya berisi catatan yang sudah terkirim."}
                </p>
                <button onClick={o.muat} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">
                  Muat ulang
                </button>
              </div>
            </div>
          )}

          <CatatanInfo>
            Periode menyaring catatan menurut tanggal pekerjaan. WO yang belum dikerjakan selalu
            tampil, berapa pun umurnya — itu tunggakan.
          </CatatanInfo>

          {!o.galat && (
            <TabelOptimasi baris={o.baris} loading={o.loading} onDetail={(b) => setKunciDetail(b.kunci)} />
          )}
        </>
      )}

      {detail && (
        <DetailOptimasiModal
          b={detail}
          alasan={o.alasan}
          oleh={oleh}
          onTutup={() => setKunciDetail(null)}
          onVerifikasi={o.verifikasi}
          onBatalkan={o.batalkan}
          onKembalikan={o.kembalikan}
          onBatalkanWo={o.batalkanWo}
          onPastikan={o.pastikanJejak}
          onKoreksi={o.koreksi}
          ambilUsulan={o.ambilUsulan}
        />
      )}
    </div>
  );
}
