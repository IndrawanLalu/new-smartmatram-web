"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, ClipboardList, Inbox, Loader2, Search, TriangleAlert, X,
} from "lucide-react";
import { type CurrentUser, canSeeAllUnits, UNITS } from "@/lib/roles";
import { useWoPermissions } from "@/app/admin/work-order/_hooks/useWoPermissions";
import { BTN_GHOST, CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import {
  usePerluPerbaikan, kunciBaris, type BarisPerbaikan, type SaringPerbaikan,
} from "../_hooks/usePerluPerbaikan";
import JadikanWoModal from "./JadikanWoModal";

const PER_HALAMAN = 20;

const PILIHAN_WO = [
  { nilai: "belum", label: "Belum di-WO" },
  { nilai: "sudah", label: "Sudah di-WO" },
  { nilai: "semua", label: "Semua" },
] as const;

const tgl = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

export default function PerluPerbaikan({ user }: { user: CurrentUser }) {
  // Terbuka pada "Belum di-WO": daftar ini dibuka untuk menugaskan pekerjaan,
  // bukan untuk membaca ulang yang sudah ditugaskan.
  const [saring, setSaring] = useState<SaringPerbaikan>({
    ulp: "", item: "", wo: "belum", cari: "",
  });
  const [halaman, setHalaman] = useState(1);
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState(false);

  const { daftar, semua, pilihanItem, belumWo, loading, error, muat, tandaiSudahWo } =
    usePerluPerbaikan(user, saring);
  const { canManage } = useWoPermissions(null);

  const ubah = (patch: Partial<SaringPerbaikan>) => {
    setSaring((s) => ({ ...s, ...patch }));
    setHalaman(1);
  };

  const totalHalaman = Math.max(1, Math.ceil(daftar.length / PER_HALAMAN));
  const hal = Math.min(halaman, totalHalaman);
  const tampil = useMemo(
    () => daftar.slice((hal - 1) * PER_HALAMAN, hal * PER_HALAMAN),
    [daftar, hal],
  );

  // Baris terpilih diambil dari SELURUH data, bukan dari yang sedang tampil:
  // saringan yang berubah tidak boleh diam-diam membuang pilihan orang.
  const barisTerpilih = useMemo(
    () => semua.filter((b) => terpilih.has(kunciBaris(b))),
    [semua, terpilih],
  );

  const bisaDipilih = tampil.filter((b) => !b.sudah_di_wo);
  const semuaHalamanTerpilih =
    bisaDipilih.length > 0 && bisaDipilih.every((b) => terpilih.has(kunciBaris(b)));

  const alihkan = (k: string) =>
    setTerpilih((s) => {
      const baru = new Set(s);
      if (baru.has(k)) baru.delete(k);
      else baru.add(k);
      return baru;
    });

  const alihkanHalaman = () =>
    setTerpilih((s) => {
      const baru = new Set(s);
      for (const b of bisaDipilih) {
        if (semuaHalamanTerpilih) baru.delete(kunciBaris(b));
        else baru.add(kunciBaris(b));
      }
      return baru;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat pekerjaan tertunda…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Saringan ── */}
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className={EYEBROW}>Cari</label>
            <div className="relative mt-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                value={saring.cari}
                onChange={(e) => ubah({ cari: e.target.value })}
                placeholder="Gardu, penyulang, temuan, atau keterangan regu"
                className={`${FIELD} w-full pl-9 pr-8`}
              />
              {saring.cari && (
                <button
                  onClick={() => ubah({ cari: "" })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  aria-label="Kosongkan pencarian"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          <div>
            <label className={EYEBROW}>Temuan</label>
            <select
              value={saring.item}
              onChange={(e) => ubah({ item: e.target.value })}
              className={`${FIELD} mt-1 block max-w-[220px]`}
            >
              <option value="">Semua item</option>
              {pilihanItem.map((i) => (
                <option key={i.kode} value={i.kode}>
                  {i.nama}
                </option>
              ))}
            </select>
          </div>

          {canSeeAllUnits(user.role) && (
            <div>
              <label className={EYEBROW}>ULP</label>
              <select
                value={saring.ulp}
                onChange={(e) => ubah({ ulp: e.target.value })}
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

          <button onClick={() => void muat()} className={BTN_GHOST}>
            Muat ulang
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PILIHAN_WO.map((p) => (
            <button
              key={p.nilai}
              onClick={() => ubah({ wo: p.nilai })}
              className={`${CHIP} ${saring.wo === p.nilai ? CHIP_ON : CHIP_OFF}`}
            >
              {p.label}
            </button>
          ))}
          <span className="text-xs text-ink-muted ml-1">
            {daftar.length.toLocaleString("id-ID")} baris ·{" "}
            <b className="text-attention">{belumWo.toLocaleString("id-ID")}</b> belum di-WO dari{" "}
            {semua.length.toLocaleString("id-ID")} temuan menggantung
          </span>
        </div>
      </div>

      {/* ── Daftar ── */}
      <div className={`${CARD} overflow-hidden`}>
        {daftar.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center px-6">
            <Inbox size={32} className="text-ink-muted" />
            <p className="text-sm text-ink-soft max-w-md">
              {semua.length === 0
                ? "Belum ada temuan menggantung. Daftar ini diturunkan dari pemeliharaan yang sudah disetujui — bukan dicatat manual."
                : "Tidak ada baris yang cocok dengan saringan ini."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface text-left text-ink-soft">
                    {canManage && (
                      <th className="px-3 py-2.5 w-10">
                        <input
                          type="checkbox"
                          checked={semuaHalamanTerpilih}
                          onChange={alihkanHalaman}
                          disabled={bisaDipilih.length === 0}
                          aria-label="Pilih semua di halaman ini"
                          className="accent-navy-600"
                        />
                      </th>
                    )}
                    <th className="px-4 py-2.5 font-semibold">Gardu</th>
                    <th className="px-4 py-2.5 font-semibold">Temuan</th>
                    <th className="px-4 py-2.5 font-semibold">Keterangan</th>
                    <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Ditemukan</th>
                    <th className="px-4 py-2.5 font-semibold">Work Order</th>
                  </tr>
                </thead>
                <tbody>
                  {tampil.map((b) => (
                    <Baris
                      key={kunciBaris(b)}
                      b={b}
                      pilihAktif={canManage}
                      terpilih={terpilih.has(kunciBaris(b))}
                      onPilih={() => alihkan(kunciBaris(b))}
                      tampilUlp={canSeeAllUnits(user.role) && !saring.ulp}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {totalHalaman > 1 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line">
                <p className="text-xs text-ink-muted">
                  Halaman {hal} dari {totalHalaman}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setHalaman(hal - 1)}
                    disabled={hal <= 1}
                    className={BTN_GHOST}
                  >
                    <ChevronLeft size={15} /> Sebelumnya
                  </button>
                  <button
                    onClick={() => setHalaman(hal + 1)}
                    disabled={hal >= totalHalaman}
                    className={BTN_GHOST}
                  >
                    Berikutnya <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* ── Bilah aksi, muncul hanya saat ada yang dipilih ── */}
      {canManage && barisTerpilih.length > 0 && (
        <div className="sticky bottom-4 z-20 flex justify-center">
          <div className="flex items-center gap-3 rounded-2xl bg-navy-600 text-white px-4 py-2.5 shadow-lg">
            <span className="text-sm font-semibold">
              {barisTerpilih.length} temuan dipilih
            </span>
            <button
              onClick={() => setTerpilih(new Set())}
              className="text-xs text-white/70 hover:text-white"
            >
              Kosongkan
            </button>
            {/* Kelasnya ditulis penuh, bukan BTN_PRIMARY yang ditimpa: dua kelas
                latar untuk properti yang sama dimenangkan urutan di stylesheet,
                bukan urutan di string — dan itu tidak bisa diandalkan. */}
            <button
              onClick={() => setModal(true)}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold bg-white text-navy-700 hover:bg-navy-50 transition-colors"
            >
              <ClipboardList size={15} /> Jadikan WO
            </button>
          </div>
        </div>
      )}

      {modal && (
        <JadikanWoModal
          baris={barisTerpilih}
          onTutup={() => setModal(false)}
          onSelesai={(kunci, pada) => {
            tandaiSudahWo(kunci, pada);
            setTerpilih(new Set());
          }}
          onGagal={() => {
            setTerpilih(new Set());
            void muat();
          }}
        />
      )}
    </div>
  );
}

function Baris({
  b,
  pilihAktif,
  terpilih,
  onPilih,
  tampilUlp,
}: {
  b: BarisPerbaikan;
  pilihAktif: boolean;
  terpilih: boolean;
  onPilih: () => void;
  tampilUlp: boolean;
}) {
  const catatan = [b.catatan, b.pr_keterangan, b.catatan_perbaikan]
    .filter((t) => t && t.trim())
    .join(" · ");

  return (
    <tr className={`border-t border-line ${terpilih ? "bg-navy-50" : ""}`}>
      {pilihAktif && (
        <td className="px-3 py-2.5 align-top">
          <input
            type="checkbox"
            checked={terpilih}
            onChange={onPilih}
            disabled={b.sudah_di_wo}
            aria-label={`Pilih ${b.gardu_kode} ${b.item_nama}`}
            title={b.sudah_di_wo ? "Sudah masuk Work Order" : ""}
            className="accent-navy-600 disabled:opacity-30"
          />
        </td>
      )}

      <td className="px-4 py-2.5 align-top">
        <p className="font-semibold text-ink">{b.gardu_kode}</p>
        {b.gardu_nama && <p className="text-xs text-ink-soft">{b.gardu_nama}</p>}
        <p className="text-[11px] text-ink-muted">
          {[tampilUlp ? b.ulp : null, b.penyulang].filter(Boolean).join(" · ")}
        </p>
      </td>

      <td className="px-4 py-2.5 align-top">
        <p className="text-ink flex items-center gap-1.5">
          <TriangleAlert size={13} className="text-attention shrink-0" />
          {b.item_nama}
          {b.bagian && b.bagian !== "-" && (
            <span className="text-[11px] text-ink-muted">({b.bagian})</span>
          )}
        </p>
        <p className="text-xs text-attention font-medium">{b.nilai_label ?? b.nilai ?? "—"}</p>
      </td>

      <td className="px-4 py-2.5 align-top max-w-[280px]">
        <p className="text-xs text-ink-soft line-clamp-2">{catatan || "—"}</p>
      </td>

      <td className="px-4 py-2.5 align-top whitespace-nowrap text-xs text-ink-soft">
        {tgl(b.ditemukan_pada)}
      </td>

      <td className="px-4 py-2.5 align-top">
        {b.sudah_di_wo ? (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            Sudah di-WO {tgl(b.ditugaskan_pada)}
          </span>
        ) : (
          <span className="text-xs text-ink-muted">Belum ditugaskan</span>
        )}
      </td>
    </tr>
  );
}
