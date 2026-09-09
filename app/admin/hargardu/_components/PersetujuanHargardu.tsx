"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Loader2, Inbox, CheckCircle2, XCircle, TriangleAlert, User, Calendar,
  Camera, ShieldCheck, Wrench, ClipboardList,
} from "lucide-react";
import { type CurrentUser } from "@/lib/roles";
import { CARD, BTN_PRIMARY, BTN_GHOST, EYEBROW, FIELD } from "@/app/admin/_ui";
import {
  useHargarduApproval,
  ambilRincian,
  ketidakseimbangan,
  type PemeliharaanMenunggu,
  type Rincian,
  type UsulanSpek,
} from "../_hooks/useHargarduApproval";

const tgl = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "—";

/**
 * Minta Supabase memperkecil gambarnya SEBELUM dikirim ke browser.
 *
 * Foto lapangan berukuran 3072x4096 — 12,6 megapiksel. Dikompres, ya, tapi
 * kompresi cuma menekan ukuran BERKAS; yang membuat browser berat adalah jumlah
 * PIKSEL yang harus dibongkar. Empat belas foto berarti 176 megapiksel dan
 * sekitar 700 MB bitmap di memori, hanya untuk digambar setinggi 80 piksel —
 * itulah yang membuat menggulir terasa tersendat.
 *
 * Menukar `/object/public/` jadi `/render/image/public/` membuat Supabase yang
 * mengecilkannya: 1.135 KB jadi 95 KB, dan pikselnya turun ratusan kali.
 * Tautan "buka" tetap menunjuk berkas aslinya — admin yang ingin membaca nomor
 * seri di nama plat butuh ketelitian penuh.
 */
const kecilkan = (url: string, lebar: number) =>
  url.includes("/object/public/")
    ? `${url.replace("/object/public/", "/render/image/public/")}?width=${lebar}&quality=65`
    : url;

const NAMA_FIELD: Record<string, string> = {
  daya: "Daya (kVA)", merk: "Merk", no_seri: "Nomor seri",
  tahun_pembuatan: "Tahun", jenis_gardu: "Jenis gardu", phase: "Phase",
  tegangan_primer: "Tegangan primer", tegangan_sekunder: "Tegangan sekunder",
  arus_primer: "Arus primer", arus_sekunder: "Arus sekunder", vector: "Vector",
  jenis_minyak: "Jenis minyak", volume_minyak: "Volume minyak",
  berat_total: "Berat total", tapping: "Tapping", pendingin: "Pendingin",
  nama: "Nama gardu", alamat: "Alamat",
};

