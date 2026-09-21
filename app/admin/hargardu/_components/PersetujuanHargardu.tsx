"use client";

import { useState, useMemo } from "react";
import { Loader2, Inbox, Search, RefreshCw, X } from "lucide-react";
import { type CurrentUser, canSeeAllUnits, UNITS } from "@/lib/roles";
import { CARD, BTN_GHOST, FIELD, EYEBROW } from "@/app/admin/_ui";
import { useHargarduApproval, type SaringDaftar } from "../_hooks/useHargarduApproval";
import DetailPemeliharaan from "./DetailPemeliharaan";

const tgl = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "—";

const bulanIni = () => new Date().toISOString().slice(0, 7);

/** Dua belas bulan terakhir — pemeliharaan gardu berulang setahun sekali. */
const PILIHAN_BULAN = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - i);
  return {
    nilai: d.toISOString().slice(0, 7),
    label: d.toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
  };
});

const LENCANA: Record<string, { teks: string; kelas: string }> = {
  Diverifikasi: { teks: "Disetujui", kelas: "bg-emerald-50 text-emerald-700" },
  Selesai: { teks: "Menunggu persetujuan", kelas: "bg-navy-100 text-navy-600" },
  Ditolak: { teks: "Dikembalikan", kelas: "bg-red-50 text-danger" },
  "Dalam Proses": { teks: "Sedang dikerjakan", kelas: "bg-surface text-ink-muted" },
  Dijadwalkan: { teks: "Dijadwalkan", kelas: "bg-surface text-ink-muted" },
};

export default function PersetujuanHargardu({ user }: { user: CurrentUser }) {
  const [saring, setSaring] = useState<SaringDaftar>({
    bulan: bulanIni(),
    ulp: "",
    cari: "",
  });
  const [dipilih, setDipilih] = useState<string | null>(null);

  const { daftar, loading, error, memproses, putuskan, batalkan, putuskanUsulan, muat } =
    useHargarduApproval(user, saring);

  const aktif = useMemo(() => daftar.find((d) => d.id === dipilih) ?? null, [daftar, dipilih]);
  const menunggu = useMemo(() => daftar.filter((d) => d.status === "Selesai").length, [daftar]);
  const sedangMencari = saring.cari.trim().length > 0;

  // Rincian MENGGANTIKAN daftar, bukan berdampingan dengannya. Layar
  // persetujuan butuh lebar penuh — data di kiri, foto di kanan — dan itu tidak
  // muat kalau daftarnya ikut memakan sepertiga layar.
  if (aktif) {
    return (
      <DetailPemeliharaan
        aktif={aktif}
        memproses={memproses}
        error={error}
        onKembali={() => setDipilih(null)}
        putuskan={putuskan}
        batalkan={batalkan}
        putuskanUsulan={putuskanUsulan}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 flex flex-wrap items-end gap-3`}>
        <div className="flex-1 min-w-[220px]">
          <label className={EYEBROW}>Cari gardu</label>
          <div className="relative mt-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={saring.cari}
              onChange={(e) => setSaring((s) => ({ ...s, cari: e.target.value }))}
              placeholder="Kode atau nama gardu — menelusuri seluruh riwayat"
              className={`${FIELD} w-full pl-9 pr-8`}
            />
            {saring.cari && (
              <button
                onClick={() => setSaring((s) => ({ ...s, cari: "" }))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                aria-label="Kosongkan pencarian"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        <div>
          <label className={EYEBROW}>Bulan</label>
          <select
            value={saring.bulan}
            onChange={(e) => setSaring((s) => ({ ...s, bulan: e.target.value }))}
            disabled={sedangMencari}
            className={`${FIELD} mt-1 block disabled:opacity-40`}
            title={sedangMencari ? "Pencarian gardu tidak dibatasi bulan" : ""}
          >
            <option value="">Semua bulan</option>
            {PILIHAN_BULAN.map((b) => (
              <option key={b.nilai} value={b.nilai}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        {canSeeAllUnits(user.role) && (
          <div>
            <label className={EYEBROW}>ULP</label>
            <select
              value={saring.ulp}
              onChange={(e) => setSaring((s) => ({ ...s, ulp: e.target.value }))}
              className={`${FIELD} mt-1 block`}
            >
              <option value="">Semua ULP</option>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button onClick={() => void muat()} className={BTN_GHOST} disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Muat ulang
        </button>
      </div>

      {sedangMencari && (
        <p className="text-xs text-ink-soft -mt-2">
          Pencarian gardu menelusuri <b>seluruh riwayat</b>, tidak dibatasi bulan — yang dicari
          orang saat mengetik kode gardu adalah “pernah dipelihara kapan saja”.
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
          <Loader2 size={18} className="animate-spin" /> Memuat pemeliharaan…
        </div>
      ) : daftar.length === 0 ? (
        <div className={`${CARD} p-12 flex flex-col items-center gap-3 text-center`}>
          <Inbox size={38} className="text-ink-muted" />
          <p className="text-ink font-semibold">
            {sedangMencari
              ? `Tidak ada riwayat pemeliharaan untuk “${saring.cari}”`
              : "Belum ada pemeliharaan pada bulan ini"}
          </p>
          <p className="text-sm text-ink-soft max-w-md">
            Pekerjaan muncul di sini setelah regu menekan “Selesai &amp; kirim” di aplikasi.
          </p>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-sm font-semibold text-ink">{daftar.length} pemeliharaan</p>
            {menunggu > 0 && (
              <p className="text-sm text-navy-600 font-semibold">
                {menunggu} menunggu persetujuan
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface text-left text-ink-soft">
                  <th className="px-4 py-2.5 font-semibold">Gardu</th>
                  <th className="px-4 py-2.5 font-semibold">Penyulang</th>
                  <th className="px-4 py-2.5 font-semibold">ULP</th>
                  <th className="px-4 py-2.5 font-semibold">Selesai</th>
                  <th className="px-4 py-2.5 font-semibold">Regu</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Tidak normal</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Koreksi master</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {daftar.map((d) => {
                  const l = LENCANA[d.status] ?? {
                    teks: d.status,
                    kelas: "bg-surface text-ink-muted",
                  };
                  const regu = [...(d.regu_1 ?? []), ...(d.regu_2 ?? [])].join(", ");
                  return (
                    <tr
                      key={d.id}
                      className="border-t border-line hover:bg-surface/60 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-ink">{d.gardu_kode}</p>
                        <p className="text-xs text-ink-muted truncate max-w-[200px]">
                          {d.gardu_nama ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-ink-soft">{d.penyulang ?? "—"}</td>
                      <td className="px-4 py-2.5 text-ink-soft">{d.ulp}</td>
                      <td className="px-4 py-2.5 text-ink-soft whitespace-nowrap">
                        {tgl(d.tgl_selesai)}
                      </td>
                      <td className="px-4 py-2.5 text-ink-soft truncate max-w-[180px]">
                        {regu || d.petugas_nama || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {d.item_tidak_normal > 0 ? (
                          <span className="text-attention font-semibold">
                            {d.item_tidak_normal}
                          </span>
                        ) : (
                          <span className="text-ink-muted">0</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {d.usulan_menunggu > 0 ? (
                          <span className="text-navy-600 font-semibold">{d.usulan_menunggu}</span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${l.kelas}`}
                        >
                          {l.teks}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => setDipilih(d.id)} className={BTN_GHOST}>
                          {d.status === "Selesai" ? "Periksa" : "Lihat"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
