"use client";

import { useState } from "react";
import {
  CheckCheck, Download, LayoutDashboard, ListChecks, Loader2, Map, Network, Search, SearchCheck,
  Send, SlidersHorizontal, TowerControl, TriangleAlert, Upload,
} from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { useDaftarJtm } from "./_hooks/useDaftarJtm";
import { BULAN, STATUS_JTM } from "./_lib/tampilan";
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
import WoInspeksiJtm from "./_components/WoInspeksiJtm";

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
  const [idDetail, setIdDetail] = useState<string | null>(null);
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
      <div className="flex flex-wrap gap-2 shrink-0">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`${CHIP} ${tab === key ? CHIP_ON : CHIP_OFF}`}>
            <Icon size={14} />
            {label}
            {key === "daftar" && !o.loading && o.hitung["Menunggu persetujuan"] > 0 && (
              <span className={`tabular-nums text-[10px] px-1.5 rounded-full ${tab === key ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>
                {o.hitung["Menunggu persetujuan"]}
              </span>
            )}
          </button>
        ))}
      </div>

      {berpenyaring && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={o.ulp}
            onChange={(e) => o.setUlp(e.target.value)}
            className={`${FIELD} w-[170px]`}
            disabled={o.daftarUlp.length <= 1}
            aria-label="ULP"
          >
            {o.daftarUlp.map((u) => <option key={u} value={u}>{u === "SEMUA" ? "Semua ULP" : u}</option>)}
          </select>
          {tab === "daftar" && (
            <select value={o.bulan} onChange={(e) => o.setBulan(Number(e.target.value))} className={`${FIELD} w-[160px]`} aria-label="Bulan">
              <option value={0}>Sepanjang tahun</option>
              {BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
            </select>
          )}
          {tab !== "temuan" && (
            <select value={o.tahun} onChange={(e) => o.setTahun(Number(e.target.value))} className={`${FIELD} w-[100px]`} aria-label="Tahun">
              {o.daftarTahun.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {tab === "daftar" && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                value={o.cari}
                onChange={(e) => o.setCari(e.target.value)}
                placeholder="Cari segmen / penyulang / regu"
                className={`${FIELD} w-[250px] pl-8`}
              />
            </div>
          )}
        </div>
      )}

      {tab === "daftar" && (
        <>
          <div className="flex flex-wrap items-center gap-2 -mt-1">
            <button onClick={() => o.setStatus("SEMUA")} className={`${CHIP} ${o.status === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>Semua</button>
            {STATUS_JTM.map((s) => (
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
          <p className="text-[11px] text-ink-muted -mt-2">
            Inspeksi yang masih berjalan selalu tampil. Periode menyaring yang sudah disetujui (menurut tanggal
            selesai) dan yang dibatalkan.
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
            <TabelJtm baris={o.baris} loading={o.loading} onDetail={(d) => setIdDetail(d.id)} />
          )}
        </>
      )}

      {tab === "dashboard" && <DashboardJtm key={`${o.ulp}-${o.tahun}`} ulp={o.ulp} tahun={o.tahun} />}
      {tab === "temuan" && <TemuanJtm key={o.ulp} ulp={o.ulp} oleh={user.name || user.email || ""} />}
      {tab === "wo" && <WoInspeksiJtm user={user} />}
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
          buang={o.buang}
          gabung={o.gabung}
        />
      )}
    </div>
  );
}