export default function PersetujuanHargardu({ user }: { user: CurrentUser }) {
  const { daftar, loading, error, memproses, putuskan, putuskanUsulan, muat } =
    useHargarduApproval(user);
  const [dipilih, setDipilih] = useState<string | null>(null);
  const [rincian, setRincian] = useState<Rincian | null>(null);
  const [memuatRincian, setMemuatRincian] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [sudahDiputus, setSudahDiputus] = useState<Record<string, "disetujui" | "ditolak">>({});

  const aktif: PemeliharaanMenunggu | null = useMemo(
    () => daftar.find((d) => d.id === dipilih) ?? daftar[0] ?? null,
    [daftar, dipilih],
  );

  useEffect(() => {
    if (!aktif) {
      setRincian(null);
      return;
    }
    let hidup = true;
    setMemuatRincian(true);
    setSudahDiputus({});
    void (async () => {
      try {
        const hasil = await ambilRincian(aktif.id);
        if (hidup) setRincian(hasil);
      } finally {
        if (hidup) setMemuatRincian(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [aktif?.id]);

  const perKelompok = useMemo(() => {
    if (!rincian) return [];
    const m = new Map<string, typeof rincian.periksa>();
    for (const p of rincian.periksa) {
      const d = m.get(p.kelompok) ?? [];
      d.push(p);
      m.set(p.kelompok, d);
    }
    return [...m.entries()];
  }, [rincian]);

  const temuan = useMemo(
    () => (rincian?.periksa ?? []).filter((p) => !p.normal),
    [rincian],
  );

  const sebelum = rincian?.ukur.find((u) => u.tahap === "sebelum");
  const sesudah = rincian?.ukur.find((u) => u.tahap === "sesudah");
  const kA = ketidakseimbangan(sebelum);
  const kB = ketidakseimbangan(sesudah);

  const usulanMenunggu = useMemo(
    () => (rincian?.usulan ?? []).filter((u) => u.status === "menunggu" && !sudahDiputus[u.id]),
    [rincian, sudahDiputus],
  );

  async function putusUsulan(u: UsulanSpek, setuju: boolean) {
    const ok = await putuskanUsulan(
      u.id,
      setuju,
      setuju ? "Nama plat terbaca saat pemeliharaan" : "Ditolak admin",
    );
    if (ok) setSudahDiputus((s) => ({ ...s, [u.id]: setuju ? "disetujui" : "ditolak" }));
  }

  async function putusPekerjaan(setuju: boolean) {
    if (!aktif) return;
    if (!setuju && !catatan.trim()) return;
    const ok = await putuskan(aktif.id, setuju, catatan.trim() || undefined);
    if (ok) {
      setCatatan("");
      setDipilih(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat pemeliharaan…
      </div>
    );
  }

  if (daftar.length === 0) {
    return (
      <div className={`${CARD} p-12 flex flex-col items-center gap-3 text-center`}>
        <Inbox size={38} className="text-ink-muted" />
        <p className="text-ink font-semibold">Tidak ada pemeliharaan yang menunggu</p>
        <p className="text-sm text-ink-soft max-w-md">
          Pekerjaan muncul di sini setelah regu menekan “Selesai &amp; kirim” di aplikasi.
        </p>
        <button onClick={() => void muat()} className={BTN_GHOST}>
          Muat ulang
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      {/* Daftar pekerjaan yang menunggu */}
      <div className={`${CARD} overflow-hidden h-fit`}>
        <div className="px-4 py-3 border-b border-line">
          <p className={EYEBROW}>Menunggu keputusan</p>
          <p className="text-sm text-ink-soft mt-0.5">{daftar.length} pemeliharaan</p>
        </div>
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-line">
          {daftar.map((d) => {
            const pilih = aktif?.id === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setDipilih(d.id)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  pilih ? "bg-navy-50" : "hover:bg-surface"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{d.gardu_kode}</span>
                  {d.status === "Ditolak" && (
                    <span className="text-[11px] font-semibold text-danger">dikembalikan</span>
                  )}
                </div>
                <p className="text-xs text-ink-soft truncate">{d.gardu_nama ?? "—"}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-ink-muted">
                  <span>{tgl(d.tgl_selesai)}</span>
                  {d.item_tidak_normal > 0 && (
                    <span className="text-attention font-semibold">
                      {d.item_tidak_normal} tidak normal
                    </span>
                  )}
                  {d.usulan_menunggu > 0 && (
                    <span className="text-navy-600 font-semibold">
                      {d.usulan_menunggu} koreksi master
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Rincian */}
      {aktif && (
        <div className={`${CARD} p-5 space-y-5`}>
          <div>
            <h2 className="text-xl font-semibold text-ink">{aktif.gardu_kode}</h2>
            <p className="text-sm text-ink-soft">
              {aktif.gardu_nama ?? "—"}
              {aktif.penyulang ? ` · penyulang ${aktif.penyulang}` : ""}
              {aktif.daya_master ? ` · ${aktif.daya_master} kVA` : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Fakta ikon={<User size={14} />} label="Regu"
              nilai={[...(aktif.regu_1 ?? []), ...(aktif.regu_2 ?? [])].join(", ") || (aktif.petugas_nama ?? "—")} />
            <Fakta ikon={<Calendar size={14} />} label="Selesai" nilai={tgl(aktif.tgl_selesai)} />
            <Fakta ikon={<TriangleAlert size={14} />} label="Tidak normal"
              nilai={String(aktif.item_tidak_normal)} />
            <Fakta ikon={<Camera size={14} />} label="Foto"
              nilai={`${aktif.jumlah_foto} / ${aktif.foto_wajib} wajib`} />
          </div>

          {memuatRincian && (
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <Loader2 size={16} className="animate-spin" /> Memuat rincian…
            </div>
          )}

          {rincian && (
            <>
              {/* ── Koreksi master: paling atas, karena inilah alasan modul ini ada ── */}
              {usulanMenunggu.length > 0 && (
                <section className="rounded-xl border-2 border-navy-300 bg-navy-50/50 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-navy-600" />
                    <p className="text-sm font-semibold text-navy-600">
                      {usulanMenunggu.length} data berbeda dari master gardu
                    </p>
                  </div>
                  <p className="text-xs text-ink-soft mt-1">
                    Master <b>belum berubah</b>. Nilai yang berbeda berarti trafonya pernah
                    diganti atau master salah sejak awal — diputuskan satu per satu, bukan
                    ikut terbawa persetujuan pekerjaannya.
                  </p>

                  <div className="mt-3 space-y-2">
                    {usulanMenunggu.map((u) => (
                      <div
                        key={u.id}
                        className="flex flex-wrap items-center gap-3 rounded-lg bg-white border border-line p-3"
                      >
                        <div className="flex-1 min-w-[180px]">
                          <p className="text-xs font-semibold text-ink-soft">
                            {NAMA_FIELD[u.field] ?? u.field}
                          </p>
                          <p className="text-sm text-ink mt-0.5">
                            <span className="line-through text-ink-muted">
                              {u.nilai_lama ?? "kosong"}
                            </span>
                            {" → "}
                            <b className="text-navy-600">{u.nilai_baru}</b>
                          </p>
                        </div>
                        {u.bukti_foto.length > 0 && (
                          <a href={u.bukti_foto[0]} target="_blank" rel="noreferrer" title="Buka ukuran penuh">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={kecilkan(u.bukti_foto[0], 160)}
                              alt="Nama plat"
                              width={160}
                              height={120}
                              loading="lazy"
                              decoding="async"
                              className="w-20 h-16 object-cover rounded-md border border-line"
                            />
                          </a>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => void putusUsulan(u, true)}
                            disabled={memproses === u.id}
                            className={BTN_PRIMARY}
                          >
                            <CheckCircle2 size={15} /> Setujui
                          </button>
                          <button
                            onClick={() => void putusUsulan(u, false)}
                            disabled={memproses === u.id}
                            className={BTN_GHOST}
                          >
                            <XCircle size={15} /> Tolak
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {Object.keys(sudahDiputus).length > 0 && (
                <p className="text-xs text-ink-soft">
                  {Object.values(sudahDiputus).filter((v) => v === "disetujui").length} koreksi
                  disetujui ·{" "}
                  {Object.values(sudahDiputus).filter((v) => v === "ditolak").length} ditolak
                </p>
              )}

              {/* ── Temuan ── */}
              <section>
                <p className={EYEBROW}>
                  {temuan.length > 0
                    ? `${temuan.length} keadaan tidak normal`
                    : "Tidak ada keadaan tidak normal"}
                </p>
                {temuan.length > 0 && (
                  <div className="mt-2 rounded-xl border border-attention/40 bg-attention-tint/40 p-3 space-y-1">
                    {temuan.map((t, i) => (
                      <p key={i} className="text-sm text-ink">
                        <b>{t.itemNama}</b>
                        {t.fasa !== "-" ? ` fasa ${t.fasa}` : ""}: {t.nilaiLabel}
                        {t.catatan ? ` — ${t.catatan}` : ""}
                      </p>
                    ))}
                    <p className="text-[11px] text-ink-muted pt-1">
                      Sesudah disetujui, ini otomatis jadi daftar pekerjaan tertunda gardu
                      tersebut — dan hilang sendiri saat pemeliharaan berikutnya mencatatnya
                      normal.
                    </p>
                  </div>
                )}
              </section>

              {/* ── Pengukuran ── */}
              <section>
                <p className={EYEBROW}>Pengukuran siang</p>
                <div className="mt-2 rounded-xl border border-line overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface text-left text-ink-soft">
                        <th className="px-3 py-2 font-semibold">Tahap</th>
                        <th className="px-3 py-2 font-semibold text-right">R</th>
                        <th className="px-3 py-2 font-semibold text-right">S</th>
                        <th className="px-3 py-2 font-semibold text-right">T</th>
                        <th className="px-3 py-2 font-semibold text-right">N</th>
                        <th className="px-3 py-2 font-semibold text-right">Tidak seimbang</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["sebelum", "sesudah"] as const).map((t) => {
                        const u = t === "sebelum" ? sebelum : sesudah;
                        const k = t === "sebelum" ? kA : kB;
                        return (
                          <tr key={t} className="border-t border-line">
                            <td className="px-3 py-2 capitalize text-ink">{t}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{u?.arus_r ?? "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{u?.arus_s ?? "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{u?.arus_t ?? "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{u?.arus_n ?? "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {k === null ? "—" : `${k.toFixed(1)}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {kA !== null && kB !== null && (
                  <p
                    className={`text-xs mt-1.5 font-semibold ${
                      kB < kA ? "text-success" : kB > kA ? "text-attention" : "text-ink-soft"
                    }`}
                  >
                    Ketidakseimbangan {kA.toFixed(1)}% → {kB.toFixed(1)}%{" "}
                    {kB < kA ? "(membaik)" : kB > kA ? "(memburuk)" : "(tetap)"} — dihitung dari
                    dua pengukuran, tidak diketik siapa pun.
                  </p>
                )}
                <p className="text-[11px] text-ink-muted mt-1">
                  Pengukuran siang. <b>Tidak</b> masuk realisasi pengukuran gardu, yang memakai
                  beban puncak.
                </p>
              </section>

              {/* ── Hasil pemeriksaan lengkap ── */}
              <section>
                <p className={EYEBROW}>Hasil pemeriksaan</p>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {perKelompok.map(([kel, isi]) => (
                    <div key={kel} className="rounded-xl border border-line p-3">
                      <p className="text-xs font-semibold text-navy-600">{kel}</p>
                      <div className="mt-1.5 space-y-0.5">
                        {isi.map((p, i) => (
                          <p
                            key={i}
                            className={`text-sm ${p.normal ? "text-ink-soft" : "text-attention font-semibold"}`}
                          >
                            {p.itemNama}
                            {p.fasa !== "-" ? ` ${p.fasa}` : ""}:{" "}
                            {p.nilaiLabel ??
                              (p.nilaiAngka !== null
                                ? `${p.nilaiAngka}${p.satuan ? ` ${p.satuan}` : ""}`
                                : "—")}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Foto ── */}
              {rincian.foto.length > 0 && (
                <section>
                  <p className={EYEBROW}>Foto bukti</p>
                  <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {rincian.foto.map((f) => (
                      <a
                        key={f.slot}
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group rounded-lg overflow-hidden border border-line"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={kecilkan(f.url, 240)}
                          alt={f.nama}
                          width={240}
                          height={180}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-20 object-cover group-hover:opacity-85 transition-opacity"
                        />
                        <p className="text-[10px] text-ink-soft px-1.5 py-1 truncate">{f.nama}</p>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {(aktif.catatan_perbaikan || aktif.pr_keterangan) && (
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {aktif.catatan_perbaikan && (
                    <div className="rounded-xl border border-line p-3">
                      <p className="text-xs font-semibold text-ink-soft flex items-center gap-1.5">
                        <Wrench size={13} /> Catatan perbaikan
                      </p>
                      <p className="text-sm text-ink mt-1">{aktif.catatan_perbaikan}</p>
                    </div>
                  )}
                  {aktif.pr_keterangan && (
                    <div className="rounded-xl border border-attention/40 bg-attention-tint/30 p-3">
                      <p className="text-xs font-semibold text-attention flex items-center gap-1.5">
                        <ClipboardList size={13} /> PR — belum bisa diselesaikan
                      </p>
                      <p className="text-sm text-ink mt-1">{aktif.pr_keterangan}</p>
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {/* ── Keputusan ── */}
          <section className="border-t border-line pt-4 space-y-2">
            <label className={EYEBROW}>Catatan keputusan</label>
            <input
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Wajib diisi kalau menolak — regu perlu tahu apa yang harus diperbaiki"
              className={`${FIELD} w-full`}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => void putusPekerjaan(true)}
                disabled={memproses === aktif.id}
                className={BTN_PRIMARY}
              >
                {memproses === aktif.id ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                Setujui pemeliharaan
              </button>
              <button
                onClick={() => void putusPekerjaan(false)}
                disabled={memproses === aktif.id || !catatan.trim()}
                className={BTN_GHOST}
                title={!catatan.trim() ? "Isi catatan dulu — penolakan harus beralasan" : ""}
              >
                <XCircle size={15} /> Kembalikan ke regu
              </button>
            </div>
            <p className="text-[11px] text-ink-muted">
              Menyetujui menandai master gardu ini sudah dikonfirmasi orang yang berdiri di
              bawahnya. Mengembalikan membuat gardu muncul lagi di daftar tugas regu, dan
              usulan koreksi yang lahir dari pekerjaan ini ikut gugur.
            </p>
          </section>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

function Fakta({
  ikon,
  label,
  nilai,
}: {
  ikon: React.ReactNode;
  label: string;
  nilai: string;
}) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-[11px] text-ink-muted flex items-center gap-1.5">
        {ikon} {label}
      </p>
      <p className="text-sm font-semibold text-ink mt-1 truncate" title={nilai}>
        {nilai}
      </p>
    </div>
  );
}
