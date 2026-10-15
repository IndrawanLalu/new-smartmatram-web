"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { CurrentUser } from "@/lib/roles";
import { BULAN, JENIS_KINERJA } from "../_hooks/useKinerjaYantek";
import IkonKolom from "@/app/admin/_kit/IkonKolom";

/**
 * Atur SLA — target bulanan per ULP per jenis pekerjaan (keputusan user
 * 25 Sep 2026): angka BULANAN yang berlaku mulai bulan yang dipilih sampai
 * diubah lagi. Mengubahnya tidak menulis ulang bulan-bulan sebelumnya —
 * riwayatnya tetap, jadi rekap bulan lalu tetap dibandingkan dengan SLA yang
 * berlaku waktu itu.
 *
 * Yang boleh: UP3 (semua ULP) dan admin ULP itu sendiri — dijaga database.
 * Mengosongkan isian yang tadinya berisi = "tanpa SLA mulai bulan ini".
 *
 * Masa garansi (12 Okt 2026, wo-daftar-garansi.sql): bulan sejak pekerjaan
 * selesai; objek yang di-WO-kan lagi dalam masa ini diberi peringatan.
 * Kosong = 1 bulan. Hanya untuk pekerjaan yang ber-WO per objek.
 */

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];
/** Jenis yang punya masa garansi (`garansi_objek`/`garansi_item`). */
const BERGARANSI = new Set(["perabasan", "jtm", "jtm2", "jtr", "hargardu", "pengukuran"]);
const dua = (n: number) => String(n).padStart(2, "0");

interface BarisSla {
  kunci: string;
  berlaku_mulai: string;
  target: number | string | null;
  garansi_bulan: number | null;
}

interface Props {
  user: CurrentUser;
  ulpAwal: string | null;
  onTutup: () => void;
  onTersimpan: () => void;
}

