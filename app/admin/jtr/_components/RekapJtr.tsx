"use client";

import { useState, useMemo } from "react";
import {
  Loader2, GitBranch, Ruler, Cable, MapPinOff, Search, TriangleAlert, TreePine, CheckCircle2,
} from "lucide-react";
import { type CurrentUser } from "@/lib/roles";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import { useJtrRekap, type RekapGardu } from "../_hooks/useJtrRekap";

const km = (v: number) => `${v.toFixed(2).replace(".", ",")} km`;

/**
 * Dua sebab panjang penghantar bisa kurang, dan keduanya harus terlihat:
 * tiang yang kabelnya belum dicatat sama sekali, dan kabel yang tercatat tapi
 * belum ketahuan datang dari tiang mana. Keduanya membuat bentang tidak ikut
 * dijumlah — dan angka yang kurang tanpa tanda jauh lebih berbahaya daripada
 * angka yang jelas kosong.
 */
const kurangLengkap = (g: Pick<RekapGardu, "tiang_tanpa_kabel" | "gawang_terputus">) =>
  Number(g.tiang_tanpa_kabel ?? 0) > 0 || Number(g.gawang_terputus ?? 0) > 0;

const alasanKurang = (g: Pick<RekapGardu, "tiang_tanpa_kabel" | "gawang_terputus">) =>
  [
    Number(g.tiang_tanpa_kabel ?? 0) > 0
      ? `${g.tiang_tanpa_kabel} tiang belum dicatat kabelnya`
      : null,
    Number(g.gawang_terputus ?? 0) > 0
      ? `${g.gawang_terputus} kabel belum jelas datang dari tiang mana`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

export default function RekapJtr({ user }: { user: CurrentUser }) {
  const {
    perUlp, perGardu, cakupan, temuan, penghalang, total, penyapuan, belumBertitik, loading, error,
  } = useJtrRekap(user);
  const [cari, setCari] = useState("");

  // Satu gardu bisa punya beberapa jurusan; yang dilihat orang adalah gardunya,
  // jadi jurusan dijumlahkan lebih dulu.
  const perGarduGabung = useMemo(() => {
    const m = new Map<string, RekapGardu & { jurusanList: string[] }>();
    for (const g of perGardu) {
      const k = `${g.gardu_kode}|${g.ulp}`;
      const ada = m.get(k);
      if (!ada) {
        m.set(k, { ...g, jurusanList: [g.jurusan] });
      } else {
        ada.jumlah_tiang += Number(g.jumlah_tiang ?? 0);
        ada.panjang_rute_km = Number(ada.panjang_rute_km) + Number(g.panjang_rute_km ?? 0);
        ada.panjang_penghantar_km =
          Number(ada.panjang_penghantar_km) + Number(g.panjang_penghantar_km ?? 0);
        ada.tiang_tanpa_kabel =
          Number(ada.tiang_tanpa_kabel ?? 0) + Number(g.tiang_tanpa_kabel ?? 0);
        ada.gawang_terputus =
          Number(ada.gawang_terputus ?? 0) + Number(g.gawang_terputus ?? 0);
        ada.jurusanList.push(g.jurusan);
      }
    }
    const q = cari.trim().toUpperCase();
    return [...m.values()]
      .filter((g) => !q || g.gardu_kode.toUpperCase().includes(q))
      .sort((a, b) => Number(b.panjang_rute_km) - Number(a.panjang_rute_km));
  }, [perGardu, cari]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat rekap JTR…
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Angka pokok */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile ikon={<GitBranch size={16} />} label="Tiang tercatat" nilai={total.jumlahTiang.toLocaleString("id-ID")} />
        <Tile ikon={<Ruler size={16} />} label="Panjang rute" nilai={km(total.rute)} />
        <Tile
          ikon={<Cable size={16} />}
          label="Panjang penghantar"
          nilai={km(total.penghantar)}
          bantu="rute × jumlah kabel yang benar-benar terpasang"
        />
        <Tile
          ikon={<MapPinOff size={16} />}
          label="Gardu belum bertitik"
          nilai={belumBertitik.toLocaleString("id-ID")}
          bantu="belum bisa diinspeksi sebelum dititik"
          perhatian={belumBertitik > 0}
        />
      </div>

      {/* Cakupan inspeksi — ukuran keberhasilan program */}
      <div className={CARD}>
        <div className="px-4 py-3 border-b border-line">
          <p className={EYEBROW}>Cakupan inspeksi</p>
          <p className="text-sm text-ink-soft mt-0.5">
            Berapa banyak gardu yang jaringan JTR-nya sudah benar-benar ditelusuri orang.
          </p>
        </div>
        <div className="p-4 space-y-3">
          {cakupan.map((c) => {
            const punya = perGardu.filter((g) => g.ulp === c.ulp);
            const garduPunya = new Set(punya.map((g) => g.gardu_kode)).size;
            const persen = c.gardu_master ? (garduPunya / c.gardu_master) * 100 : 0;
            return (
              <div key={c.ulp}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-semibold text-ink">{c.ulp}</span>
                  <span className="text-ink-soft">
                    {garduPunya.toLocaleString("id-ID")} dari{" "}
                    {c.gardu_master.toLocaleString("id-ID")} gardu ·{" "}
                    <b className="text-ink">{persen.toFixed(1).replace(".", ",")}%</b>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full bg-navy-600"
                    style={{ width: `${Math.max(persen, persen > 0 ? 1 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Temuan turunan */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className={CARD}>
          <div className="px-4 py-3 border-b border-line">
            <p className={EYEBROW}>Temuan</p>
            <p className="text-sm text-ink-soft mt-0.5">
              Diturunkan dari kondisi yang dicatat petugas, bukan dari kesimpulan yang diketik.
            </p>
          </div>
          <div className="p-4">
            {temuan.length === 0 ? (
              <p className="text-sm text-ink-muted py-6 text-center">
                Belum ada temuan — atau belum ada tiang yang diperiksa.
              </p>
            ) : (
              <ul className="space-y-2">
                {temuan.map((t) => (
                  <li
                    key={t.label}
                    className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-sm text-ink">
                      <TriangleAlert
                        size={15}
                        className={t.urgensi === "Tinggi" ? "text-red-600" : "text-attention"}
                      />
                      {t.label}
                    </span>
                    <span className="text-sm font-semibold text-ink">{t.jumlah}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className={CARD}>
          <div className="px-4 py-3 border-b border-line">
            <p className={EYEBROW}>Penghalang jalur (ROW)</p>
            <p className="text-sm text-ink-soft mt-0.5">
              Dihitung terpisah — pohon dan bangunan butuh penanganan yang berbeda.
            </p>
          </div>
          <div className="p-4">
            {penghalang.length === 0 ? (
              <p className="text-sm text-ink-muted py-6 text-center">Tidak ada penghalang tercatat.</p>
            ) : (
              <ul className="space-y-2">
                {penghalang.map(([nama, jml]) => (
                  <li
                    key={nama}
                    className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-sm text-ink">
                      <TreePine size={15} className="text-attention" />
                      {nama}
                    </span>
                    <span className="text-sm font-semibold text-ink">{jml} tiang</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Inspeksi yang sudah tercatat */}
      <div className={CARD}>
        <div className="px-4 py-3 border-b border-line">
          <p className={EYEBROW}>Inspeksi JTR</p>
          <p className="text-sm text-ink-soft mt-0.5">
            Satu baris = satu gardu yang jaringan JTR-nya dinyatakan sudah diinspeksi tuntas.
          </p>
        </div>
        {penyapuan.length === 0 ? (
          <p className="text-sm text-ink-muted py-12 text-center">
            Belum ada gardu yang ditandai selesai diinspeksi.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-soft border-b border-line">
                  <th className="px-4 py-2.5 font-semibold">Gardu</th>
                  <th className="px-4 py-2.5 font-semibold">Penyulang</th>
                  <th className="px-4 py-2.5 font-semibold">Selesai</th>
                  <th className="px-4 py-2.5 font-semibold">Petugas</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Tiang</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Panjang</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Temuan</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {penyapuan.map((p) => {
                  // Tiang bertambah sesudah inspeksi ditutup: catatannya tidak
                  // lagi mencakup seluruh jaringan, dan itu harus terlihat.
                  const kurang = p.sudah_diperiksa < p.tiang_aktif;
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 font-semibold text-ink">{p.gardu_kode}</td>
                      <td className="px-4 py-2.5 text-ink-soft">{p.penyulang ?? "—"}</td>
                      <td className="px-4 py-2.5 text-ink-soft">
                        {p.tgl_selesai
                          ? new Date(p.tgl_selesai).toLocaleDateString("id-ID", {
                              day: "2-digit", month: "short", year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-ink-soft">{p.inspektor_nama ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {p.sudah_diperiksa}
                        {kurang && (
                          <span className="text-attention" title={`Sekarang gardu ini punya ${p.tiang_aktif} tiang — ada yang ditambahkan sesudah inspeksi ditutup`}>
                            {" "}/ {p.tiang_aktif}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft">
                        {km(Number(p.panjang_km))}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${p.jumlah_temuan > 0 ? "text-attention font-semibold" : "text-ink-soft"}`}>
                        {p.jumlah_temuan}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 size={14} />
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per gardu */}
      <div className={CARD}>
        <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
          <div>
            <p className={EYEBROW}>Jaringan per gardu</p>
            <p className="text-sm text-ink-soft mt-0.5">
              Panjangnya turunan dari rangkaian tiang — tidak ada angka yang diketik.
            </p>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari gardu…"
              className="h-9 w-44 rounded-xl border border-line bg-white pl-8 pr-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15"
            />
          </div>
        </div>

        {perGarduGabung.length === 0 ? (
          <p className="text-sm text-ink-muted py-16 text-center">
            Belum ada jaringan JTR yang tercatat.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-soft border-b border-line">
                  <th className="px-4 py-2.5 font-semibold">Gardu</th>
                  <th className="px-4 py-2.5 font-semibold">ULP</th>
                  <th className="px-4 py-2.5 font-semibold">Jurusan</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Tiang</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Rute</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Penghantar</th>
                </tr>
              </thead>
              <tbody>
                {perGarduGabung.map((g) => (
                  <tr key={`${g.gardu_kode}|${g.ulp}`} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-ink">{g.gardu_kode}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{g.ulp}</td>
                    <td className="px-4 py-2.5 text-ink-soft">
                      {[...new Set(g.jurusanList)].sort().join(", ")}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{g.jumlah_tiang}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {km(Number(g.panjang_rute_km))}
                    </td>
                    {/* Penghantar hanya bisa dijumlah dari bentang yang hulunya
                        jelas. Dua hal membuatnya kurang: tiang yang kabelnya
                        belum diisi, dan kabel yang belum ketahuan datang dari
                        mana. Keduanya membuat angkanya lebih kecil dari
                        semestinya — ditandai supaya tidak dibaca sebagai
                        fakta. */}
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {kurangLengkap(g) ? (
                        <span
                          className="text-attention font-semibold"
                          title={alasanKurang(g)}
                        >
                          {km(Number(g.panjang_penghantar_km))} *
                        </span>
                      ) : (
                        <span className="text-ink-soft">{km(Number(g.panjang_penghantar_km))}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {perGarduGabung.some(kurangLengkap) && (
              <p className="px-4 py-2.5 text-xs text-attention border-t border-line">
                * Panjang penghantar belum lengkap — ada tiang yang kabelnya belum dicatat,
                atau kabel yang belum ketahuan datang dari tiang mana, sehingga bentangnya
                tidak bisa ikut dijumlah.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({
  ikon,
  label,
  nilai,
  bantu,
  perhatian,
}: {
  ikon: React.ReactNode;
  label: string;
  nilai: string;
  bantu?: string;
  perhatian?: boolean;
}) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {ikon}
        {label}
      </p>
      <p
        className={`font-display tracking-tight text-2xl mt-1.5 ${
          perhatian ? "text-attention" : "text-ink"
        }`}
      >
        {nilai}
      </p>
      {bantu && <p className="text-[11px] text-ink-muted mt-1 leading-snug">{bantu}</p>}
    </div>
  );
}
