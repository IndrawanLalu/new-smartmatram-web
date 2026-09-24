"use client";

import { Fragment } from "react";
import dynamic from "next/dynamic";
import { Calendar, GitBranch, Ruler, TriangleAlert, User } from "lucide-react";
import { EYEBROW } from "@/app/admin/_ui";
import type { Banding, InspeksiMenunggu } from "../_hooks/useApprovalJtr";
import type { TitikTiang } from "./PetaUsulan";
import UsulanTitikJtr from "./UsulanTitikJtr";
import { km, rentangKerja } from "../_lib/tampilan";

const PetaPerbandingan = dynamic(() => import("./PetaPerbandingan"), {
  ssr: false,
  loading: () => <div className="h-[420px] rounded-xl border border-line bg-surface animate-pulse" />,
});

/**
 * Isi modal persetujuan inspeksi JTR (dipindah dari tab Persetujuan Gardu,
 * 24 Sep 2026). Urutannya mengikuti cara admin memutuskan:
 *   1. peta jaringan sebelum–sesudah,
 *   2. usulan koreksi master dari inspeksi ini (kalau ada),
 *   3. angka pokok, panjang jaringan per jurusan, temuan, catatan.
 */

function Fakta({ ikon, label, nilai }: { ikon: React.ReactNode; label: string; nilai: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {ikon}
        {label}
      </p>
      <p className="text-sm font-semibold text-ink mt-1 truncate">{nilai}</p>
    </div>
  );
}

interface Props {
  aktif: InspeksiMenunggu;
  banding: Banding | null;
  galatBanding: string | null;
  oleh: string;
}

