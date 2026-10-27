"use client";

import { useState } from "react";
import { ClipboardList, ListChecks, Settings2, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import TabPil from "@/app/admin/_kit/TabPil";
import ChipSaring from "@/app/admin/_kit/ChipSaring";
import { KotakCari } from "@/app/admin/_kit/Field";
import { PilihPeriode, PilihUlp } from "@/app/admin/_kit/Saringan";
import { CHIP, CHIP_OFF, CHIP_ON } from "@/app/admin/_ui";
import { canSeeAllUnits } from "@/lib/roles";
import { nadaStatus } from "@/lib/statusUi";
import { useInspeksiGardu, STATUS_TAMPIL, type TierGardu } from "./_hooks/useInspeksiGardu";
import TabelInspeksiGardu from "./_components/TabelInspeksiGardu";
import DetailInspeksiGardu from "./_components/DetailInspeksiGardu";
import WoIgardu from "./_components/WoIgardu";
import PengaturanKategoriIgardu from "./_components/PengaturanKategoriIgardu";

/**
 * Inspeksi Gardu Tier 1 / Tier 2 (rencana-wo-gardu-dan-inspeksi-gardu.md, G2).
 *
 * Regu mencatat dari HP, di radius gardu: "tidak ada temuan" + foto gardu,
 * atau temuan (kategori, uraian, Urgent/Rawan/Biasa, foto; Tier 2 + suhu).
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
  const oleh = user.name ?? user.email ?? "";
  // Modal membaca dari daftar hidup: status berubah langsung sesudah aksi.
  const detail = idDetail ? (o.semua.find((b) => b.id === idDetail) ?? null) : null;

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiKepala>
        <TabPil tab={TABS.map((t) => ({ kunci: t.key, label: t.label, ikon: t.icon, angka: t.key === "daftar" && !o.loading ? o.hitung["Menunggu persetujuan"] : undefined, angkaTunggu: true }))}
          aktif={tab} onPilih={setTab} />
      </IsiKepala>

      {tab === "wo" && <WoIgardu user={user} />}

      {tab === "pengaturan" && (
        <PengaturanKategoriIgardu kategori={o.kategori} oleh={oleh} onSimpan={o.simpanKategori}
          bolehUbah={canSeeAllUnits(user.role) || user.role === "admin"} />
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
