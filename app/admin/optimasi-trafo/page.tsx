"use client";

import { useState } from "react";
import { Download, ListChecks, Loader2, Search, Settings2, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { useOptimasiTrafo, STATUS_TABEL, BULAN } from "./_hooks/useOptimasiTrafo";
import TabelOptimasi from "./_components/TabelOptimasi";
import DetailOptimasiModal from "./_components/DetailOptimasiModal";
import PengaturanAlasan from "./_components/PengaturanAlasan";

/**
 * Optimasi Trafo — uprating/downrating kapasitas trafo.
 *
 * DICATAT DARI HP, DIPERIKSA & DIPUTUSKAN DI SINI. Tidak ada tombol "tambah"
 * di web: nomor seri dibaca dari papan nama, dan fotonya cuma berarti kalau
 * diambil di depan trafonya. Admin bisa mengoreksi salah input selama catatan
 * belum diverifikasi.
 *
 * Bedanya dengan modul lain: memverifikasi di sini MENGUBAH MASTER GARDU.
 * Rencana lengkap: `rencana-optimasi-trafo.md`.
 */

const TABS = [
  { key: "daftar", label: "Daftar Optimasi", icon: ListChecks },
  { key: "pengaturan", label: "Pengaturan Alasan", icon: Settings2 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function OptimasiTrafoPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const [kunciDetail, setKunciDetail] = useState<string | null>(null);
  const [mengunduh, setMengunduh] = useState(false);
  const o = useOptimasiTrafo(user);
  const oleh = user.name ?? user.email ?? "";

  // Modal membaca dari daftar LENGKAP yang hidup, bukan salinan saat dibuka —
  // sesudah verifikasi statusnya langsung berubah di modal, dan baris yang
  // keluar dari saringan status tidak ikut menutup modalnya.
  // Yang diunduh = yang tampil. exceljs dimuat saat tombol ditekan saja.
  const unduh = async () => {
    setMengunduh(true);
    try {
      const { unduhExcelOptimasi } = await import("./_lib/unduhExcel");
      const periode = o.bulan === 0 ? `${o.tahun}` : `${o.tahun}-${String(o.bulan).padStart(2, "0")}`;
      const unit = o.ulp === "SEMUA" ? "SemuaULP" : o.ulp;
      await unduhExcelOptimasi(o.baris, `Optimasi_Trafo_${unit}_${periode}.xlsx`);
    } finally {
      setMengunduh(false);
    }
  };

  const detail = kunciDetail ? (o.semua.find((b) => b.kunci === kunciDetail) ?? null) : null;

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

      {tab === "pengaturan" ? (
        <PengaturanAlasan alasan={o.alasan} onSimpan={o.simpanAlasan} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={o.ulp}
              onChange={(e) => o.setUlp(e.target.value)}
              className={`${FIELD} w-[170px]`}
              disabled={o.daftarUlp.length <= 1}
              aria-label="ULP"
            >
              {o.daftarUlp.map((u) => (
                <option key={u} value={u}>{u === "SEMUA" ? "Semua ULP" : u}</option>
              ))}
            </select>

            <select
              value={o.bulan}
              onChange={(e) => o.setBulan(Number(e.target.value))}
              className={`${FIELD} w-[160px]`}
              aria-label="Bulan"
            >
              <option value={0}>Sepanjang tahun</option>
              {BULAN.map((b, i) => (
                <option key={b} value={i + 1}>{b}</option>
              ))}
            </select>
            <select
              value={o.tahun}
              onChange={(e) => o.setTahun(Number(e.target.value))}
              className={`${FIELD} w-[100px]`}
              aria-label="Tahun"
            >
              {o.daftarTahun.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                value={o.cari}
                onChange={(e) => o.setCari(e.target.value)}
                placeholder="Cari gardu / penyulang"
                className={`${FIELD} w-[210px] pl-8`}
              />
            </div>

            <button
              onClick={() => o.setStatus("SEMUA")}
              className={`${CHIP} ${o.status === "SEMUA" ? CHIP_ON : CHIP_OFF}`}
            >
              Semua
            </button>
            {STATUS_TABEL.map((s) => (
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

          {(o.galat || o.galatWo) && !o.loading && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-semibold text-amber-800">
                  {o.galat ? "Daftar gagal dimuat" : "WO yang belum dikerjakan gagal dimuat"}
                </p>
                <p className="mt-0.5 text-amber-700">
                  {o.galat ?? o.galatWo} —{" "}
                  {o.galat
                    ? "kosongnya tabel di bawah bukan berarti tidak ada pekerjaan."
                    : "tabel di bawah hanya berisi catatan yang sudah terkirim."}
                </p>
                <button onClick={o.muat} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">
                  Muat ulang
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-ink-muted -mt-2">
            Periode menyaring catatan menurut tanggal pekerjaan. WO yang belum dikerjakan selalu
            tampil, berapa pun umurnya — itu tunggakan.
          </p>

          {!o.galat && (
            <TabelOptimasi baris={o.baris} loading={o.loading} onDetail={(b) => setKunciDetail(b.kunci)} />
          )}
        </>
      )}

      {detail && (
        <DetailOptimasiModal
          b={detail}
          alasan={o.alasan}
          oleh={oleh}
          onTutup={() => setKunciDetail(null)}
          onVerifikasi={o.verifikasi}
          onBatalkan={o.batalkan}
          onBatalkanWo={o.batalkanWo}
          onPastikan={o.pastikanJejak}
          onKoreksi={o.koreksi}
          ambilUsulan={o.ambilUsulan}
        />
      )}
    </div>
  );
}
