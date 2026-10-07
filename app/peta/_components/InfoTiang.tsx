"use client";

import { useState } from "react";
import { Columns2, GitBranch, Loader2, Move, Pencil, Trash2, Waypoints, Zap } from "lucide-react";
import { PENANDA_ALAT } from "../_hooks/useSimulasiBuka";
import type { PilihanAtribut, RincianTiang } from "../_hooks/useObjekPeta";
import type { Penanda } from "../_hooks/usePenandaJtm";
import { INPUT, JUDUL_BAGIAN } from "../_ui";
import NamaTiangJtm from "./NamaTiangJtm";
import PenandaTiang from "./PenandaTiang";

/**
 * Rincian satu tiang di panel kanan peta, dan suntingan yang boleh dari meja:
 * atribut master, geser titik, ganti induk, percabangan, batalkan salah input.
 * Keadaan hasil inspeksi (temuan) hanya DIBACA — itu urusan lapangan.
 */

export const TOMBOL_PANEL =
  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-[#1e3552] text-[#e2e8f0] hover:bg-white/5 disabled:opacity-40";

export function Baris({ label, nilai }: { label: string; nilai: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-xs">
      <span className="w-[110px] shrink-0 text-gray-500">{label}</span>
      <span className="text-[#e2e8f0] min-w-0 break-words">{nilai ?? "—"}</span>
    </div>
  );
}

interface Props {
  t: RincianTiang;
  pilihan: PilihanAtribut;
  penanda: Map<string, Penanda>;
  boleh: boolean;
  onUbahAtribut: (isi: Record<string, string>) => Promise<boolean>;
  onGeser: () => void;
  onGantiInduk: () => void;
  /** Titik pertemuan: pilih induk tiang ini di penyulang yang menumpang. */
  onIndukPenyulang: (penyulang: string) => void;
  onPercabangan: (nyala: boolean) => Promise<boolean>;
  onBatalkan: () => void;
  /** Simulasi "kalau alat ini dibuka" — hanya membaca, untuk semua pengguna. */
  onSimulasi: () => void;
  simulasiSibuk: boolean;
  /** Dipilih dari lapisan JTR: induk JTR diganti di bagian JTR, bukan di sini. */
  tanpaGantiInduk?: boolean;
  /** Gardu portal yang masih satu tiang: buatkan tiang keduanya (admin). */
  onBuatPasangan: () => Promise<boolean>;
  oleh: string;
  /** Nama tiang (dan hilirnya) baru saja diganti — muat ulang peta. */
  onNamaBerubah: () => void;
}

export default function InfoTiang({
  t, pilihan, penanda, boleh, onUbahAtribut, onGeser, onGantiInduk, onIndukPenyulang, onPercabangan, onBatalkan, onSimulasi, simulasiSibuk,
  tanpaGantiInduk = false, onBuatPasangan, oleh, onNamaBerubah,
}: Props) {
  const jtr = !!t.gardu_kode;
  const [sunting, setSunting] = useState(false);
  const [isi, setIsi] = useState<Record<string, string>>({});
  const [sibuk, setSibuk] = useState(false);

  const mulai = () => {
    setIsi(
      jtr
        ? { jenis: t.jenis ?? "", tinggi: t.tinggi === null ? "" : String(t.tinggi) }
        : {
            // Penanda & kode gardu/nama peralatan: bagian "Penanda" sendiri (PenandaTiang).
            jenis: t.jenis ?? "", konstruksi: t.konstruksi ?? "", nomor_lama: t.nomor_lama ?? "",
          },
    );
    setSunting(true);
  };

  const simpan = async () => {
    setSibuk(true);
    const ok = await onUbahAtribut(isi);
    setSibuk(false);
    if (ok) setSunting(false);
  };

  /** Pilihan dari daftar, tapi nilai lama yang tidak ada di daftar tetap tampil. */
  const pilih = (medan: string, daftar: string[], label: string, ke: (v: string) => string = (v) => v) => (
    <label className="block text-xs">
      <span className="text-gray-500">{label}</span>
      <select value={isi[medan] ?? ""} onChange={(e) => setIsi({ ...isi, [medan]: e.target.value })} className={`${INPUT} mt-1`}>
        <option value="">—</option>
        {[...new Set([...(isi[medan] ? [isi[medan]] : []), ...daftar])].map((v) => (
          <option key={v} value={v}>{ke(v)}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <div>
        <Baris label={jtr ? "Gardu · jurusan" : "Penyulang pemilik"} nilai={jtr ? `${t.gardu_kode} · ${t.jurusan ?? "—"}` : t.penyulang} />
        {!jtr && t.nama.length > 1 && (
          <Baris
            label="Nama per penyulang"
            nilai={t.nama.map((n) => `${n.kode} (${n.penyulang}${n.utama ? "" : ", menumpang"})`).join(" · ")}
          />
        )}
        <Baris label="Induk" nilai={t.induk ?? "pangkal"} />
        {/* Penyulang yang menumpang: induknya di penyulang itu. Titik pertemuan
            dua penyulang (LBSM tie) didatangi tiap penyulang dari arah lain. */}
        {!jtr &&
          t.nama
            .filter((n) => !n.utama)
            .map((n) => (
              <Baris key={n.penyulang} label={`Induk di ${n.penyulang}`} nilai={n.induk ?? "ikut induk batang"} />
            ))}
        <Baris label="Jenis" nilai={t.jenis} />
        {jtr ? <Baris label="Tinggi" nilai={t.tinggi === null ? null : `${t.tinggi} m`} /> : <Baris label="Konstruksi" nilai={t.konstruksi} />}
        {!jtr && <Baris label="Nomor lama" nilai={t.nomor_lama} />}
        {!jtr && <PenandaTiang t={t} penanda={penanda} boleh={boleh} onUbahAtribut={onUbahAtribut} />}
        {!jtr && <Baris label="Percabangan" nilai={t.percabangan ? "ya" : "tidak"} />}
        {!jtr && (t.portal.pasangan || t.portal.dari || t.portal.tanpaPasangan) && (
          <Baris
            label="Gardu portal"
            nilai={
              t.portal.dari
                ? `tiang kedua — pasangan ${t.portal.dari}`
                : t.portal.pasangan
                  ? `dua tiang — pasangannya ${t.portal.pasangan}`
                  : "masih satu tiang"
            }
          />
        )}
        <Baris label="Sumber" nilai={t.sumber} />
        <Baris
          label="Dikonfirmasi"
          nilai={t.dikonfirmasi_at ? `${t.dikonfirmasi_at.slice(0, 10)} · ${t.dikonfirmasi_oleh ?? "—"}` : "belum"}
        />
      </div>

      {t.temuan.length > 0 && (
        <div>
          <p className={JUDUL_BAGIAN}>Temuan terbuka</p>
          <ul className="mt-1.5 space-y-1">
            {t.temuan.map((x, i) => (
              <li key={i} className="text-xs text-amber-300">
                {x.item}{x.bagian !== "-" ? ` (${x.bagian})` : ""}: {x.nilai}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Portal yang tercatat satu tiang — tiang kedua dibuat 2 m searah jalur
          dengan nama dari aturan penamaan biasa; geser kalau letaknya beda.
          Juga untuk tiang yang ditandai gardu dari meja: tanpa penilaian regu,
          hanya admin yang tahu gardunya portal. */}
      {!jtr && boleh && !t.portal.pasangan && !t.portal.dari && (t.portal.tanpaPasangan || t.penanda === "gardu") && (
        <div className="rounded-lg border border-[#c084fc]/50 p-2.5 space-y-2">
          <p className="text-[11px] text-[#e9d5ff] leading-relaxed">
            {t.portal.tanpaPasangan
              ? "Gardu portal berdiri di dua tiang, tapi baru satu yang tercatat."
              : "Gardu ini portal (berdiri di dua tiang)? Buatkan tiang keduanya."}{" "}
            Tiang keduanya dibuat 2 m searah jalur — geser titiknya kalau letak sebenarnya berbeda.
          </p>
          <button
            onClick={async () => {
              setSibuk(true);
              await onBuatPasangan();
              setSibuk(false);
            }}
            disabled={sibuk}
            className={`${TOMBOL_PANEL} border-[#c084fc] text-[#e9d5ff]`}
          >
            {sibuk ? <Loader2 size={13} className="animate-spin" /> : <Columns2 size={13} />} Buat pasangan portal
          </button>
        </div>
      )}

      {!jtr && t.penanda && PENANDA_ALAT.has(t.penanda) && (
        <button onClick={onSimulasi} disabled={simulasiSibuk} className={`${TOMBOL_PANEL} border-orange-400/70 text-orange-300`}>
          {simulasiSibuk ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Simulasi buka — apa yang padam?
        </button>
      )}

      {boleh && sunting && (
        <div className="space-y-2.5 rounded-lg border border-[#1e3552] p-3">
          <p className={JUDUL_BAGIAN}>Ubah atribut</p>
          {pilih("jenis", pilihan.jenis, "Jenis")}
          {jtr
            ? pilih("tinggi", pilihan.tinggi, "Tinggi (m)")
            : pilih("konstruksi", pilihan.konstruksi, "Konstruksi")}
          {!jtr && (
            <label className="block text-xs">
              <span className="text-gray-500">Nomor lama</span>
              <input value={isi.nomor_lama ?? ""} onChange={(e) => setIsi({ ...isi, nomor_lama: e.target.value })} className={`${INPUT} mt-1`} />
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={() => void simpan()} disabled={sibuk} className={`${TOMBOL_PANEL} border-[#00897B] text-[#5eead4]`}>
              Simpan
            </button>
            <button onClick={() => setSunting(false)} disabled={sibuk} className={TOMBOL_PANEL}>
              Batal
            </button>
          </div>
        </div>
      )}

      {!jtr && !tanpaGantiInduk && boleh && !sunting && (
        <NamaTiangJtm t={t} oleh={oleh} onBerubah={onNamaBerubah} />
      )}

      {boleh && !sunting && (
        <div className="flex flex-wrap gap-2">
          <button onClick={mulai} className={TOMBOL_PANEL}><Pencil size={13} /> Ubah atribut</button>
          <button onClick={onGeser} className={TOMBOL_PANEL}><Move size={13} /> Geser titik</button>
          {!jtr && !tanpaGantiInduk && <button onClick={onGantiInduk} className={TOMBOL_PANEL}><Waypoints size={13} /> Ganti induk</button>}
          {!jtr && !tanpaGantiInduk &&
            t.nama
              .filter((n) => !n.utama)
              .map((n) => (
                <button key={n.penyulang} onClick={() => onIndukPenyulang(n.penyulang)} className={TOMBOL_PANEL}>
                  <Waypoints size={13} /> Induk di {n.penyulang}
                </button>
              ))}
          {!jtr && (
            <button onClick={() => void onPercabangan(!t.percabangan)} className={TOMBOL_PANEL}>
              <GitBranch size={13} /> {t.percabangan ? "Lepas percabangan" : "Tandai percabangan"}
            </button>
          )}
          <button onClick={onBatalkan} className={`${TOMBOL_PANEL} text-red-300`}><Trash2 size={13} /> Batalkan (salah input)</button>
        </div>
      )}
    </div>
  );
}
