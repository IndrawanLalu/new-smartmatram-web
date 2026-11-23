"use client";

import { useState } from "react";
import { Cable, ExternalLink, Loader2, Plus, Save, X } from "lucide-react";
import { panjangRuas } from "@/lib/rekonduktorJtr";
import type { RekonduktorPetaState } from "../_hooks/useRekonduktorPeta";
import { BIDANG, GARIS, PANEL } from "../_ui";
import KartuRuasRekon from "./KartuRuasRekon";
import PilihLatarSurvey from "./PilihLatarSurvey";
import { WARNA_REKON } from "./LapisanRekonduktor";

/** Kartu Survey Jaringan jenis Rekonduktor JTR di kanan peta: gardu, ruas, isian per tiang, material, simpan. */

const TOMBOL = "flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 font-semibold";
const MASUK = "rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:border-[#F97316]";

export default function PanelRekonduktor({ s, oleh }: { s: RekonduktorPetaState; oleh: string }) {
  const [kode, setKode] = useState("");
  const total = s.ruas.reduce((n, r) => n + panjangRuas(r), 0);
  const langkah =
    s.langkah === "gardu"
      ? "Klik gardu atau tiang JTR-nya di peta (nyalakan lapisan JTR gardu di panel kiri), atau ketik kode gardu."
      : s.langkah === "awal"
        ? "Klik tiang AWAL ruas yang kabelnya diganti — atau mulai dari gardu."
        : s.langkah === "akhir"
          ? "Klik tiang AKHIR. Di percabangan, cabang yang dipilih mengikuti tiang akhir ini."
          : s.ruas.length
            ? "Buka ruas untuk mengubah isian per tiang. Tambah ruas untuk cabang lain."
            : "Tambah ruas: pilih tiang awal lalu tiang akhir.";

  return (
    <section
      className="w-[400px] max-w-[calc(100vw-1.5rem)] max-h-[78vh] overflow-y-auto rounded-xl border shadow-2xl p-3 space-y-2.5 text-[#e2e8f0] text-xs"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <header className="flex items-start gap-2">
        <Cable size={15} className="mt-0.5 shrink-0" style={{ color: WARNA_REKON }} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Survey Jaringan · Rekonduktor JTR</p>
          <p className="text-sm font-semibold truncate">{s.kepala.judul || "Survey baru"}</p>
          <p className="text-gray-400">
            {s.kepala.status}
            {s.gardu ? ` · Gardu ${s.gardu}` : ""}
            {s.kepala.penyulang ? ` · ${s.kepala.penyulang}` : ""}
            {s.berubah ? " · belum disimpan" : ""}
          </p>
        </div>
        <button onClick={s.tutup} className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5" title="Tutup">
          <X size={15} />
        </button>
      </header>

      {s.memuat ? (
        <p className="flex items-center gap-2 text-gray-400"><Loader2 size={13} className="animate-spin" /> Memuat survey…</p>
      ) : (
        <>
          <input
            value={s.kepala.judul} disabled={!s.draf} onChange={(e) => s.ubahKepala({ judul: e.target.value })}
            placeholder="Judul, mis. Rekonduktor JTR AM136 jurusan B"
            className={`w-full ${MASUK}`} style={{ background: BIDANG, borderColor: GARIS }}
          />
          <PilihLatarSurvey nilai={s.kepala.latar} mati={s.kepala.status === "Batal"} onUbah={(l) => void s.ubahLatar(l, oleh)} />

          {s.draf && (s.langkah === "gardu" || !s.gardu) && (
            <form onSubmit={(e) => { e.preventDefault(); s.pilihGardu(kode); }} className="flex gap-1.5">
              <input
                value={kode} onChange={(e) => setKode(e.target.value)} placeholder="Kode gardu, mis. AM136"
                className={`flex-1 ${MASUK}`} style={{ background: BIDANG, borderColor: GARIS }}
              />
              <button type="submit" disabled={!kode.trim()} className="rounded-lg border border-white/15 px-3 font-semibold hover:bg-white/5 disabled:opacity-40">Pilih</button>
            </form>
          )}
          {s.gardu && !s.jaringan && !s.galat && (
            <p className="flex items-center gap-2 text-gray-400"><Loader2 size={13} className="animate-spin" /> Memuat kabel JTR {s.gardu}…</p>
          )}

          {s.ruas.length > 0 && (
            <div className="rounded-lg px-2 py-1.5 bg-white/5 space-y-0.5">
              <p>
                <b className="text-white">{s.ruas.length}</b> ruas · panjang titik <b className="text-white">{Math.round(total).toLocaleString("id-ID")} m</b>
              </p>
              <p className="text-gray-400">Kabel untuk bon material = panjang titik + 5% andongan (faktor di Pengaturan Analisis JTR).</p>
            </div>
          )}

          {s.draf && (
            <div className="flex gap-1.5">
              {s.langkah === "lihat" || s.langkah === "gardu" ? (
                <>
                  <button
                    disabled={!s.gardu || !s.jaringan} onClick={s.mulaiRuas}
                    className={`${TOMBOL} border-white/15 hover:bg-white/5 disabled:opacity-40`}
                  >
                    <Plus size={13} /> Tambah ruas
                  </button>
                  {s.gardu && !s.ruas.length && s.langkah !== "gardu" && (
                    <button onClick={s.gantiGardu} className={`${TOMBOL} border-white/15 hover:bg-white/5`}>Ganti gardu</button>
                  )}
                </>
              ) : (
                <>
                  {s.langkah === "awal" && (
                    <button onClick={s.dariGardu} className={`${TOMBOL} border-white/15 hover:bg-white/5`}>Mulai dari gardu</button>
                  )}
                  <button onClick={s.batalPilih} className={`${TOMBOL} border-white/15 hover:bg-white/5`}>Batal</button>
                </>
              )}
            </div>
          )}
          <p className="text-gray-400">{s.draf ? langkah : `Survey ${s.kepala.status} — ruas terkunci. Buka kembali ke Draf dari daftar survey untuk mengubah.`}</p>

          {s.calon.length > 1 && (
            <div className="space-y-1">
              <p className="text-amber-300">Ada {s.calon.length} kabel sejajar menuju tiang itu — pilih kabelnya:</p>
              {s.calon.map((j, i) => {
                const b = j.baris[j.baris.length - 1];
                return (
                  <button key={i} onClick={() => s.tambahJalur(j)} className="w-full text-left rounded-lg border border-white/15 px-2 py-1 hover:bg-white/5">
                    Jurusan {b.jurusan ?? "?"} · kabel {b.nomor_kabel ?? "?"} · {[b.jenis, b.ukuran].filter(Boolean).join(" ") || "kabel ?"} · {j.baris.length} tiang
                  </button>
                );
              })}
            </div>
          )}

          {s.ruas.map((r, i) => <KartuRuasRekon key={r.id} s={s} r={r} nomor={i + 1} />)}

          {s.material.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Perkiraan material</p>
              {s.material.map((m) => (
                <p key={`${m.nama}|${m.satuan}`} className="flex justify-between gap-2">
                  <span className="truncate">{m.nama}</span>
                  <span className="tabular-nums text-white shrink-0">{m.jumlah.toLocaleString("id-ID")} {m.satuan}</span>
                </p>
              ))}
              <p className="text-[10px] text-gray-500">Material tersimpan bersama survey pertama kali; sesudahnya disunting / dihitung ulang di daftar survey.</p>
            </div>
          )}

          {s.galat && <p className="text-[#FCA5A5]">{s.galat}</p>}

          <div className="flex gap-1.5">
            {s.draf && (
              <button
                onClick={() => void s.simpan(oleh)}
                disabled={s.sibuk || !s.berubah}
                className={`${TOMBOL} border-transparent text-white disabled:opacity-40`}
                style={{ background: WARNA_REKON }}
              >
                {s.sibuk ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Simpan
              </button>
            )}
            <a href="/admin/survey-jaringan" target="_blank" rel="noopener" className={`${TOMBOL} border-white/15 hover:bg-white/5`}>
              <ExternalLink size={13} /> Daftar survey
            </a>
          </div>
        </>
      )}
    </section>
  );
}
