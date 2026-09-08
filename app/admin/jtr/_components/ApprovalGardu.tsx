"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Loader2, Inbox, CheckCircle2, XCircle, GitBranch, Ruler, TriangleAlert, User, Calendar,
} from "lucide-react";
import { type CurrentUser } from "@/lib/roles";
import { CARD, BTN_PRIMARY, BTN_GHOST, EYEBROW } from "@/app/admin/_ui";

const km = (v: number) => `${Number(v).toFixed(3).replace(".", ",")} km`;
import {
  useApprovalJtr,
  ambilPerbandingan,
  type InspeksiMenunggu,
  type TiangBanding,
  type Temuan,
  type Penghantar,
  type RutePerJurusan,
  type GawangTerputus,
} from "../_hooks/useApprovalJtr";

const PetaPerbandingan = dynamic(() => import("./PetaPerbandingan"), {
  ssr: false,
  loading: () => <div className="h-[420px] rounded-xl border border-line bg-surface animate-pulse" />,
});

const tgl = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

export default function ApprovalGardu({ user }: { user: CurrentUser }) {
  const { daftar, loading, error, memproses, putuskan } = useApprovalJtr(user);
  const [dipilih, setDipilih] = useState<string | null>(null);
  const [banding, setBanding] = useState<{
    tiang: TiangBanding[];
    temuan: Temuan[];
    gardu: { lat: number; lng: number } | null;
    penghantar: Penghantar[];
    rute: RutePerJurusan[];
    terputus: GawangTerputus[];
  } | null>(null);
  const [memuatBanding, setMemuatBanding] = useState(false);
  const [catatan, setCatatan] = useState("");

  const aktif: InspeksiMenunggu | null = useMemo(
    () => daftar.find((d) => d.id === dipilih) ?? daftar[0] ?? null,
    [daftar, dipilih],
  );

  useEffect(() => {
    if (!aktif) {
      setBanding(null);
      return;
    }
    let hidup = true;
    setMemuatBanding(true);
    void (async () => {
      try {
        const hasil = await ambilPerbandingan(aktif);
        if (hidup) setBanding(hasil);
      } catch {
        if (hidup) setBanding(null);
      } finally {
        if (hidup) setMemuatBanding(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [aktif]);

  useEffect(() => setCatatan(""), [aktif?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat inspeksi…
      </div>
    );
  }

  if (daftar.length === 0) {
    return (
      <div className={`${CARD} flex flex-col items-center gap-2 py-20 text-center`}>
        <Inbox size={34} className="text-ink-muted" />
        <p className="font-semibold text-ink">Tidak ada inspeksi menunggu keputusan</p>
        <p className="text-sm text-ink-soft max-w-md">
          Gardu muncul di sini setelah petugas menandainya selesai diinspeksi dari aplikasi.
        </p>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      {/* Daftar gardu menunggu */}
      <div className="space-y-2">
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {daftar.map((d) => {
          const ini = aktif?.id === d.id;
          return (
            <button
              key={d.id}
              onClick={() => setDipilih(d.id)}
              className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors ${
                ini ? "bg-navy-600 border-navy-600 text-white" : "bg-white border-line hover:border-navy-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{d.gardu_kode}</span>
                {d.status === "Ditolak" && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                    ditolak
                  </span>
                )}
              </div>
              <p className={`text-xs mt-1 ${ini ? "text-navy-100" : "text-ink-soft"}`}>
                {d.penyulang ?? d.ulp} · {d.sudah_diperiksa} tiang
              </p>
              <p className={`text-[11px] mt-1 ${ini ? "text-navy-200" : "text-ink-muted"}`}>
                {d.inspektor_nama ?? "—"} · {tgl(d.tgl_selesai)}
              </p>
            </button>
          );
        })}
      </div>

      {/* Rincian + keputusan */}
      {aktif && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="bg-navy-600 px-4 py-3">
            <p className="text-white font-semibold leading-tight">
              {aktif.gardu_kode}
              {aktif.gardu_nama ? ` — ${aktif.gardu_nama}` : ""}
            </p>
            <p className="text-navy-100 text-xs truncate">
              {aktif.gardu_alamat || aktif.penyulang || aktif.ulp}
            </p>
          </div>

          <div className="p-4 space-y-4">
            {aktif.status === "Ditolak" && aktif.verified_note && (
              <p className="text-xs bg-red-50 text-red-700 rounded-lg px-3 py-2">
                <b>Pernah ditolak:</b> {aktif.verified_note}
              </p>
            )}

            {aktif.sudah_diperiksa < aktif.tiang_aktif && (
              <p className="text-xs bg-attention-tint text-attention rounded-lg px-3 py-2 font-medium">
                Gardu ini sekarang punya {aktif.tiang_aktif} tiang, tapi inspeksinya mencatat{" "}
                {aktif.sudah_diperiksa}. Ada tiang yang ditambahkan sesudah inspeksi ditutup —
                artinya catatan ini tidak lagi mencakup seluruh jaringannya.
              </p>
            )}

            {memuatBanding ? (
              <div className="h-[420px] rounded-xl border border-line bg-surface animate-pulse" />
            ) : banding ? (
              <PetaPerbandingan
                tiang={banding.tiang}
                gardu={banding.gardu}
                garduKode={aktif.gardu_kode}
              />
            ) : null}

            <div className="grid sm:grid-cols-4 gap-3">
              <Fakta ikon={<GitBranch size={14} />} label="Tiang" nilai={String(aktif.sudah_diperiksa)} />
              <Fakta
                ikon={<Ruler size={14} />}
                label="Panjang"
                nilai={`${Number(aktif.panjang_km).toFixed(2).replace(".", ",")} km`}
              />
              <Fakta ikon={<TriangleAlert size={14} />} label="Temuan" nilai={String(aktif.jumlah_temuan)} />
              <Fakta ikon={<Calendar size={14} />} label="Selesai" nilai={tgl(aktif.tgl_selesai)} />
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
                          <>
                            {/* Rute selalu tampil lebih dulu: itu panjang jalurnya,
                                dihitung sekali berapa pun kabel yang lewat. */}
                            <tr key={`r-${r.jurusan}`} className="border-t border-line bg-navy-50/60">
                              <td className="px-3 py-2 font-semibold text-ink">{r.jurusan}</td>
                              <td className="px-3 py-2 text-ink-soft" colSpan={2}>
                                Rute jalur ({r.jumlah_tiang} tiang)
                              </td>
                              <td className="px-3 py-2 text-right text-ink-soft">—</td>
                              <td className="px-3 py-2 text-right font-semibold text-ink tabular-nums">
                                {km(r.panjang_rute_km)}
                              </td>
                            </tr>
                            {kabel.length === 0 ? (
                              <tr key={`k-${r.jurusan}-none`} className="border-t border-line">
                                <td />
                                <td className="px-3 py-2 text-attention" colSpan={4}>
                                  Kabel belum dicatat sama sekali di jurusan ini
                                </td>
                              </tr>
                            ) : (
                              kabel.map((p) => (
                                <tr
                                  key={`k-${r.jurusan}-${p.nomor_kabel}-${p.ukuran}`}
                                  className="border-t border-line"
                                >
                                  <td />
                                  <td className="px-3 py-2 text-ink">
                                    {p.nomor_kabel === 1 ? (
                                      "Kabel utama"
                                    ) : (
                                      <span className="text-navy-600 font-semibold">
                                        Underbuild {p.nomor_kabel}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-ink-soft">
                                    {[p.jenis, p.ukuran].filter(Boolean).join(" ") || "—"}
                                  </td>
                                  <td className="px-3 py-2 text-right text-ink-soft tabular-nums">
                                    {p.jumlah_gawang}
                                  </td>
                                  <td className="px-3 py-2 text-right text-ink tabular-nums">
                                    {km(p.panjang_km)}
                                  </td>
                                </tr>
                              ))
                            )}
                            {r.tiang_tanpa_kabel > 0 && (
                              <tr key={`w-${r.jurusan}`} className="border-t border-line">
                                <td />
                                <td className="px-3 py-2 text-xs text-attention" colSpan={4}>
                                  {r.tiang_tanpa_kabel} tiang belum dicatat kabelnya — panjang
                                  penghantar di jurusan ini belum lengkap.
                                </td>
                              </tr>
                            )}
                            {/* Bentang yang hulunya belum jelas disebut satu per
                                satu, bukan dihitung saja: yang berguna bagi
                                petugas adalah nama tiangnya, karena di situlah
                                dia harus berdiri untuk membetulkannya. */}
                            {banding.terputus
                              .filter((t) => t.jurusan === r.jurusan)
                              .map((t) => (
                                <tr
                                  key={`p-${t.tiang_kode}-${t.nomor_kabel}`}
                                  className="border-t border-line"
                                >
                                  <td />
                                  <td className="px-3 py-2 text-xs text-attention" colSpan={4}>
                                    <b>{t.tiang_kode}</b> kabel ke-{t.nomor_kabel} belum jelas
                                    datang dari tiang mana, jadi bentang{" "}
                                    {Math.round(Number(t.panjang_m))} m belum ikut dihitung.
                                    Petugas perlu menunjuk tiang asalnya lewat aplikasi.
                                  </td>
                                </tr>
                              ))}
                          </>
                        );
                      })}
                      <tr className="border-t-2 border-line bg-surface font-semibold">
                        <td className="px-3 py-2 text-ink" colSpan={4}>
                          Total penghantar seluruh gardu
                        </td>
                        <td className="px-3 py-2 text-right text-ink tabular-nums">
                          {km(banding.penghantar.reduce((s, p) => s + Number(p.panjang_km), 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-ink-muted mt-1.5">
                  Rute dihitung sekali berapa pun kabel yang lewat; penghantar dijumlah per
                  kabel. Satu bentang terhitung untuk sebuah kabel bila kedua ujungnya memikul
                  kabel itu — atau bila tiang asalnya ditunjuk sendiri, untuk kabel yang
                  datang dari jalur lain.
                </p>
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
                    <li
                      key={`${t.tiang_kode}-${t.temuan}-${i}`}
                      className="flex items-center gap-2 text-sm rounded-lg border border-line px-3 py-1.5"
                    >
                      <TriangleAlert
                        size={14}
                        className={t.urgensi === "Tinggi" ? "text-red-600" : "text-attention"}
                      />
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

            <div className="border-t border-line pt-4 space-y-3">
              <input
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Catatan (wajib kalau menolak)"
                className="w-full h-9 rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15"
              />
              <div className="flex gap-2">
                <button
                  className={BTN_PRIMARY}
                  disabled={memproses === aktif.id}
                  onClick={() => void putuskan(aktif.id, true, catatan || undefined)}
                >
                  {memproses === aktif.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  Setujui inspeksi gardu ini
                </button>
                <button
                  className={`${BTN_GHOST} text-red-600 border-red-200 hover:bg-red-50`}
                  disabled={memproses === aktif.id || !catatan.trim()}
                  title={!catatan.trim() ? "Isi alasan dulu" : undefined}
                  onClick={() => void putuskan(aktif.id, false, catatan)}
                >
                  <XCircle size={16} />
                  Tolak
                </button>
              </div>
              <p className="text-[11px] text-ink-muted">
                Menyetujui berarti pekerjaan di gardu ini dinyatakan benar dan sesuai. Menolak
                mengembalikannya ke petugas — karena itu alasannya diminta lebih dulu.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
