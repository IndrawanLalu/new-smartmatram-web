"use client";

import { useMemo, useState } from "react";
import {
  CheckCheck, ClipboardList, Download, LayoutDashboard, ListChecks, Loader2, Map, Network, Search,
  SearchCheck, Send, SlidersHorizontal, TriangleAlert,
} from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canManageSettings } from "@/lib/roles";
import { CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { useDaftarJtr, BULAN, STATUS_JTR } from "./_hooks/useApprovalJtr";
import TabelJtr from "./_components/TabelJtr";
import DetailInspeksiJtrModal from "./_components/DetailInspeksiJtrModal";
import DashboardJtr from "./_components/DashboardJtr";
import PetaJaringan from "./_components/PetaJaringan";
import HasilInspeksi from "./_components/HasilInspeksi";
import JaringanPerGardu from "./_components/JaringanPerGardu";
import TiangBaik from "./_components/TiangBaik";
import PengaturanJtr from "./_components/PengaturanJtr";
import TemuanJtr from "./_components/TemuanJtr";
import WoInspeksi from "@/app/admin/_components/WoInspeksi";

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
  // Dua tab terakhir berlaku untuk SEMUA ULP sekaligus — satu perubahan di sini
  // mengubah formulir tiap regu di lapangan, jadi dibatasi ke pengelola setelan.
  { key: "baik", label: "Tiang Baik", icon: CheckCheck, setelan: true },
  { key: "pengaturan", label: "Pengaturan", icon: SlidersHorizontal, setelan: true },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function JtrPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const [idDetail, setIdDetail] = useState<string | null>(null);
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
      <div className="flex flex-wrap gap-2 shrink-0">
        {tabTampil.map(({ key, label, icon: Icon }) => (
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
          {(tab === "daftar" || tab === "dashboard") && (
            <select value={o.tahun} onChange={(e) => o.setTahun(Number(e.target.value))} className={`${FIELD} w-[100px]`} aria-label="Tahun">
              {o.daftarTahun.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {(tab === "daftar" || tab === "jaringan") && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              {tab === "daftar" ? (
                <input
                  value={o.cari}
                  onChange={(e) => o.setCari(e.target.value)}
                  placeholder="Cari gardu / penyulang / petugas"
                  className={`${FIELD} w-[250px] pl-8`}
                />
              ) : (
                <input
                  value={cariGardu}
                  onChange={(e) => setCariGardu(e.target.value)}
                  placeholder="Cari gardu"
                  className={`${FIELD} w-[200px] pl-8`}
                />
              )}
            </div>
          )}
        </div>
      )}

      {tab === "daftar" && (
        <>
          <div className="flex flex-wrap items-center gap-2 -mt-1">
            <button onClick={() => o.setStatus("SEMUA")} className={`${CHIP} ${o.status === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>Semua</button>
            {STATUS_JTR.map((s) => (
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
      {tab === "jaringan" && <JaringanPerGardu key={o.ulp} ulp={o.ulp} cari={cariGardu} />}
      {tab === "baik" && bolehSetel && <TiangBaik />}
      {tab === "pengaturan" && bolehSetel && <PengaturanJtr />}

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
