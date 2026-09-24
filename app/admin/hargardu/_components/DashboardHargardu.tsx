"use client";

import { useMemo } from "react";
import {
  CalendarClock, ClipboardList, Clock, Gauge, Inbox, Layers, ShieldCheck, TriangleAlert, Wrench,
} from "lucide-react";
import type { CurrentUser } from "@/lib/roles";
import { CARD, PANEL_HEAD } from "@/app/admin/_ui";
import StatTile from "@/app/admin/_components/StatTile";
import TrenBulananArsir from "@/app/admin/_components/TrenBulananArsir";
import DaftarBatang, { type ItemBatang } from "@/app/admin/_components/DaftarBatang";
import { useHargarduRekap, type Batang } from "../_hooks/useHargarduRekap";
import { usePerluPerbaikan } from "../_hooks/usePerluPerbaikan";
import { useDashboardHargardu } from "../_hooks/useDashboardHargardu";

/**
 * Dashboard ringkas Pemeliharaan Gardu — pola Kinerja Pelayanan Teknik
 * (teknisaplikasi.md butir 7): kartu angka, tren bulanan, lalu dua hal khas
 * modul ini:
 *
 *   · KEADAAN GARDU per item (tekep ada/tidak, dst.) — item yang tampil
 *     diatur dari Pengaturan (`tampil_dashboard`). Dihitung dari pemeliharaan
 *     yang sudah disetujui; "belum diperiksa" jadi potongan sendiri.
 *   · Temuan perbaikan teratas, bersumber sama dengan tab Perlu Perbaikan.
 *
 * Ikut penyaring ULP & tahun halaman. Tren & kartu pekerjaan per tahun;
 * keadaan gardu dan cakupan adalah keadaan TERKINI.
 */

/**
 * Warna potongan batang keadaan gardu. Yang belum diperiksa ABU-ABU bergaris,
 * bukan warna netral yang bisa disangka "aman" — dia ketiadaan data.
 */
const WARNA_NORMAL = ["#1D3573", "#2A4A9C", "#5878C4", "#8FA8DC"];
const WARNA_TIDAK = ["#C77700", "#C62828", "#8E24AA", "#00695C"];

const persen = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
const tgl = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

interface Props {
  user: CurrentUser;
  ulp: string;
  tahun: number;
}

