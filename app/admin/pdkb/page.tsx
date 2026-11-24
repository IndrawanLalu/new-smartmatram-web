"use client";

import { useState } from "react";
import { CalendarCheck, ClipboardList, ClipboardPlus, Hourglass, LayoutDashboard, ListChecks, TriangleAlert } from "lucide-react";
import { hariIniWita } from "@/app/admin/_components/KepalaUrut";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CHIP, CHIP_OFF, CHIP_ON } from "@/app/admin/_ui";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import TabPil from "@/app/admin/_kit/TabPil";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import { KotakCari } from "@/app/admin/_kit/Field";
import { PilihPeriode, PilihTahun, PilihUlp } from "@/app/admin/_kit/Saringan";
import { JENIS_PDKB, STATUS_PDKB, usePdkb } from "./_hooks/usePdkb";
import { useTugasPdkb, type TugasPdkb as Tugas } from "./_hooks/useTugasPdkb";
import TabelPdkb from "./_components/TabelPdkb";
import DetailPdkbModal from "./_components/DetailPdkbModal";
import CatatPdkbModal from "./_components/CatatPdkbModal";
import TugasPdkb from "./_components/TugasPdkb";
import DashboardPdkb from "./_components/DashboardPdkb";

/**
 * PDKB (24 Nov 2026, scripts/pdkb.sql) — web saja dulu.
 * Daftar pekerjaan → Dashboard → Belum selesai → Temuan ditugaskan (teknisaplikasi.md butir 7).
 * Pekerjaan dicatat ADMIN di tabel sendiri, tidak dihitung realisasi
 * Pemeliharaan Jaringan; temuan JTM/JTR/gardu yang ditugaskan ke PDKB muncul
 * di tab Temuan ditugaskan, dan "Catat hasil" menutup tugasnya.
 */

