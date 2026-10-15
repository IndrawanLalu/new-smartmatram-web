"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Download, LayoutDashboard, ListChecks, Loader2, SlidersHorizontal, TriangleAlert, Wrench } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CHIP, CHIP_OFF, CHIP_ON } from "@/app/admin/_ui";
import { useHargarduApproval, STATUS_HARGARDU } from "./_hooks/useHargarduApproval";
import TabelHargardu from "./_components/TabelHargardu";
import DetailPemeliharaanModal from "./_components/DetailPemeliharaanModal";
import DashboardHargardu from "./_components/DashboardHargardu";
import PerluPerbaikan from "./_components/PerluPerbaikan";
import PengaturanItem from "./_components/PengaturanItem";
import WoPemeliharaan from "./_components/WoPemeliharaan";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import TabPil from "@/app/admin/_kit/TabPil";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import { KotakCari } from "@/app/admin/_kit/Field";
import { PilihPeriode, PilihTahun, PilihUlp } from "@/app/admin/_kit/Saringan";

/**
 * Pemeliharaan Gardu — pola Kinerja Pelayanan Teknik (teknisaplikasi.md
 * butir 7): Daftar → Dashboard → Perlu Perbaikan → WO Pemeliharaan → Pengaturan. Persetujuan
 * bukan tab lagi, melainkan chip status di daftar; keputusannya di modal.
 */

const TABS = [
  { key: "daftar", label: "Daftar Pemeliharaan", icon: ListChecks, hanyaUp3: false },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, hanyaUp3: false },
  { key: "perbaikan", label: "Perlu Perbaikan", icon: Wrench, hanyaUp3: false },
  { key: "wo", label: "WO Pemeliharaan", icon: CalendarClock, hanyaUp3: false },
  // Daftar isian berlaku untuk SEMUA ULP, jadi penanya cuma satu. ULP mengisi,
  // tidak bisa mengarang — kalau tiap unit menyusun kosakatanya sendiri, angka
  // se-UP3 tidak bisa dijumlahkan lagi.
  { key: "pengaturan", label: "Pengaturan", icon: SlidersHorizontal, hanyaUp3: true },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function HargarduPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const [idDetail, setIdDetail] = useState<string | null>(null);
  const [mengunduh, setMengunduh] = useState(false);
  const o = useHargarduApproval(user);

  const up3 = user.role === "UP3";
  const tabs = useMemo(() => TABS.filter((t) => !t.hanyaUp3 || up3), [up3]);
  const detail = idDetail ? (o.semua.find((d) => d.id === idDetail) ?? null) : null;
  const mencari = o.cari.trim().length > 0;

  const unduh = async () => {
    setMengunduh(true);
    try {
      const { unduhExcelHargardu } = await import("./_lib/unduhExcel");
      const periode = mencari ? "pencarian" : o.bulan === 0 ? `${o.tahun}` : `${o.tahun}-${String(o.bulan).padStart(2, "0")}`;
      await unduhExcelHargardu(o.baris, `Pemeliharaan_Gardu_${o.ulp === "SEMUA" ? "SemuaULP" : o.ulp}_${periode}.xlsx`);
    } finally {
      setMengunduh(false);
    }
  };

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiKepala>
        <TabPil tab={tabs.map((t) => ({ kunci: t.key, label: t.label, ikon: t.icon, angka: t.key === "daftar" && !o.loading ? o.hitung["Menunggu persetujuan"] : 0, angkaTunggu: true }))} aktif={tab} onPilih={setTab} />
      </IsiKepala>

      {tab === "perbaikan" && <PerluPerbaikan user={user} />}
      {tab === "pengaturan" && up3 && <PengaturanItem user={user} />}
      {tab === "wo" && (
        <>
          <IsiTopbar>
            <PilihUlp nilai={o.ulp} onUbah={o.setUlp} daftar={o.daftarUlp} />
          </IsiTopbar>
          <WoPemeliharaan user={user} ulp={o.ulp} daftarUlp={o.daftarUlp} />
        </>
      )}

      {(tab === "daftar" || tab === "dashboard") && (
        <>
          {/* Pencarian gardu menelusuri seluruh riwayat — periode dimatikan
              selama ada kata cari supaya tidak dikira ikut membatasi. */}
          <IsiTopbar>
            <PilihUlp nilai={o.ulp} onUbah={o.setUlp} daftar={o.daftarUlp} />
            {tab === "daftar" ? (
              <PilihPeriode tahun={o.tahun} bulan={o.bulan} daftarTahun={o.daftarTahun} onTahun={o.setTahun} onBulan={o.setBulan} disabled={mencari} />
            ) : (
              <PilihTahun tahun={o.tahun} daftarTahun={o.daftarTahun} onTahun={o.setTahun} />
            )}
            {tab === "daftar" && (
              <KotakCari nilai={o.cari} onUbah={o.setCari} placeholder="Cari kode / nama gardu — seluruh riwayat" lebar="w-[260px]" />
            )}
          </IsiTopbar>

          {tab === "dashboard" ? (
            // key: ganti ULP/tahun = pasang ulang, jadi "memuat" tidak menampilkan angka lama.
            <DashboardHargardu key={`${o.ulp}-${o.tahun}`} user={user} ulp={o.ulp} tahun={o.tahun} />
          ) : (
          <>

          <div className="flex flex-wrap items-center gap-2 -mt-1">
            <button onClick={() => o.setStatus("SEMUA")} className={`${CHIP} ${o.status === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>Semua</button>
            {STATUS_HARGARDU.map((s) => (
              <button key={s} onClick={() => o.setStatus(s)} className={`${CHIP} ${o.status === s ? CHIP_ON : CHIP_OFF}`}>
                {s} <span className="opacity-70">{o.loading ? "" : o.hitung[s]}</span>
              </button>
            ))}
            {/* Usulan koreksi master (titik gardu / nama plat) yang menunggu —
                termasuk pekerjaan lama yang sudah disetujui. */}
            {!o.loading && o.jumlahUsulan > 0 && (
              <button
                onClick={() => o.setStatus("USULAN")}
                className={`${CHIP} ${o.status === "USULAN" ? CHIP_ON : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"}`}
              >
                Usulan master menunggu <span className="opacity-70">{o.jumlahUsulan}</span>
              </button>
            )}
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
          <p className="text-[11px] text-ink-muted -mt-2">
            {mencari
              ? "Pencarian gardu menelusuri seluruh riwayat, tidak dibatasi periode."
              : "Pemeliharaan yang masih berjalan selalu tampil. Periode menyaring yang sudah disetujui atau dibatalkan."}
          </p>

          {o.galat && !o.loading ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-semibold text-amber-800">Daftar gagal dimuat</p>
                <p className="mt-0.5 text-amber-700">{o.galat} — kosongnya tabel bukan berarti tidak ada pekerjaan.</p>
                <button onClick={o.muat} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">Muat ulang</button>
              </div>
            </div>
          ) : (
            <TabelHargardu baris={o.baris} loading={o.loading} onDetail={(d) => setIdDetail(d.id)} />
          )}
          </>
          )}
        </>
      )}

      {detail && (
        <DetailPemeliharaanModal
          key={detail.id}
          d={detail}
          memproses={o.memproses}
          onTutup={() => setIdDetail(null)}
          putuskan={o.putuskan}
          batalkan={o.batalkan}
          putuskanUsulan={o.putuskanUsulan}
        />
      )}
    </div>
  );
}
