"use client";

import { useState } from "react";
import { ListChecks, Settings2, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { useOptimasiTrafo, type SaringStatus } from "./_hooks/useOptimasiTrafo";
import DaftarOptimasi from "./_components/DaftarOptimasi";
import PengaturanAlasan from "./_components/PengaturanAlasan";

/**
 * Optimasi Trafo — uprating/downrating kapasitas trafo.
 *
 * DICATAT DARI HP, DIPUTUSKAN DI SINI. Sama dengan Pemeliharaan Jaringan,
 * tidak ada tombol "tambah" di web: nomor seri dibaca dari papan nama, dan
 * fotonya cuma berarti kalau diambil di depan trafonya.
 *
 * Bedanya dengan modul lain: memverifikasi di sini MENGUBAH MASTER GARDU.
 * Rencana lengkap: `rencana-optimasi-trafo.md`.
 */

const TABS = [
  { key: "daftar", label: "Daftar Optimasi", icon: ListChecks },
  { key: "pengaturan", label: "Pengaturan Alasan", icon: Settings2 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATUS: { nilai: SaringStatus; label: string }[] = [
  { nilai: "SEMUA", label: "Semua" },
  { nilai: "Selesai", label: "Menunggu verifikasi" },
  { nilai: "Diverifikasi", label: "Diverifikasi" },
  { nilai: "Dibatalkan", label: "Dibatalkan" },
];

export default function OptimasiTrafoPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const {
    baris, alasan, woTerbuka, loading, galat, ulp, setUlp, daftarUlp, status, setStatus,
    muat, verifikasi, batalkan, pastikanJejak, simpanAlasan,
  } = useOptimasiTrafo(user);

  const oleh = user.name ?? user.email ?? "";
  const jejakTerbuka = baris.filter(
    (b) => b.status !== "Dibatalkan" && (b.jejakAsal === "terbuka" || b.jejakTujuan === "terbuka"),
  ).length;

  return (
    <div className="text-ink flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`${CHIP} ${tab === key ? CHIP_ON : CHIP_OFF}`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === "daftar" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={ulp}
              onChange={(e) => setUlp(e.target.value)}
              className={`${FIELD} w-[170px]`}
              disabled={daftarUlp.length <= 1}
              aria-label="ULP"
            >
              {daftarUlp.map((u) => (
                <option key={u} value={u}>{u === "SEMUA" ? "Semua ULP" : u}</option>
              ))}
            </select>

            {STATUS.map((s) => (
              <button
                key={s.nilai}
                onClick={() => setStatus(s.nilai)}
                className={`${CHIP} ${status === s.nilai ? CHIP_ON : CHIP_OFF}`}
              >
                {s.label}
              </button>
            ))}

            {!loading && !galat && (
              <span className="text-xs text-ink-muted ml-auto">
                {woTerbuka === null ? "WO terbuka tak terbaca" : `${woTerbuka} WO belum dikerjakan`} ·{" "}
                {baris.filter((b) => b.status === "Selesai").length} menunggu verifikasi
                {jejakTerbuka > 0 && ` · ${jejakTerbuka} jejak trafo terbuka`}
              </span>
            )}
          </div>

          {galat && !loading && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-semibold text-amber-800">Daftar gagal dimuat</p>
                <p className="mt-0.5 text-amber-700">
                  {galat} — kosongnya daftar di bawah bukan berarti tidak ada pekerjaan.
                </p>
                <button onClick={() => void muat()} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">
                  Muat ulang
                </button>
              </div>
            </div>
          )}

          {!galat && (
            <DaftarOptimasi
              baris={baris}
              loading={loading}
              oleh={oleh}
              onVerifikasi={verifikasi}
              onBatalkan={batalkan}
              onPastikan={pastikanJejak}
            />
          )}
        </>
      ) : (
        <PengaturanAlasan alasan={alasan} onSimpan={simpanAlasan} />
      )}
    </div>
  );
}
