"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, CheckCheck, ClipboardList, Download, LayoutDashboard, ListChecks, Loader2, Map, Network, SearchCheck, Send, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canManageSettings } from "@/lib/roles";
import { useDaftarJtr, STATUS_JTR } from "./_hooks/useApprovalJtr";
import TabelJtr from "./_components/TabelJtr";
import DetailInspeksiJtrModal from "./_components/DetailInspeksiJtrModal";
import DashboardJtr from "./_components/DashboardJtr";
import PetaJaringan from "./_components/PetaJaringan";
import HasilInspeksi from "./_components/HasilInspeksi";
import JaringanPerGardu from "./_components/JaringanPerGardu";
import JurusanKabelBelumPasti from "./_components/JurusanKabelBelumPasti";
import TiangBaik from "./_components/TiangBaik";
import PengaturanJtr from "./_components/PengaturanJtr";
import TemuanJtr from "./_components/TemuanJtr";
import WoInspeksi from "@/app/admin/_components/WoInspeksi";
import PanduanModul from "@/app/admin/_components/PanduanModul";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import TabPil from "@/app/admin/_kit/TabPil";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import { KotakCari } from "@/app/admin/_kit/Field";
import { PilihPeriode, PilihTahun, PilihUlp } from "@/app/admin/_kit/Saringan";
import ChipSaring from "@/app/admin/_kit/ChipSaring";
import { nadaStatus } from "@/lib/statusUi";
import CatatanInfo from "@/app/admin/_kit/CatatanInfo";

/**
 * Inspeksi JTR — pola Kinerja Pelayanan Teknik (teknisaplikasi.md butir 7):
 * Daftar Inspeksi → Dashboard → Temuan → Susun WO → Peta → Hasil Inspeksi →
 * Jaringan per Gardu → Tiang Baik → Pengaturan. Temuan & Susun WO sepola
 * Inspeksi JTM (J5c `rencana-mobile-jtm-jtr.md`).
 *
 * Persetujuan Gardu bukan tab lagi: jadi chip status di daftar, dan keputusan
 * diambil di modal yang memuat peta jaringan + usulan koreksi dari inspeksi
 * itu. Tab "Usulan Koreksi" DIHAPUS (24 Sep 2026) — isinya antrean semua modul,
 * termasuk usulan Optimasi Trafo dan Pengukuran yang punya tempat keputusan
 * sendiri. Tiap usulan kini diputuskan di modul yang melahirkannya.
 */

