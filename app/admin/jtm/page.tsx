"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCheck, Download, LayoutDashboard, ListChecks, Loader2, Map, Network, SearchCheck, Send, SlidersHorizontal, TowerControl, TriangleAlert, Upload } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useDaftarJtm } from "./_hooks/useDaftarJtm";
import { STATUS_JTM } from "./_lib/tampilan";
import TabelJtm from "./_components/TabelJtm";
import DetailInspeksiJtmModal from "./_components/DetailInspeksiJtmModal";
import DashboardJtm from "./_components/DashboardJtm";
import TemuanJtm from "./_components/TemuanJtm";
import DaftarSegmen from "./_components/DaftarSegmen";
import PetaJtm from "./_components/PetaJtm";
import ImporTiang from "./_components/ImporTiang";
import PengaturanJtm from "./_components/PengaturanJtm";
import TiangNormal from "./_components/TiangNormal";
import DaftarTiang from "./_components/DaftarTiang";
import WoInspeksi from "@/app/admin/_components/WoInspeksi";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import TabPil from "@/app/admin/_kit/TabPil";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import { KotakCari } from "@/app/admin/_kit/Field";
import { PilihPeriode, PilihTahun, PilihUlp } from "@/app/admin/_kit/Saringan";
import ChipSaring from "@/app/admin/_kit/ChipSaring";
import { nadaStatus } from "@/lib/statusUi";
import CatatanInfo from "@/app/admin/_kit/CatatanInfo";

/**
 * Inspeksi JTM — pola Kinerja Pelayanan Teknik (teknisaplikasi.md butir 7):
 * Daftar Inspeksi → Dashboard → Temuan → Susun WO → Peta → Segmen → Tiang → Impor Tiang →
 * Tiang Normal → Pengaturan. Persetujuan bukan tab: jadi chip status di
 * daftar, keputusan diambil di modal.
 */

const TABS = [
  { key: "daftar", label: "Daftar Inspeksi", icon: ListChecks },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "temuan", label: "Temuan", icon: SearchCheck },
  { key: "wo", label: "Susun WO", icon: Send },
  { key: "peta", label: "Peta", icon: Map },
  { key: "segmen", label: "Segmen", icon: Network },
  { key: "tiang", label: "Tiang", icon: TowerControl },
  { key: "impor", label: "Impor Tiang", icon: Upload },
  { key: "normal", label: "Tiang Normal", icon: CheckCheck },
  { key: "pengaturan", label: "Pengaturan", icon: SlidersHorizontal },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function JtmPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  // Dibuka dari peta (/admin/jtm?inspeksi=<id>): modal rinciannya langsung terbuka.
  const sp = useSearchParams();
  const [idDetail, setIdDetail] = useState<string | null>(() => sp.get("inspeksi"));
  const [mengunduh, setMengunduh] = useState(false);
  const o = useDaftarJtm(user);

  const detail = idDetail ? (o.semua.find((d) => d.id === idDetail) ?? null) : null;
  const berpenyaring = tab === "daftar" || tab === "dashboard" || tab === "temuan";

  const unduh = async () => {
    setMengunduh(true);
    try {
      const { unduhExcelJtm } = await import("./_lib/unduhExcel");
      const periode = o.bulan === 0 ? `${o.tahun}` : `${o.tahun}-${String(o.bulan).padStart(2, "0")}`;
      await unduhExcelJtm(o.baris, `Inspeksi_JTM_${o.ulp === "SEMUA" ? "SemuaULP" : o.ulp}_${periode}.xlsx`);
    } finally {
      setMengunduh(false);
    }
  };

  return (
    // Tab peta memakai tinggi penuh lewat flex, bukan calc() — tebakan tinggi
    // topbar dan bilah saring meleset di tiap ukuran layar.
    <div className={`text-ink flex flex-col gap-4 ${tab === "peta" ? "h-full" : ""}`}>
      <IsiKepala>
        <TabPil tab={TABS.map((t) => ({ kunci: t.key, label: t.label, ikon: t.icon, angka: t.key === "daftar" && !o.loading ? o.hitung["Menunggu persetujuan"] : 0, angkaTunggu: true }))} aktif={tab} onPilih={setTab} />
      </IsiKepala>

      {berpenyaring && (
        <IsiTopbar>
          <PilihUlp nilai={o.ulp} onUbah={o.setUlp} daftar={o.daftarUlp} />
          {tab === "daftar" ? (
            <PilihPeriode tahun={o.tahun} bulan={o.bulan} daftarTahun={o.daftarTahun} onTahun={o.setTahun} onBulan={o.setBulan} />
          ) : tab !== "temuan" && (
            <PilihTahun tahun={o.tahun} daftarTahun={o.daftarTahun} onTahun={o.setTahun} />
          )}
          {tab === "daftar" && (
            <KotakCari nilai={o.cari} onUbah={o.setCari} placeholder="Cari segmen, penyulang, regu" lebar="w-[230px]" />
          )}
        </IsiTopbar>
      )}

      {tab === "daftar" && (
        <>
          <div className="flex flex-wrap items-center gap-2 -mt-1">
            <ChipSaring
              item={[
                { kunci: "SEMUA" as const, label: "Semua" },
                ...STATUS_JTM.map((s) => ({ kunci: s, label: s, angka: o.loading ? null : o.hitung[s], nada: nadaStatus(s) })),
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
            <TabelJtm baris={o.baris} loading={o.loading} onDetail={(d) => setIdDetail(d.id)} />
          )}
        </>
      )}

      {tab === "dashboard" && <DashboardJtm key={`${o.ulp}-${o.tahun}`} ulp={o.ulp} tahun={o.tahun} />}
      {tab === "temuan" && <TemuanJtm key={o.ulp} ulp={o.ulp} oleh={user.name || user.email || ""} />}
      {tab === "wo" && <WoInspeksi user={user} jenis="JTM" />}
      {tab === "peta" && (
        <div className="flex-1 min-h-0">
          <PetaJtm user={user} />
        </div>
      )}
      {tab === "segmen" && <DaftarSegmen user={user} />}
      {tab === "tiang" && <DaftarTiang user={user} />}
      {tab === "impor" && <ImporTiang user={user} />}
      {tab === "normal" && <TiangNormal />}
      {tab === "pengaturan" && <PengaturanJtm />}

      {detail && (
        <DetailInspeksiJtmModal
          key={detail.id}
          d={detail}
          memproses={o.memproses}
          onTutup={() => setIdDetail(null)}
          putuskan={o.putuskan}
          batalkan={o.batalkan}
          pratinjauBatalSegmen={o.pratinjauBatalSegmen}
          batalkanSegmen={o.batalkanSegmen}
          buang={o.buang}
          gabung={o.gabung}
          ubahTitikSegmen={o.ubahTitikSegmen}
          tutupSegmen={o.tutupSegmen}
        />
      )}
    </div>
  );
}
