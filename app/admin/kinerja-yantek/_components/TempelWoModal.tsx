"use client";

import { useMemo, useState } from "react";
import { Check, FileDown, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { bacaTempelan, tierDari, type BarisTempel } from "../_lib/tempelWo";
import { fmtAngka, JENIS_SURAT, kolomLampiran, labelBulan } from "../_lib/woSurat";
import HasilTempel, { type HasilRpc } from "./HasilTempel";

/**
 * Tempel WO dari Excel (keputusan user 29 Sep 2026). Kolom mengikuti format
 * jenisnya — gardu, KMS, atau Pemeliharaan Jaringan — sama dengan kolom
 * lampiran surat. Yang punya modul langsung menjadi WO modulnya (tampil di
 * HP); yang belum, ke `wo_manual`. Hasilnya DIBERITAHUKAN: berapa masuk,
 * mana yang dilewati (sudah ada di WO), mana yang ditolak (tidak ada di master).
 *
 * Inspeksi JTM: satu tempelan boleh berisi Tier 1 dan Tier 2 — dipisah dari
 * kolom keterangan; tanpa keterangan ikut tier baris yang tombolnya ditekan.
 */

interface Props {
  ulp: string;
  tahun: number;
  bulan: number;
  kunci: string;
  oleh: string;
  onTutup: () => void;
  onTersimpan: () => void;
}

const PRATINJAU = 30;

export default function TempelWoModal({ ulp, tahun, bulan, kunci, oleh, onTutup, onTersimpan }: Props) {
  const toast = useToast();
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [hasilRpc, setHasilRpc] = useState<{ jenis: string; h: HasilRpc }[] | null>(null);
  const jenis = JENIS_SURAT.find((j) => j.kunci === kunci)!;
  const kolom = kolomLampiran(jenis);
  const jtm = kunci === "jtm" || kunci === "jtm2";
  const hasil = useMemo(() => (teks.trim() ? bacaTempelan(teks, tahun, bulan) : null), [teks, tahun, bulan]);

  /** Kelompok yang akan disimpan: kunci → baris. */
  const kelompok = useMemo(() => {
    const g = new Map<string, BarisTempel[]>();
    for (const b of hasil?.baris ?? []) {
      const k = jtm ? (tierDari(b.keterangan, kunci === "jtm2" ? 2 : 1) === 2 ? "jtm2" : "jtm") : kunci;
      g.set(k, [...(g.get(k) ?? []), b]);
    }
    return g;
  }, [hasil, jtm, kunci]);

  const template = async () => {
    const { unduhTemplate } = await import("../_lib/unduhTemplate");
    await unduhTemplate(jenis, jtm);
  };

  const simpan = async () => {
    setSibuk(true);
    // Penyulang salah satu saja → SELURUH tempelan ditahan (keputusan user).
    // Diperiksa sekali untuk semua baris, sebelum apa pun disimpan — JTM
    // Tier 1 dan Tier 2 disimpan terpisah, dan tidak boleh masuk setengah.
    if (jenis.penyulang) {
      const { data, error } = await supabaseBrowser.rpc("cek_tempel_penyulang", { p_ulp: ulp, p_item: hasil?.baris ?? [] });
      if (error) {
        setSibuk(false);
        toast.error(error.message);
        return;
      }
      const salah = (data ?? []) as HasilRpc["ditolak"];
      if (salah.length > 0) {
        setSibuk(false);
        setHasilRpc([{ jenis: kunci, h: { ditahan: true, masuk: 0, manual: 0, segmen_baru: 0, tanpa_regu: 0, dilewati: [], ditolak: salah } }]);
        return;
      }
    }
    const semua: { jenis: string; h: HasilRpc }[] = [];
    for (const [k, baris] of kelompok) {
      const { data, error } = await supabaseBrowser.rpc("tempel_wo", {
        p_ulp: ulp, p_tahun: tahun, p_bulan: bulan, p_jenis: k, p_item: baris, p_oleh: oleh,
      });
      if (error) {
        setSibuk(false);
        toast.error(`${JENIS_SURAT.find((j) => j.kunci === k)?.nama}: ${error.message}`);
        if (semua.length > 0) onTersimpan();
        return;
      }
      semua.push({ jenis: k, h: data as HasilRpc });
    }
    setSibuk(false);
    onTersimpan();
    setHasilRpc(semua);
  };

  if (hasilRpc) {
    return (
      <ModalShell
        title="Hasil tempel WO"
        subtitle={`ULP ${ulp} · ${labelBulan(tahun, bulan)}`}
        maxWidth="max-w-3xl"
        onClose={onTutup}
        footer={<button onClick={onTutup} className={`${BTN_PRIMARY} ml-auto`}>Selesai</button>}
      >
        {hasilRpc.map((r) => <HasilTempel key={r.jenis} jenis={r.jenis} h={r.h} />)}
      </ModalShell>
    );
  }

  const footer = (
    <>
      <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
      <button onClick={() => void simpan()} className={BTN_PRIMARY} disabled={sibuk || !hasil || !!hasil.galat}>
        {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        Simpan {hasil && !hasil.galat ? `(${hasil.baris.length} baris)` : ""}
      </button>
    </>
  );

  return (
    <ModalShell
      title={`Tempel ${jtm ? "WO Inspeksi JTM (Tier 1 & 2)" : jenis.nama}`}
      subtitle={`ULP ${ulp} · ${labelBulan(tahun, bulan)}`}
      maxWidth="max-w-4xl"
      onClose={onTutup}
      footer={footer}
    >
      <div className="rounded-xl border border-line bg-surface/60 px-3 py-2 text-xs text-ink-soft leading-relaxed">
        <button onClick={() => void template()} className={`${BTN_GHOST} float-right ml-3 mb-1`}>
          <FileDown size={14} /> Unduh template
        </button>
        <p>
          Salin blok tabel di Excel <b>termasuk baris judul kolomnya</b>, lalu tempel di bawah. Kolom:{" "}
          <b className="text-ink">{kolom.map((k) => k.label.toLowerCase()).join(" · ")}</b>
          {jtm && " (keterangan: Tier 1 / Tier 2)"}. Tanggal kerja dibagi rata otomatis.
        </p>
        <p className="mt-1">
          {jenis.modul
            ? "Masuk sebagai WO modulnya dan tampil di HP regu. Yang sudah ada di WO bulan ini dilewati; baris lama tidak dihapus — pembatalan lewat modulnya."
            : "Modulnya belum ada: tempelan ini MENGGANTIKAN tempelan sebelumnya untuk bulan ini (centang realisasi objek yang sama tetap)."}
        </p>
      </div>
      <textarea
        value={teks}
        onChange={(e) => setTeks(e.target.value)}
        rows={6}
        placeholder="Tempel di sini…"
        className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-navy-500"
      />

      {hasil?.galat && <p className="text-xs text-red-600">{hasil.galat}</p>}

      {hasil && !hasil.galat && (
        <>
          <div className="flex flex-wrap gap-2 text-[11px] text-ink-soft">
            {Object.entries(hasil.dikenali).map(([k, h]) => (
              <span key={k} className="px-2 py-0.5 rounded-full bg-surface border border-line">{h} → {k}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {[...kelompok].map(([k, b]) => {
              const j = JENIS_SURAT.find((x) => x.kunci === k)!;
              const jumlah = j.km ? b.reduce((a, x) => a + (x.km ?? 0), 0) : b.length;
              return (
                <span key={k} className="font-semibold text-ink">
                  {j.nama}: {fmtAngka(jumlah, j.km)} {j.satuan} ({b.length} baris)
                </span>
              );
            })}
          </div>
          <div className="rounded-xl border border-line overflow-auto max-h-[40vh]">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 sticky top-0">
                <tr className="text-left">
                  {kolom.map((k) => <th key={k.isi} className="px-2 py-1.5 font-semibold">{k.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {hasil.baris.slice(0, PRATINJAU).map((b, i) => (
                  <tr key={i} className="border-t border-line">
                    {kolom.map((k) => (
                      <td key={k.isi} className={`px-2 py-1 ${k.kanan ? "text-right tabular-nums" : ""}`}>
                        {k.isi === "km" || k.isi === "kva"
                          ? (b[k.isi] === null ? "" : fmtAngka(b[k.isi], k.isi === "km"))
                          : (b[k.isi] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasil.baris.length > PRATINJAU && (
            <p className="text-[11px] text-ink-muted">
              Menampilkan {PRATINJAU} dari {hasil.baris.length} baris — semuanya ikut tersimpan.
            </p>
          )}
        </>
      )}
    </ModalShell>
  );
}