export default function DashboardHargardu({ user, ulp, tahun }: Props) {
  const ulpRekap = ulp === "SEMUA" ? "" : ulp;
  const d = useDashboardHargardu(ulp, tahun);
  const { batang, cakupanTotal, loading: memuatRekap, error: galatRekap } = useHargarduRekap(user, ulpRekap);
  const saringPerbaikan = useMemo(() => ({ ulp: ulpRekap, item: "", wo: "semua" as const, cari: "" }), [ulpRekap]);
  const { semua: perbaikan, loading: memuatPerbaikan } = usePerluPerbaikan(user, saringPerbaikan);

  // Temuan paling sering — satu daftar dengan tab Perlu Perbaikan, di sini
  // cuma ringkasannya. Bagian amber = yang belum dijadikan WO.
  const perbaikanTeratas = useMemo<ItemBatang[]>(() => {
    const m = new Map<string, ItemBatang>();
    for (const p of perbaikan) {
      const label = `${p.item_nama}: ${p.nilai_label ?? "—"}`;
      const a = m.get(label) ?? { label, jumlah: 0, menunggu: 0 };
      a.jumlah += 1;
      if (!p.sudah_di_wo) a.menunggu = (a.menunggu ?? 0) + 1;
      m.set(label, a);
    }
    return [...m.values()].sort((a, b) => b.jumlah - a.jumlah).slice(0, 8);
  }, [perbaikan]);

  const galat = d.galat ?? galatRekap;
  if (galat) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-amber-800">Dashboard gagal dimuat: {galat} — angka nol di sini tidak berarti tidak ada pekerjaan.</p>
      </div>
    );
  }

  const nol = d.loading ? "…" : undefined;
  const nolRekap = memuatRekap ? "…" : undefined;
  const pct = d.laluSetara > 0 ? ((d.total - d.laluSetara) / d.laluSetara) * 100 : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label={`Pemeliharaan ${tahun}`}
          value={nol ?? d.total.toLocaleString("id-ID")}
          icon={Wrench}
          tone="navy"
          delta={pct !== undefined ? { pct, vs: `${tahun - 1} periode sama` } : undefined}
          hint="Menurut tanggal selesai, tanpa yang dibatalkan"
        />
        <StatTile
          label="Menunggu persetujuan"
          value={nol ?? d.menunggu.toLocaleString("id-ID")}
          icon={Clock}
          tone="attention"
          hint="Sudah dikirim regu, belum diperiksa"
        />
        <StatTile
          label="Master terkonfirmasi"
          value={nolRekap ?? persen(cakupanTotal.master_terverifikasi, cakupanTotal.jumlah_gardu)}
          icon={ShieldCheck}
          tone="green"
          hint={`${cakupanTotal.master_terverifikasi.toLocaleString("id-ID")} dari ${cakupanTotal.jumlah_gardu.toLocaleString("id-ID")} gardu dilihat orang di lapangan`}
        />
        <StatTile
          label="Pernah dipelihara"
          value={nolRekap ?? persen(cakupanTotal.pernah_dipelihara, cakupanTotal.jumlah_gardu)}
          icon={CalendarClock}
          tone="accent"
          hint={`${cakupanTotal.dipelihara_12_bulan.toLocaleString("id-ID")} dalam 12 bulan terakhir · terakhir ${tgl(cakupanTotal.terakhir)}`}
        />
      </div>

      <div className="h-[320px]">
        <TrenBulananArsir
          data={d.bulanan}
          tahun={tahun}
          judul="Pemeliharaan Gardu"
          satuan="gardu"
          ikon={Wrench}
          loading={d.loading}
          idArsir="arsirHargardu"
        />
      </div>

      {/* ── Keadaan gardu per item ── */}
      <div className={`${CARD} overflow-hidden`}>
        <div className={PANEL_HEAD}>
          <Gauge size={14} className="text-white/80" />
          <div className="flex flex-col leading-tight">
            <span className="text-white font-semibold text-xs">Keadaan gardu</span>
            <span className="text-white/70 text-[10px]">
              Dari pemeliharaan yang sudah disetujui · item yang tampil diatur di tab Pengaturan
            </span>
          </div>
        </div>
        <div className="p-5">
          {memuatRekap ? (
            <p className="text-sm text-ink-muted">Memuat…</p>
          ) : batang.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Inbox size={30} className="text-ink-muted" />
              <p className="text-sm text-ink-soft max-w-md">
                Belum ada pemeliharaan yang disetujui, atau belum ada item yang dicentang “tampil di
                dashboard” di Pengaturan.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
              {batang.map((b) => <BatangItem key={b.itemKode} b={b} />)}
            </div>
          )}
          <p className="text-[11px] text-ink-muted mt-4">
            Bagian abu-abu bergaris adalah gardu yang <b>belum pernah diperiksa</b> — bukan gardu yang
            bermasalah, dan bukan gardu yang aman.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DaftarBatang judul={`Per ULP · ${tahun}`} ikon={Layers} item={d.perUlp} satuan="gardu" labelUtama="disetujui" />
        <DaftarBatang
          judul={memuatPerbaikan ? "Perlu perbaikan · memuat…" : "Perlu perbaikan · temuan teratas"}
          ikon={ClipboardList}
          item={perbaikanTeratas}
          satuan="gardu"
          labelUtama="sudah di-WO"
          labelBagian="belum di-WO"
          kosong="Tidak ada temuan yang menggantung."
        />
      </div>
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
