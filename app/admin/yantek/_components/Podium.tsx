"use client";

import Image from "next/image";
import { Crown, Medal } from "lucide-react";
import { DISPLAY } from "@/app/admin/_ui";
import { useCountUp } from "../_hooks/useCountUp";
import { KRITERIA, POIN_NETRAL, type PetugasSkor } from "../_lib/juara";
import PetugasAvatar from "./PetugasAvatar";

/**
 * Panggung juara umum.
 *
 * Latar navy gelap dipilih dengan sengaja: seluruh halaman lain terang, jadi
 * satu bidang gelap membuat blok ini terbaca sebagai "panggung", bukan kartu
 * data biasa. Warna medali (emas/perak/perunggu) satu-satunya tempat di
 * aplikasi ini yang boleh keluar dari palet navy–teal — peringkat memang
 * dibaca lewat logam, bukan lewat merek.
 */

export interface WarnaMedali {
  utama: string;
  terang: string;
  redup: string;
  /** Gradasi balok podium & lencana. */
  balok: string;
}

export const MEDALI: WarnaMedali[] = [
  { utama: "#d4af37", terang: "#f5dd8a", redup: "#8a6d1f", balok: "linear-gradient(180deg,#f0cf6b,#c39a1f)" },
  { utama: "#b8c2cc", terang: "#e3e9ef", redup: "#78848f", balok: "linear-gradient(180deg,#dbe2e9,#98a4b0)" },
  { utama: "#c08457", terang: "#e2b48c", redup: "#8a5a34", balok: "linear-gradient(180deg,#dda877,#a86d42)" },
];

/** Tinggi balok podium (px) untuk peringkat 1, 2, 3. */
const TINGGI = [132, 96, 74];
/** Urutan tampil kiri → tengah → kanan: perak, emas, perunggu. */
const SUSUNAN = [1, 0, 2];
/** Juara 3 muncul lebih dulu, juara 1 terakhir — mata mendarat di pemenang. */
const TUNDA = [0.34, 0.17, 0];

/** Titik cahaya di sekitar avatar juara 1. */
const KILAU = [
  { top: "-6%", left: "84%", delay: "0s" },
  { top: "78%", left: "-8%", delay: "0.8s" },
  { top: "6%", left: "-10%", delay: "1.5s" },
];

/**
 * Ukuran & kerapatan lencana "S" sebagai huruf pertama "SMART".
 *
 * Margin negatifnya merapatkan lencana ke huruf M: berkas PNG-nya menyisakan
 * ruang kosong ±18% di kiri-kanan bentuknya, dan tanpa dirapatkan lencana
 * terlihat berdiri sendiri alih-alih menjadi huruf pertama. Tingginya melebihi
 * huruf, seperti lazimnya lambang pada logo.
 */
const LENCANA = "h-[2.2em] w-[2.2em] shrink-0 -ml-[0.3em] -mr-[0.35em]";

/**
 * Lencana "S" SMART Mataram — berkas `public/smarbg.png`, latarnya transparan.
 *
 * `putih` memakai `brightness-0 invert`: lapisan cahaya butuh siluet putih rata,
 * dan warna PNG hanya bisa diseragamkan lewat filter — brightness-0 memadamkan
 * seluruh warnanya jadi hitam, invert membalikkannya jadi putih, alfa utuh.
 *
 * Ukuran intrinsik 500×500 diturunkan ke 96 supaya pengoptimal Next tidak
 * mengirim berkas penuh untuk bentuk yang di layar tak sampai 100px.
 */
function LencanaS({ putih = false }: { putih?: boolean }) {
  return (
    <Image
      src="/smarbg.png"
      alt=""
      width={96}
      height={96}
      className={`${LENCANA} ${putih ? "brightness-0 invert" : "opacity-[0.32]"}`}
    />
  );
}

