"use client";

import { useState } from "react";
import { ClipboardList, Download, ListChecks, Loader2, Settings2, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useToast } from "@/app/admin/_components/Toast";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import TabPil from "@/app/admin/_kit/TabPil";
import ChipSaring from "@/app/admin/_kit/ChipSaring";
import { KotakCari } from "@/app/admin/_kit/Field";
import { PilihPeriode, PilihUlp } from "@/app/admin/_kit/Saringan";
import { CHIP, CHIP_OFF, CHIP_ON } from "@/app/admin/_ui";
import { nadaStatus } from "@/lib/statusUi";
import { useInspeksiGardu, STATUS_TAMPIL, type TierGardu } from "./_hooks/useInspeksiGardu";
import TabelInspeksiGardu from "./_components/TabelInspeksiGardu";
import DetailInspeksiGardu from "./_components/DetailInspeksiGardu";
import WoIgardu from "./_components/WoIgardu";
import PengaturanKategoriIgardu from "./_components/PengaturanKategoriIgardu";
import PengaturanIsianIgardu from "./_components/PengaturanIsianIgardu";
import { useIsianIgardu } from "./_hooks/useIsianIgardu";
import JamTier2 from "@/app/admin/_components/JamTier2";

/**
 * Inspeksi Gardu Tier 1 / Tier 2 (rencana-wo-gardu-dan-inspeksi-gardu.md, G2).
 *
 * Regu mencatat dari HP, di radius gardu. Tier 1: isian lengkap per bagian
 * (inspeksi-gardu-isian.sql) — pilihan tidak normal jadi temuan — + temuan
 * lain. Tier 2: temuan (kategori, uraian, Urgent/Rawan/Biasa, foto, suhu).
 * Temuan masuk Perlu Perbaikan Pemeliharaan Gardu. Web: periksa, WO, kategori.
 */

const TABS = [
  { key: "daftar", label: "Daftar Inspeksi", icon: ListChecks },
  { key: "wo", label: "WO Inspeksi", icon: ClipboardList },
  { key: "pengaturan", label: "Pengaturan Kategori", icon: Settings2 },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const TIER: ("SEMUA" | TierGardu)[] = ["SEMUA", "1", "2"];

export default function InspeksiGarduPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const [idDetail, setIdDetail] = useState<string | null>(null);
  const o = useInspeksiGardu(user);
  const isian = useIsianIgardu();
  // 11 Nov: Pengaturan Inspeksi Gardu UP3 saja — seragam semua ULP.
  const bolehUbah = user.role === "UP3";
  const [mengunduh, setMengunduh] = useState(false);
  const toast = useToast();
  const oleh = user.name ?? user.email ?? "";
  // Modal membaca dari daftar hidup: status berubah langsung sesudah aksi.
  const detail = idDetail ? (o.semua.find((b) => b.id === idDetail) ?? null) : null;

  const unduh = async () => {
    setMengunduh(true);
    try {
      const { unduhExcelIgardu } = await import("./_lib/unduhExcel");
      const periode = o.bulan === 0 ? `${o.tahun}` : `${o.tahun}-${String(o.bulan).padStart(2, "0")}`;
      await unduhExcelIgardu(o.baris, isian.item, o.kategori, `Inspeksi_Gardu_${o.ulp === "SEMUA" ? "SemuaULP" : o.ulp}_${periode}.xlsx`);
    } catch (e) {
      toast.error(`Gagal mengunduh: ${(e as Error).message}`);
    } finally {
      setMengunduh(false);
    }
  };

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiKepala>
        <TabPil tab={TABS.map((t) => ({ kunci: t.key, label: t.label, ikon: t.icon, angka: t.key === "daftar" && !o.loading ? o.hitung["Menunggu persetujuan"] : undefined, angkaTunggu: true }))}
          aktif={tab} onPilih={setTab} />
      </IsiKepala>

      {tab === "wo" && <WoIgardu user={user} />}

      {tab === "pengaturan" && (
        <>
          <JamTier2 />
          <PengaturanIsianIgardu o={isian} oleh={oleh} bolehUbah={bolehUbah} bolehSakelar={bolehUbah} />
          {/* Kategori penampung temuan isian ('isian') tidak untuk disunting. */}
          <PengaturanKategoriIgardu kategori={o.kategori.filter((k) => k.kode !== "isian")} oleh={oleh} onSimpan={o.simpanKategori}
            bolehUbah={bolehUbah} />
        </>
      )}

      {tab === "daftar" && (
        <>
          <IsiTopbar>
            <PilihUlp nilai={o.ulp} onUbah={o.setUlp} daftar={o.daftarUlp} />
            <PilihPeriode tahun={o.tahun} bulan={o.bulan} daftarTahun={o.daftarTahun} onTahun={o.setTahun} onBulan={o.setBulan} />
            <KotakCari nilai={o.cari} onUbah={o.setCari} placeholder="Cari gardu, penyulang, petugas" lebar="w-[240px]" />
          </IsiTopbar>
          <div className="flex flex-wrap items-center gap-2">
            {TIER.map((t) => (
              <button key={t} onClick={() => o.setTier(t)} className={`${CHIP} ${o.tier === t ? CHIP_ON : CHIP_OFF}`}>
                {t === "SEMUA" ? "Tier 1 & 2" : `Tier ${t}`}
              </button>
            ))}
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
          <ChipSaring
            item={[
              { kunci: "SEMUA" as const, label: "Semua" },
              ...STATUS_TAMPIL.map((s) => ({ kunci: s, label: s, angka: o.loading ? null : o.hitung[s], nada: nadaStatus(s) })),
            ]}
            aktif={o.status}
            onPilih={o.setStatus}
          />
          {o.galat && !o.loading ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-semibold text-amber-800">Daftar gagal dimuat</p>
                <p className="mt-0.5 text-amber-700">{o.galat} — kosongnya tabel bukan berarti tidak ada inspeksi.</p>
                <button onClick={o.muat} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">Muat ulang</button>
              </div>
            </div>
          ) : (
            <TabelInspeksiGardu key={`${o.ulp}-${o.tahun}-${o.bulan}-${o.tier}-${o.status}-${o.cari}`} baris={o.baris} loading={o.loading} onDetail={(b) => setIdDetail(b.id)} />
          )}
        </>
      )}

      {detail && (
        <DetailInspeksiGardu
          b={detail}
          oleh={oleh}
          temuanDari={o.temuanDari}
          katalog={isian.item}
          jawabanDari={isian.jawabanDari}
          onTutup={() => setIdDetail(null)}
          onVerifikasi={o.verifikasi}
          onKembalikan={o.kembalikan}
          onBatalkan={o.batalkan}
          onSelesaikanTemuan={o.selesaikanTemuan}
        />
      )}
    </div>
  );
}
