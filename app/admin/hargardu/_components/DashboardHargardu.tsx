"use client";

import { useState, useMemo } from "react";
import {
  Loader2, ShieldCheck, Wrench, Gauge, CalendarClock, TriangleAlert, Inbox,
} from "lucide-react";
import { type CurrentUser, canSeeAllUnits, UNITS } from "@/lib/roles";
import { CARD, FIELD, EYEBROW, BTN_GHOST } from "@/app/admin/_ui";
import { useHargarduRekap, type Batang } from "../_hooks/useHargarduRekap";
import { usePerluPerbaikan } from "../_hooks/usePerluPerbaikan";

const tgl = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

/**
 * Warna potongan batang.
 *
 * Yang belum diperiksa ABU-ABU dan bergaris, bukan warna netral yang bisa
 * disangka "aman". Dia bukan keadaan gardu — dia ketiadaan data, dan itu harus
 * terlihat berbeda jenisnya dari dua yang lain.
 */
const WARNA_NORMAL = ["#1D3573", "#2A4A9C", "#5878C4", "#8FA8DC"];
const WARNA_TIDAK = ["#C77700", "#C62828", "#8E24AA", "#00695C"];

export default function DashboardHargardu({ user }: { user: CurrentUser }) {
  const [ulp, setUlp] = useState("");
  const { batang, cakupanTotal, loading, error, muat } = useHargarduRekap(user, ulp);

  // Temuan menggantung dibaca dari hook yang sama dengan tab Perlu Perbaikan —
  // satu daftar, dua tampilan. Di sini cuma ringkasannya.
  const saringPerbaikan = useMemo(
    () => ({ ulp, item: "", wo: "semua" as const, cari: "" }),
    [ulp],
  );
  const {
    semua: perbaikan,
    loading: memuatPerbaikan,
    muat: muatPerbaikan,
  } = usePerluPerbaikan(user, saringPerbaikan);

  const perbaikanTeratas = useMemo(() => {
    const m = new Map<string, { nama: string; jumlah: number; belumWo: number }>();
    for (const p of perbaikan) {
      const k = `${p.item_nama}|${p.nilai_label ?? "—"}`;
      const a = m.get(k) ?? { nama: `${p.item_nama}: ${p.nilai_label ?? "—"}`, jumlah: 0, belumWo: 0 };
      a.jumlah += 1;
      if (!p.sudah_di_wo) a.belumWo += 1;
      m.set(k, a);
    }
    return [...m.values()].sort((a, b) => b.jumlah - a.jumlah).slice(0, 8);
  }, [perbaikan]);

  if (loading || memuatPerbaikan) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat rekap…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canSeeAllUnits(user.role) && (
        <div className={`${CARD} p-4 flex flex-wrap items-end gap-3`}>
          <div>
            <label className={EYEBROW}>ULP</label>
            <select
              value={ulp}
              onChange={(e) => setUlp(e.target.value)}
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
          <button
            onClick={() => {
              void muat();
              void muatPerbaikan();
            }}
            className={BTN_GHOST}
          >
            Muat ulang
          </button>
        </div>
      )}

      {/* ── Cakupan: seberapa jauh masternya sudah dikonfirmasi orang ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kartu
          ikon={<Wrench size={15} />}
          label="Gardu"
          nilai={cakupanTotal.jumlah_gardu.toLocaleString("id-ID")}
        />
        <Kartu
          ikon={<ShieldCheck size={15} />}
          label="Pernah dipelihara"
          nilai={cakupanTotal.pernah_dipelihara.toLocaleString("id-ID")}
          bantu={`${persen(cakupanTotal.pernah_dipelihara, cakupanTotal.jumlah_gardu)} dari seluruh gardu`}
        />
        <Kartu
          ikon={<Gauge size={15} />}
          label="Master terkonfirmasi"
          nilai={cakupanTotal.master_terverifikasi.toLocaleString("id-ID")}
          bantu={`${persen(cakupanTotal.master_terverifikasi, cakupanTotal.jumlah_gardu)} sudah dilihat orang di lapangan`}
        />
        <Kartu
          ikon={<CalendarClock size={15} />}
          label="12 bulan terakhir"
          nilai={cakupanTotal.dipelihara_12_bulan.toLocaleString("id-ID")}
          bantu={`terakhir ${tgl(cakupanTotal.terakhir)}`}
        />
      </div>

      {/* ── Batang per item ── */}
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Keadaan gardu</p>
        <p className="text-xs text-ink-soft mt-1">
          Angka di bawah dihitung dari pemeliharaan yang <b>sudah disetujui</b>. Bagian abu-abu
          adalah gardu yang <b>belum pernah diperiksa</b> — bukan gardu yang bermasalah, dan
          bukan gardu yang aman. Sengaja tidak digabung ke salah satunya.
        </p>

        {batang.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Inbox size={32} className="text-ink-muted" />
            <p className="text-sm text-ink-soft max-w-md">
              Belum ada pemeliharaan yang disetujui. Angka muncul setelah admin menyetujui
              pekerjaan pertama.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {batang.map((b) => (
              <BatangItem key={b.itemKode} b={b} />
            ))}
          </div>
        )}
      </div>

      {/* ── Temuan yang paling sering ── */}
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Perlu perbaikan</p>
        <p className="text-xs text-ink-soft mt-1">
          Diturunkan dari kondisi terakhir tiap gardu — hilang sendiri begitu pemeliharaan
          berikutnya mencatatnya normal. Tidak ada yang perlu menutupnya manual. Rincian per
          gardu dan tombol jadikan WO ada di tab <b>Perlu Perbaikan</b>.
        </p>

        {perbaikanTeratas.length === 0 ? (
          <p className="text-sm text-ink-soft mt-3">Tidak ada temuan yang menggantung.</p>
        ) : (
          <div className="mt-3 rounded-xl border border-line overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface text-left text-ink-soft">
                  <th className="px-4 py-2 font-semibold">Temuan</th>
                  <th className="px-4 py-2 font-semibold text-right">Gardu</th>
                  <th className="px-4 py-2 font-semibold text-right">Belum di-WO</th>
                </tr>
              </thead>
              <tbody>
                {perbaikanTeratas.map((p) => (
                  <tr key={p.nama} className="border-t border-line">
                    <td className="px-4 py-2 text-ink">{p.nama}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-soft">{p.jumlah}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {p.belumWo > 0 ? (
                        <span className="text-attention font-semibold">{p.belumWo}</span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

const persen = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

function Kartu({
  ikon,
  label,
  nilai,
  bantu,
}: {
  ikon: React.ReactNode;
  label: string;
  nilai: string;
  bantu?: string;
}) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-[11px] text-ink-muted flex items-center gap-1.5">
        {ikon} {label}
      </p>
      <p className="text-2xl font-semibold text-ink mt-1 tabular-nums">{nilai}</p>
      {bantu && <p className="text-[11px] text-ink-muted mt-0.5">{bantu}</p>}
    </div>
  );
}

function BatangItem({ b }: { b: Batang }) {
  const total = Math.max(b.jumlahGardu, 1);
  let iNormal = 0;
  let iTidak = 0;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-semibold text-ink">{b.itemNama}</p>
        <p className="text-xs text-ink-muted">
          {b.diperiksa.toLocaleString("id-ID")} dari {b.jumlahGardu.toLocaleString("id-ID")} gardu
          diperiksa · {b.persenDiperiksa.toFixed(1)}%
        </p>
      </div>

      <div className="mt-1.5 flex h-6 w-full overflow-hidden rounded-lg border border-line">
        {b.potongan.map((p) => {
          const warna = p.normal
            ? WARNA_NORMAL[iNormal++ % WARNA_NORMAL.length]
            : WARNA_TIDAK[iTidak++ % WARNA_TIDAK.length];
          const lebar = (p.jumlah / total) * 100;
          if (lebar <= 0) return null;
          return (
            <div
              key={p.label}
              style={{ width: `${lebar}%`, backgroundColor: warna }}
              title={`${p.label}: ${p.jumlah} gardu`}
            />
          );
        })}
        {b.belumDiperiksa > 0 && (
          <div
            style={{ width: `${(b.belumDiperiksa / total) * 100}%` }}
            className="bg-[repeating-linear-gradient(45deg,#E5E9F0,#E5E9F0_5px,#F2F4F8_5px,#F2F4F8_10px)]"
            title={`Belum diperiksa: ${b.belumDiperiksa} gardu`}
          />
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {(() => {
          let n = 0;
          let t = 0;
          return b.potongan
            .filter((p) => p.jumlah > 0)
            .map((p) => {
              const warna = p.normal
                ? WARNA_NORMAL[n++ % WARNA_NORMAL.length]
                : WARNA_TIDAK[t++ % WARNA_TIDAK.length];
              return (
                <span key={p.label} className="flex items-center gap-1.5 text-ink-soft">
                  <i className="w-2.5 h-2.5 rounded-sm" style={{ background: warna }} />
                  {p.label} <b className="text-ink tabular-nums">{p.jumlah}</b>
                  {!p.normal && <TriangleAlert size={12} className="text-attention" />}
                </span>
              );
            });
        })()}
        {b.belumDiperiksa > 0 && (
          <span className="flex items-center gap-1.5 text-ink-muted">
            <i className="w-2.5 h-2.5 rounded-sm bg-[repeating-linear-gradient(45deg,#E5E9F0,#E5E9F0_3px,#F2F4F8_3px,#F2F4F8_6px)] border border-line" />
            Belum diperiksa <b className="text-ink-soft tabular-nums">{b.belumDiperiksa}</b>
          </span>
        )}
      </div>
    </div>
  );
}