/**
 * Cap air panggung: lencana-S + MART di kiri, MATARAM di kanan.
 *
 * Lencananya menjadi huruf S, bukan berdiri di tengah di antara dua kata —
 * posisi tengah persis ditempati kolom juara 1, jadi lambang sebesar apa pun
 * di sana tertutup podium dan terbaca sebagai serpihan bentuk. Di pinggir kiri
 * latarnya kosong, jadi bentuknya utuh.
 *
 * Dua salinan bentuk yang sama — satu diburamkan tebal sebagai cahaya panggung,
 * satu tajam nyaris tak terlihat supaya hurufnya tetap terbaca sebagai kata,
 * bukan noda. Tanpa salinan tajam itu, blur 20px hanya menyisakan gumpalan
 * terang yang tidak berbunyi apa-apa.
 *
 * Sengaja TIDAK dianimasikan: menganimasikan lapisan ber-blur memaksa peramban
 * menggambar ulang buramnya tiap frame, sementara panggung ini sudah
 * menjalankan empat animasi berulang (mahkota, kilau, percik, halo).
 *
 * Lencananya tampil dengan warna aslinya — satu-satunya pengecualian dari
 * aturan "emas hanya untuk medali" di berkas ini. Hurufnya tetap putih agar
 * pengecualian itu tidak melebar ke seluruh cap air.
 */
function CapAir() {
  // font-extrabold, bukan font-black: Plus Jakarta Sans hanya dimuat pada bobot
  // 600/700/800, jadi 900 akan ditebalkan palsu peramban dan hurufnya pecah.
  // Ukuran memakai clamp supaya di layar sempit ia mengecil, bukan mendorong
  // lebar kartu; sisa luberannya dipotong `overflow-hidden` milik panggung.
  const lapis =
    "absolute inset-x-0 top-[54%] -translate-y-1/2 flex items-center justify-between " +
    "px-[4%] font-display font-extrabold tracking-[0.06em] whitespace-nowrap " +
    "text-[clamp(1.5rem,8vw,5.25rem)] leading-none select-none";

  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none">
      {/* Lapisan cahaya — seluruhnya putih supaya sebaran terangnya rata. */}
      <span className={`${lapis} text-white opacity-[0.13] blur-[20px]`}>
        <span className="flex items-center">
          <LencanaS putih />
          MART
        </span>
        <span>MATARAM</span>
      </span>

      {/* Lapisan tajam: lencana berwarna pekat, hurufnya nyaris hilang. Bedanya
          disengaja — lencana itu aksen, hurufnya cuma tekstur. */}
      <span className={`${lapis} text-white`}>
        <span className="flex items-center">
          <LencanaS />
          <span className="opacity-[0.055]">MART</span>
        </span>
        <span className="opacity-[0.055]">MATARAM</span>
      </span>
    </div>
  );
}

interface PodiumProps {
  tiga: PetugasSkor[];
  periode: string;
  cakupan: string;
  onPilih: (nama: string) => void;
}

export default function Podium({ tiga, periode, cakupan, onPilih }: PodiumProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-navy-800 shadow-card bg-navy-900">
      {/* Sorot panggung + kisi samar: memberi kedalaman tanpa satu gambar pun. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(120% 90% at 50% -10%, rgba(212,175,55,0.20), transparent 58%)," +
            "radial-gradient(90% 70% at 50% 120%, rgba(42,74,156,0.55), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      {/* Di atas kisi, di bawah seluruh isi — semua blok isi memakai `relative`. */}
      <CapAir />

      <div className="relative px-5 pt-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Crown size={15} className="text-[#f0cf6b]" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f0cf6b]">
            Juara Umum Petugas Yantek
          </p>
          <div className="flex-1" />
          <p className="text-[11px] text-white/55">
            {periode} · {cakupan}
          </p>
        </div>
        <p className="mt-1 text-[11px] text-white/45">
          Peringkat gabungan empat kriteria — rating, jumlah WO, response, dan recovery.
        </p>
      </div>

      <div className="relative flex items-end justify-center gap-2 sm:gap-6 px-4 pt-6">
        {SUSUNAN.map((idx) =>
          tiga[idx] ? (
            <Peserta
              key={tiga[idx].nama}
              petugas={tiga[idx]}
              tempat={idx}
              tunda={TUNDA[idx]}
              onPilih={() => onPilih(tiga[idx].nama)}
            />
          ) : (
            <div key={idx} className="w-28 sm:w-44" />
          ),
        )}
      </div>

      {/* Garis lantai panggung. */}
      <div className="relative h-px bg-linear-to-r from-transparent via-white/25 to-transparent" />
      <div className="relative h-3 bg-black/20" />
    </div>
  );
}

