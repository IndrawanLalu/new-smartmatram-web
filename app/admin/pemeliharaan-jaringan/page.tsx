"use client";

import { useState } from "react";
import { ListChecks, Settings2 } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { usePemeliharaanJaringan, type JenisJaringan } from "./_hooks/usePemeliharaanJaringan";
import DaftarPemeliharaan from "./_components/DaftarPemeliharaan";
import PengaturanKategori from "./_components/PengaturanKategori";

/**
 * Pemeliharaan Jaringan JTM/JTR.
 *
 * Mengisi baris yang selama ini kosong di Rekap Kinerja Pelayanan Teknik.
 *
 * DICATAT DARI HP, DIPANTAU DARI SINI. Tidak ada tombol "tambah" di web, dan
 * itu disengaja: pekerjaan ini dibuktikan oleh foto sebelum-sesudah beserta
 * titik koordinatnya, dan ketiganya cuma berarti kalau diambil di tempat
 * kejadian. Formulir di web akan mengundang pengisian dari belakang meja
 * berdasarkan laporan WA — dan begitu satu catatan lahir dengan cara itu,
 * tidak ada lagi cara membedakannya dari yang benar.
 */

const TABS = [
  { key: "daftar", label: "Daftar Pemeliharaan", icon: ListChecks },
  { key: "pengaturan", label: "Pengaturan Kategori", icon: Settings2 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const JENIS: ("SEMUA" | JenisJaringan)[] = ["SEMUA", "JTM", "JTR"];

export default function PemeliharaanJaringanPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const {
    baris, kategori, loading, ulp, setUlp, daftarUlp, jenis, setJenis,
    verifikasi, batalkan, simpanKategori,
  } = usePemeliharaanJaringan(user);

  const oleh = user.name ?? user.email ?? "";

  return (
    <div className="text-ink flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`${CHIP} ${tab === key ? CHIP_ON : CHIP_OFF}`}
          >
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

            {JENIS.map((j) => (
              <button
                key={j}
                onClick={() => setJenis(j)}
                className={`${CHIP} ${jenis === j ? CHIP_ON : CHIP_OFF}`}
              >
                {j === "SEMUA" ? "JTM & JTR" : j}
              </button>
            ))}

            {!loading && (
              <span className="text-xs text-ink-muted ml-auto">
                {baris.length} catatan ·{" "}
                {baris.filter((b) => b.status === "Selesai").length} menunggu verifikasi
              </span>
            )}
          </div>

          <DaftarPemeliharaan
            baris={baris}
            loading={loading}
            oleh={oleh}
            onVerifikasi={verifikasi}
            onBatalkan={batalkan}
          />
        </>
      ) : (
        <PengaturanKategori kategori={kategori} onSimpan={simpanKategori} />
      )}
    </div>
  );
}