const namaBulan = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${BULAN[m - 1]} ${y}`;
};

export default function AturSlaModal({ user, ulpAwal, onTutup, onTersimpan }: Props) {
  const toast = useToast();
  const up3 = user.role === "UP3";
  const sekarang = new Date();
  const [ulp, setUlp] = useState(up3 ? (ulpAwal ?? UNIT[0]) : (user.unit ?? "").toUpperCase());
  const [bulan, setBulan] = useState(`${sekarang.getFullYear()}-${dua(sekarang.getMonth() + 1)}`);
  const [riwayat, setRiwayat] = useState<BarisSla[] | null>(null);
  const [isi, setIsi] = useState<Record<string, string>>({});
  const [isiGaransi, setIsiGaransi] = useState<Record<string, string>>({});
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    supabaseBrowser
      .from("sla_kinerja")
      .select("kunci,berlaku_mulai,target,garansi_bulan")
      .eq("ulp", ulp)
      .order("berlaku_mulai", { ascending: false })
      .then(({ data, error }) => {
        if (!hidup) return;
        setGalat(error ? error.message : null);
        setRiwayat(error ? [] : ((data ?? []) as BarisSla[]));
      });
    return () => { hidup = false; };
  }, [ulp]);

  /** SLA yang berlaku di bulan terpilih, per jenis. */
  const berlaku = useMemo(() => {
    const awal = `${bulan}-01`;
    const hasil: Record<string, { target: number | null; garansi: number | null; sejak: string } | null> = {};
    for (const j of JENIS_KINERJA) {
      const r = (riwayat ?? []).find((x) => x.kunci === j.kunci && x.berlaku_mulai <= awal);
      hasil[j.kunci] = r
        ? { target: r.target === null ? null : Number(r.target), garansi: r.garansi_bulan ?? null, sejak: r.berlaku_mulai }
        : null;
    }
    return hasil;
  }, [riwayat, bulan]);

  // Isian dimulai dari SLA yang berlaku; diganti setiap ULP/bulan berganti.
  useEffect(() => {
    if (riwayat === null) return;
    const awal: Record<string, string> = {};
    const awalGaransi: Record<string, string> = {};
    for (const j of JENIS_KINERJA) {
      const b = berlaku[j.kunci];
      awal[j.kunci] = b?.target !== null && b?.target !== undefined ? String(b.target).replace(".", ",") : "";
      awalGaransi[j.kunci] = b?.garansi !== null && b?.garansi !== undefined ? String(b.garansi) : "";
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- isian awal mengikuti data yang baru dimuat
    setIsi(awal);
    setIsiGaransi(awalGaransi);
  }, [berlaku, riwayat]);

  const angka = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const salahGaransi = (k: string) => {
    const v = angka(isiGaransi[k] ?? "");
    return v !== null && (!Number.isInteger(v) || v < 0 || v > 24);
  };
  const salahSla = (k: string) => {
    const v = angka(isi[k] ?? "");
    return v !== null && (!Number.isFinite(v) || v < 0);
  };
  const salah = JENIS_KINERJA.filter((j) => salahSla(j.kunci) || salahGaransi(j.kunci));

  /** Hanya yang BERUBAH dari SLA yang berlaku yang dikirim. */
  const perubahan = useMemo(() => {
    const p: Record<string, number | null> = {};
    for (const j of JENIS_KINERJA) {
      const baru = angka(isi[j.kunci] ?? "");
      const lama = berlaku[j.kunci]?.target ?? null;
      if (baru !== lama && !(baru === null && lama === null)) p[j.kunci] = baru;
    }
    return p;
  }, [isi, berlaku]);
  const perubahanGaransi = useMemo(() => {
    const p: Record<string, number | null> = {};
    for (const j of JENIS_KINERJA) {
      if (!BERGARANSI.has(j.kunci)) continue;
      const baru = angka(isiGaransi[j.kunci] ?? "");
      const lama = berlaku[j.kunci]?.garansi ?? null;
      if (baru !== lama) p[j.kunci] = baru;
    }
    return p;
  }, [isiGaransi, berlaku]);
  const jumlahUbah = new Set([...Object.keys(perubahan), ...Object.keys(perubahanGaransi)]).size;

  const simpan = async () => {
    setSibuk(true);
    const { error } = await supabaseBrowser.rpc("simpan_sla_kinerja", {
      p_ulp: ulp,
      p_berlaku_mulai: `${bulan}-01`,
      p_isi: perubahan,
      p_oleh: user.name ?? user.email,
      p_garansi: perubahanGaransi,
    });
    setSibuk(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`SLA ${ulp} tersimpan, berlaku mulai ${namaBulan(`${bulan}-01`)}.`);
    onTersimpan();
    onTutup();
  };

  const footer = (
    <>
      <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
      <button
        onClick={() => void simpan()}
        className={BTN_PRIMARY}
        disabled={sibuk || jumlahUbah === 0 || salah.length > 0 || riwayat === null}
      >
        {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        Simpan{jumlahUbah > 0 ? ` (${jumlahUbah})` : ""}
      </button>
    </>
  );

  return (
    <ModalShell
      title="Atur SLA"
      subtitle="Target bulanan per ULP — berlaku mulai bulan yang dipilih sampai diubah lagi"
      maxWidth="max-w-3xl"
      onClose={onTutup}
      footer={footer}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-ink-soft">
          ULP
          <select
            value={ulp}
            onChange={(e) => { setRiwayat(null); setUlp(e.target.value); }}
            className={`${FIELD} w-[170px] mt-1 block`}
            disabled={!up3}
          >
            {(up3 ? UNIT : [ulp]).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-soft">
          Berlaku mulai
          <input
            type="month"
            value={bulan}
            onChange={(e) => e.target.value && setBulan(e.target.value)}
            className={`${FIELD} w-[170px] mt-1 block`}
          />
        </label>
      </div>

      {galat && <p className="text-xs text-amber-700">SLA gagal dibaca: {galat}</p>}

      <div className="rounded-xl border border-line overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead className="kepala-kit bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink border-b border-slate-300"><IkonKolom teks="Jenis pekerjaan" />Jenis pekerjaan</th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-ink border-b border-slate-300 w-[190px]"><IkonKolom teks="SLA per bulan" />SLA per bulan</th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-ink border-b border-slate-300 w-[170px]">Masa garansi</th>
            </tr>
          </thead>
          <tbody>
            {JENIS_KINERJA.map((j) => {
              const b = berlaku[j.kunci];
              const ubah = j.kunci in perubahan;
              return (
                <tr key={j.kunci} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-ink">{j.jenis}</p>
                    <p className="text-[11px] text-ink-muted">
                      {riwayat === null
                        ? "memuat…"
                        : b
                          ? b.target === null
                            ? `tanpa SLA sejak ${namaBulan(b.sejak)}`
                            : `berlaku sejak ${namaBulan(b.sejak)}`
                          : "belum pernah diisi"}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <input
                        inputMode="decimal"
                        value={isi[j.kunci] ?? ""}
                        onChange={(e) => setIsi((x) => ({ ...x, [j.kunci]: e.target.value }))}
                        placeholder="—"
                        disabled={riwayat === null}
                        className={`${FIELD} w-[100px] text-right tabular-nums ${
                          salahSla(j.kunci) ? "border-red-400" : ubah ? "border-navy-400 bg-navy-50/40" : ""
                        }`}
                      />
                      <span className="text-[11px] text-ink-muted w-[64px]">{j.satuan}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {BERGARANSI.has(j.kunci) ? (
                      <div className="flex items-center justify-end gap-2">
                        <input
                          inputMode="numeric"
                          value={isiGaransi[j.kunci] ?? ""}
                          onChange={(e) => setIsiGaransi((x) => ({ ...x, [j.kunci]: e.target.value }))}
                          placeholder="1"
                          disabled={riwayat === null}
                          className={`${FIELD} w-[64px] text-right tabular-nums ${
                            salahGaransi(j.kunci) ? "border-red-400" : j.kunci in perubahanGaransi ? "border-navy-400 bg-navy-50/40" : ""
                          }`}
                        />
                        <span className="text-[11px] text-ink-muted w-[40px]">bulan</span>
                      </div>
                    ) : (
                      <p className="text-right text-[11px] text-ink-muted">—</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-soft leading-relaxed">
        Angka per <b>bulan</b>. Rekap seluruh tahun menjumlahkan SLA bulanannya, dan “Semua ULP”
        menjumlahkan SLA tiap ULP. Mengosongkan isian yang tadinya berisi = tanpa SLA mulai bulan
        ini. Bulan-bulan sebelumnya tetap memakai SLA yang berlaku waktu itu.
      </p>
      <p className="text-[11px] text-ink-soft leading-relaxed">
        <b>Masa garansi</b> dihitung sejak pekerjaan selesai (yang belum selesai: sejak bulan WO-nya).
        Segmen atau gardu yang di-WO-kan lagi dalam masa ini tetap boleh, tetapi diberi peringatan di
        Susun WO dan tabel WO. Kosong = 1 bulan; 0 = tanpa peringatan.
      </p>
    </ModalShell>
  );
}