function Peserta({
  petugas,
  tempat,
  tunda,
  onPilih,
}: {
  petugas: PetugasSkor;
  tempat: number;
  tunda: number;
  onPilih: () => void;
}) {
  const m = MEDALI[tempat];
  const juara = tempat === 0;
  const skor = useCountUp(petugas.skor, 1200, tunda * 1000 + 350);

  return (
    <div className="flex flex-col items-center w-28 sm:w-44">
      <button
        onClick={onPilih}
        className="animate-juara-pop flex flex-col items-center group focus:outline-none"
        style={{ animationDelay: `${tunda + 0.1}s` }}
      >
        {juara && (
          <Crown
            size={26}
            className="animate-juara-float mb-1 drop-shadow-[0_2px_6px_rgba(212,175,55,0.6)]"
            style={{ color: m.terang }}
            fill={m.utama}
          />
        )}

        <div className="relative">
          {juara && (
            <>
              <span
                className="animate-juara-halo absolute inset-0 rounded-full"
                style={{ boxShadow: `0 0 0 3px ${m.utama}` }}
              />
              {KILAU.map((s, i) => (
                <span
                  key={i}
                  className="animate-juara-sparkle absolute w-1.5 h-1.5 rounded-full"
                  style={{ top: s.top, left: s.left, background: m.terang, animationDelay: s.delay }}
                />
              ))}
            </>
          )}
          <PetugasAvatar
            nama={petugas.nama}
            ukuran={juara ? 92 : 64}
            cincin={m.utama}
            className="transition-transform group-hover:scale-105"
          />
          <span
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 grid place-items-center w-5.5 h-5.5 rounded-full text-[11px] font-bold text-navy-900 shadow-md"
            style={{ background: m.balok, border: `1.5px solid ${m.terang}` }}
          >
            {tempat + 1}
          </span>
        </div>

        <p
          className={`${DISPLAY} mt-3 font-bold text-white text-center leading-tight px-1 ${
            juara ? "text-[15px]" : "text-[13px]"
          }`}
        >
          {petugas.nama}
        </p>
        <p className="text-[11px] text-white/50 tabular-nums">
          {petugas.totalWO} WO ·{" "}
          {petugas.nilai.rating !== null ? `${petugas.nilai.rating.toFixed(2)}★` : "tanpa rating"}
        </p>
      </button>

      {/* Balok podium — tumbuh dari lantai, angkanya berhitung naik. */}
      <div
        className="animate-podium-rise relative mt-3 w-full rounded-t-xl overflow-hidden"
        style={{
          ["--podium-h" as string]: `${TINGGI[tempat]}px`,
          background: m.balok,
          animationDelay: `${tunda}s`,
        }}
      >
        {juara && (
          <span className="animate-juara-shine absolute inset-y-0 -left-1/3 w-1/3 bg-linear-to-r from-transparent via-white/70 to-transparent" />
        )}
        <div className="relative h-full flex flex-col items-center justify-center gap-0.5 text-navy-900">
          <Medal size={juara ? 18 : 15} className="opacity-70" />
          <p className={`${DISPLAY} font-bold tabular-nums ${juara ? "text-2xl" : "text-lg"}`}>
            {skor.toFixed(1)}
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wider opacity-65">Skor</p>
        </div>
      </div>

      {/* Rincian poin per kriteria — supaya "skor 87,5" bisa ditelusuri. */}
      <div
        className="animate-juara-pop w-full px-1 py-2 space-y-1"
        style={{ animationDelay: `${tunda + 0.35}s` }}
      >
        {KRITERIA.map((k) => {
          const poin = petugas.poin[k.key];
          const kosong = poin === null;
          return (
            <div
              key={k.key}
              className="flex items-center gap-1.5"
              title={kosong ? `Tanpa data ${k.pendek} — diberi poin netral ${POIN_NETRAL}` : undefined}
            >
              <span className="w-11 shrink-0 text-[9px] uppercase tracking-wide text-white/40">
                {k.pendek}
              </span>
              <span className="flex-1 h-1 rounded-full bg-white/12 overflow-hidden">
                <span
                  className="animate-bar-fill block h-full rounded-full"
                  style={{
                    ["--bar-w" as string]: `${poin ?? POIN_NETRAL}%`,
                    background: kosong ? "rgba(255,255,255,0.3)" : m.terang,
                    animationDelay: `${tunda + 0.5}s`,
                  }}
                />
              </span>
              <span className="w-6 shrink-0 text-right text-[9px] tabular-nums text-white/55">
                {kosong ? "n/a" : Math.round(poin)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