const TABS = [
  { key: "daftar", label: "Daftar Pekerjaan", icon: ListChecks },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "hari", label: "Hari ini", icon: CalendarCheck },
  { key: "belum", label: "Belum Selesai", icon: Hourglass },
  { key: "tugas", label: "Temuan Ditugaskan", icon: ClipboardList },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function PdkbPage() {
  const user = useCurrentUser();
  const oleh = user.name ?? user.email ?? "";
  const [tab, setTab] = useState<TabKey>("daftar");
  const [idDetail, setIdDetail] = useState<string | null>(null);
  /** null = tertutup; "lepas" = pekerjaan di luar tugas; selain itu tugasnya. */
  const [catat, setCatat] = useState<Tugas | "lepas" | null>(null);
  const o = usePdkb(user);
  const t = useTugasPdkb(o.ulp, o.tahun, o.bulan);

  const detail = idDetail ? (o.semua.find((b) => b.id === idDetail) ?? null) : null;
  const daftar = tab === "daftar";
  // Hari ini = bulan berjalan (lihat Pemeliharaan Jaringan): daftar hidup yang sama.
  const pilihTab = (k: TabKey) => {
    if (k === "hari") {
      const n = new Date();
      if (o.tahun !== n.getFullYear()) o.setTahun(n.getFullYear());
      if (o.bulan !== n.getMonth() + 1) o.setBulan(n.getMonth() + 1);
    }
    setTab(k);
  };
  const hariIni = hariIniWita();
  const pekerjaanHariIni = o.semua.filter((b) => b.tgl === hariIni && b.status !== "Dibatalkan");

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiKepala>
        <TabPil tab={TABS.map((x) => ({ kunci: x.key, label: x.label, ikon: x.icon }))} aktif={tab} onPilih={pilihTab} />
      </IsiKepala>

      <IsiTopbar>
        <PilihUlp nilai={o.ulp} onUbah={o.setUlp} daftar={o.daftarUlp} />
        {/* Belum Selesai = semua bulan; penyaring periode disembunyikan supaya tidak dikira berlaku. */}
        {tab === "belum" || tab === "hari" ? null : tab === "dashboard" ? (
          <PilihTahun tahun={o.tahun} daftarTahun={o.daftarTahun} onTahun={o.setTahun} />
        ) : (
          <PilihPeriode tahun={o.tahun} bulan={o.bulan} daftarTahun={o.daftarTahun} onTahun={o.setTahun} onBulan={o.setBulan} />
        )}
        {daftar && <KotakCari nilai={o.cari} onUbah={o.setCari} placeholder="Cari penyulang, gardu, pekerjaan, tim" lebar="w-[240px]" />}
      </IsiTopbar>

      {daftar && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => o.setJenis("SEMUA")} className={`${CHIP} ${o.jenis === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>Semua jenis</button>
          {JENIS_PDKB.map((j) => (
            <button key={j} onClick={() => o.setJenis(j)} className={`${CHIP} ${o.jenis === j ? CHIP_ON : CHIP_OFF}`}>
              {j === "GARDU" ? "Gardu" : j}
            </button>
          ))}
          <span className="w-px h-5 bg-line mx-1" />
          <button onClick={() => o.setStatus("SEMUA")} className={`${CHIP} ${o.status === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>Semua status</button>
          {STATUS_PDKB.map((s) => (
            <button key={s} onClick={() => o.setStatus(s)} className={`${CHIP} ${o.status === s ? CHIP_ON : CHIP_OFF}`}>
              {s} <span className="opacity-70">{o.loading ? "" : o.hitung[s]}</span>
            </button>
          ))}
          <button
            onClick={() => setCatat("lepas")}
            className="ml-auto inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 text-white text-[13px] font-semibold shadow-sm hover:bg-brand-700 transition-colors"
          >
            <ClipboardPlus size={13} /> Catat pekerjaan PDKB
          </button>
        </div>
      )}

      {tab === "hari" ? (
        <>
          <p className="text-sm font-semibold text-ink">Tugas hari ini</p>
          <TugasPdkb key="hari" o={t} onCatat={setCatat} hariIni />
          <p className="text-sm font-semibold text-ink mt-2">Pekerjaan dikerjakan hari ini</p>
          <TabelPdkb baris={pekerjaanHariIni} loading={o.loading} onDetail={(b) => setIdDetail(b.id)} />
        </>
      ) : tab === "tugas" || tab === "belum" ? (
        <TugasPdkb key={tab} o={t} onCatat={setCatat} hanyaBelum={tab === "belum"} />
      ) : tab === "dashboard" ? (
        <DashboardPdkb key={`${o.ulp}-${o.tahun}`} ulp={o.ulp} tahun={o.tahun} />
      ) : o.galat && !o.loading ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">Daftar gagal dimuat</p>
            <p className="mt-0.5 text-amber-700">{o.galat} — kosongnya tabel bukan berarti tidak ada pekerjaan.</p>
            <button onClick={o.muat} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">Muat ulang</button>
          </div>
        </div>
      ) : (
        <TabelPdkb baris={o.baris} loading={o.loading} onDetail={(b) => setIdDetail(b.id)} />
      )}

      {catat && (
        <CatatPdkbModal
          ulp={o.ulp}
          kategori={o.kategori}
          tugas={catat === "lepas" ? null : catat}
          onTutup={() => setCatat(null)}
          onSimpan={async (v) => {
            await o.simpan(v, oleh);
            if (v.inspeksiId && v.tugasTabel) await t.segarkanSatu(v.inspeksiId, v.tugasTabel);
          }}
        />
      )}

      {detail && (
        <DetailPdkbModal
          b={detail}
          oleh={oleh}
          onTutup={() => setIdDetail(null)}
          kategori={o.kategori}
          onKoreksi={o.koreksi}
          onBatalkan={async (id, alasan, nama) => {
            await o.batalkan(id, alasan, nama);
            if (detail.inspeksiId) await t.segarkanSatu(detail.inspeksiId, detail.tugasTabel ?? "inspeksi");
          }}
        />
      )}
    </div>
  );
}