export default function IsiInspeksiJtr({ aktif, banding, galatBanding, oleh }: Props) {
  // Tiang gardu ini sebagai bukti di peta usulan titik — diambil dari data
  // perbandingan yang sudah dimuat, tanpa kueri kedua.
  const tiangPeta: TitikTiang[] = (() => {
    if (!banding) return [];
    const peta = new Map(banding.tiang.map((t) => [t.id, t]));
    return banding.tiang
      .filter((t) => t.perubahan !== "hilang" && t.lat !== null && t.lng !== null)
      .map((t) => {
        const induk = t.indukId ? peta.get(t.indukId) : null;
        return {
          kode: t.kode,
          lat: t.lat as number,
          lng: t.lng as number,
          indukLat: induk?.lat ?? null,
          indukLng: induk?.lng ?? null,
        };
      });
  })();

  return (
    <div className="space-y-4">
      {aktif.sudah_diperiksa < aktif.tiang_aktif && (
        <p className="text-xs bg-attention-tint text-attention rounded-lg px-3 py-2 font-medium">
          Gardu ini sekarang punya {aktif.tiang_aktif} tiang, tapi inspeksinya mencatat {aktif.sudah_diperiksa}. Ada
          tiang yang ditambahkan sesudah inspeksi ditutup — catatan ini tidak lagi mencakup seluruh jaringannya.
        </p>
      )}

      {galatBanding ? (
        <p className="text-sm text-amber-700">Peta jaringan gagal dimuat: {galatBanding}</p>
      ) : !banding ? (
        <div className="h-[420px] rounded-xl border border-line bg-surface animate-pulse" />
      ) : (
        <PetaPerbandingan tiang={banding.tiang} gardu={banding.gardu} garduKode={aktif.gardu_kode} />
      )}

      <UsulanTitikJtr garduKode={aktif.gardu_kode} ulp={aktif.ulp} tiang={tiangPeta} oleh={oleh} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Fakta ikon={<GitBranch size={14} />} label="Tiang" nilai={`${aktif.sudah_diperiksa} / ${aktif.tiang_aktif}`} />
        <Fakta ikon={<Ruler size={14} />} label="Panjang" nilai={km(aktif.panjang_km)} />
        <Fakta ikon={<TriangleAlert size={14} />} label="Temuan" nilai={aktif.sementara ? "—" : String(aktif.jumlah_temuan)} />
        <Fakta ikon={<Calendar size={14} />} label="Tanggal" nilai={rentangKerja(aktif.tgl_mulai, aktif.tgl_selesai)} />
      </div>

      {banding && banding.rute.length > 0 && (
        <div>
          <p className={EYEBROW}>Panjang jaringan</p>
          <div className="mt-2 rounded-xl border border-line overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface text-left text-ink-soft">
                  <th className="px-3 py-2 font-semibold">Jurusan</th>
                  <th className="px-3 py-2 font-semibold">Kabel</th>
                  <th className="px-3 py-2 font-semibold">Ukuran</th>
                  <th className="px-3 py-2 font-semibold text-right">Gawang</th>
                  <th className="px-3 py-2 font-semibold text-right">Panjang</th>
                </tr>
              </thead>
              <tbody>
                {banding.rute.map((r) => {
                  const kabel = banding.penghantar.filter((p) => p.jurusan === r.jurusan);
                  return (
                    <Fragment key={r.jurusan}>
                      {/* Rute tampil lebih dulu: panjang jalurnya dihitung sekali
                          berapa pun kabel yang lewat. */}
                      <tr className="border-t border-line bg-navy-50/60">
                        <td className="px-3 py-2 font-semibold text-ink">{r.jurusan}</td>
                        <td className="px-3 py-2 text-ink-soft" colSpan={2}>Rute jalur ({r.jumlah_tiang} tiang)</td>
                        <td className="px-3 py-2 text-right text-ink-soft">—</td>
                        <td className="px-3 py-2 text-right font-semibold text-ink tabular-nums">{km(r.panjang_rute_km, 3)}</td>
                      </tr>
                      {kabel.length === 0 ? (
                        <tr className="border-t border-line">
                          <td />
                          <td className="px-3 py-2 text-attention" colSpan={4}>Kabel belum dicatat sama sekali di jurusan ini</td>
                        </tr>
                      ) : (
                        kabel.map((p) => (
                          <tr key={`${p.nomor_kabel}-${p.ukuran}`} className="border-t border-line">
                            <td />
                            <td className="px-3 py-2 text-ink">
                              {p.nomor_kabel === 1 ? "Kabel utama" : <span className="text-navy-600 font-semibold">Underbuild {p.nomor_kabel}</span>}
                            </td>
                            <td className="px-3 py-2 text-ink-soft">{[p.jenis, p.ukuran].filter(Boolean).join(" ") || "—"}</td>
                            <td className="px-3 py-2 text-right text-ink-soft tabular-nums">{p.jumlah_gawang}</td>
                            <td className="px-3 py-2 text-right text-ink tabular-nums">{km(p.panjang_km, 3)}</td>
                          </tr>
                        ))
                      )}
                      {r.tiang_tanpa_kabel > 0 && (
                        <tr className="border-t border-line">
                          <td />
                          <td className="px-3 py-2 text-xs text-attention" colSpan={4}>
                            {r.tiang_tanpa_kabel} tiang belum dicatat kabelnya — panjang penghantar di jurusan ini belum lengkap.
                          </td>
                        </tr>
                      )}
                      {/* Bentang yang hulunya belum jelas disebut satu per satu:
                          yang berguna bagi petugas adalah nama tiangnya. */}
                      {banding.terputus
                        .filter((t) => t.jurusan === r.jurusan)
                        .map((t) => (
                          <tr key={`${t.tiang_kode}-${t.nomor_kabel}`} className="border-t border-line">
                            <td />
                            <td className="px-3 py-2 text-xs text-attention" colSpan={4}>
                              <b>{t.tiang_kode}</b> kabel ke-{t.nomor_kabel} belum jelas datang dari tiang mana, jadi bentang{" "}
                              {Math.round(Number(t.panjang_m))} m belum ikut dihitung.
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
                <tr className="border-t-2 border-line bg-surface font-semibold">
                  <td className="px-3 py-2 text-ink" colSpan={4}>Total penghantar seluruh gardu</td>
                  <td className="px-3 py-2 text-right text-ink tabular-nums">
                    {km(banding.penghantar.reduce((s, p) => s + Number(p.panjang_km), 0), 3)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm text-ink-soft">
        <User size={15} />
        {aktif.inspektor_nama ?? "—"}
        {aktif.petugas_2 ? ` · ${aktif.petugas_2}` : ""}
      </div>

      {banding && banding.temuan.length > 0 && (
        <div>
          <p className={EYEBROW}>Temuan pada inspeksi ini</p>
          <ul className="mt-2 grid sm:grid-cols-2 gap-1.5">
            {banding.temuan.map((t, i) => (
              <li key={`${t.tiang_kode}-${t.temuan}-${i}`} className="flex items-center gap-2 text-sm rounded-lg border border-line px-3 py-1.5">
                <TriangleAlert size={14} className={t.urgensi === "Tinggi" ? "text-red-600" : "text-attention"} />
                <span className="font-semibold text-ink">{t.tiang_kode}</span>
                <span className="text-ink-soft truncate">{t.temuan}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {aktif.catatan && (
        <p className="text-sm text-ink-soft">
          <span className={EYEBROW}>Catatan petugas</span>
          <br />
          {aktif.catatan}
        </p>
      )}
    </div>
  );
}