const TABS = [
  { key: "daftar", label: "Daftar Inspeksi", icon: ListChecks, setelan: false },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, setelan: false },
  { key: "temuan", label: "Temuan", icon: SearchCheck, setelan: false },
  { key: "wo", label: "Susun WO", icon: Send, setelan: false },
  { key: "peta", label: "Peta", icon: Map, setelan: false },
  { key: "hasil", label: "Hasil Inspeksi", icon: ClipboardList, setelan: false },
  { key: "jaringan", label: "Jaringan per Gardu", icon: Network, setelan: false },
  // Istilah & kapan dipakai — dibaca semua; disunting UP3/admin (sama dengan HP).
  { key: "panduan", label: "Panduan", icon: BookOpen, setelan: false },
  // Dua tab terakhir berlaku untuk SEMUA ULP sekaligus — satu perubahan di sini
  // mengubah formulir tiap regu di lapangan, jadi dibatasi ke pengelola setelan.
  { key: "baik", label: "Tiang Baik", icon: CheckCheck, setelan: true },
  { key: "pengaturan", label: "Pengaturan", icon: SlidersHorizontal, setelan: true },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function JtrPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  // Dibuka dari peta (/admin/jtr?inspeksi=<id>): modal rinciannya langsung terbuka.
  const sp = useSearchParams();
  const [idDetail, setIdDetail] = useState<string | null>(() => sp.get("inspeksi"));
  const [mengunduh, setMengunduh] = useState(false);
  const [cariGardu, setCariGardu] = useState("");
  const o = useDaftarJtr(user);

  const bolehSetel = canManageSettings(user.role);
  const tabTampil = useMemo(() => TABS.filter((t) => !t.setelan || bolehSetel), [bolehSetel]);
  const detail = idDetail ? (o.semua.find((d) => d.id === idDetail) ?? null) : null;
  const oleh = user.name ?? user.email ?? "";
  const berpenyaring = tab === "daftar" || tab === "dashboard" || tab === "jaringan" || tab === "temuan";

  const unduh = async () => {
    setMengunduh(true);
    try {
      const { unduhExcelJtr } = await import("./_lib/unduhExcel");
      const periode = o.bulan === 0 ? `${o.tahun}` : `${o.tahun}-${String(o.bulan).padStart(2, "0")}`;
      await unduhExcelJtr(o.baris, `Inspeksi_JTR_${o.ulp === "SEMUA" ? "SemuaULP" : o.ulp}_${periode}.xlsx`);
    } finally {
      setMengunduh(false);
    }
  };

  return (
    // Tab peta memakai tinggi penuh lewat flex, bukan calc() — tebakan tinggi
    // topbar dan padding meleset di tiap ukuran layar.
    <div className={`text-ink flex flex-col gap-4 ${tab === "peta" ? "h-full" : ""}`}>
      <IsiKepala>
        <TabPil tab={tabTampil.map((t) => ({ kunci: t.key, label: t.label, ikon: t.icon, angka: t.key === "daftar" && !o.loading ? o.hitung["Menunggu persetujuan"] : 0, angkaTunggu: true }))} aktif={tab} onPilih={setTab} />
      </IsiKepala>

      {berpenyaring && (
        <IsiTopbar>
          <PilihUlp nilai={o.ulp} onUbah={o.setUlp} daftar={o.daftarUlp} />
          {tab === "daftar" ? (
            <PilihPeriode tahun={o.tahun} bulan={o.bulan} daftarTahun={o.daftarTahun} onTahun={o.setTahun} onBulan={o.setBulan} />
          ) : tab === "dashboard" && (
            <PilihTahun tahun={o.tahun} daftarTahun={o.daftarTahun} onTahun={o.setTahun} />
          )}
          {tab === "daftar" && (
            <KotakCari nilai={o.cari} onUbah={o.setCari} placeholder="Cari gardu, penyulang, petugas" lebar="w-[230px]" />
          )}
          {tab === "jaringan" && <KotakCari nilai={cariGardu} onUbah={setCariGardu} placeholder="Cari gardu" lebar="w-[200px]" />}
        </IsiTopbar>
      )}

      {tab === "daftar" && (
        <>
          <div className="flex flex-wrap items-center gap-2 -mt-1">
            <ChipSaring
              item={[
                { kunci: "SEMUA" as const, label: "Semua" },
                ...STATUS_JTR.map((s) => ({ kunci: s, label: s, angka: o.loading ? null : o.hitung[s], nada: nadaStatus(s) })),
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
          <CatatanInfo>
            Inspeksi yang masih berjalan selalu tampil. Periode menyaring yang sudah disetujui (menurut tanggal
            selesai) dan yang dibatalkan.
          </CatatanInfo>
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
            <TabelJtr baris={o.baris} loading={o.loading} onDetail={(d) => setIdDetail(d.id)} />
          )}
        </>
      )}

      {tab === "temuan" && <TemuanJtr key={o.ulp} ulp={o.ulp} oleh={oleh} />}
      {tab === "wo" && <WoInspeksi user={user} jenis="JTR" />}
      {tab === "dashboard" && <DashboardJtr key={`${o.ulp}-${o.tahun}`} user={user} ulp={o.ulp} tahun={o.tahun} />}
      {tab === "peta" && (
        <div className="flex-1 min-h-0">
          <PetaJaringan user={user} />
        </div>
      )}
      {tab === "hasil" && <HasilInspeksi user={user} />}
      {tab === "jaringan" && (
        <>
          <JurusanKabelBelumPasti
            key={`jk-${o.ulp}`}
            ulp={o.ulp === "SEMUA" ? null : o.ulp}
            oleh={oleh}
            boleh={user.role === "UP3" || user.role === "admin"}
          />
          <JaringanPerGardu key={o.ulp} ulp={o.ulp} cari={cariGardu} />
        </>
      )}
      {tab === "baik" && bolehSetel && <TiangBaik />}
      {tab === "pengaturan" && bolehSetel && <PengaturanJtr />}
      {tab === "panduan" && <PanduanModul modul="jtr" oleh={oleh} bolehUbah={bolehSetel} />}

      {detail && (
        <DetailInspeksiJtrModal
          key={detail.id}
          d={detail}
          memproses={o.memproses}
          oleh={oleh}
          onTutup={() => setIdDetail(null)}
          putuskan={o.putuskan}
          batalkan={o.batalkan}
        />
      )}
    </div>
  );
}
