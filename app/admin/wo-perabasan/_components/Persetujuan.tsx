"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Loader2, MapPin, Undo2 } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import type { Realisasi, WoItem } from "../_hooks/useWoPerabasan";

/**
 * Persetujuan hasil perabasan per segmen.
 *
 * Bentuknya sengaja sama dengan Persetujuan JTR/JTM/HARGARDU yang sudah ada —
 * admin tidak perlu mempelajari layar keempat untuk pekerjaan yang sama.
 *
 * Foto sebelum–sesudah ditampilkan berdampingan, bukan di balik tombol. Itulah
 * satu-satunya yang benar-benar diperiksa di sini; menyembunyikannya satu
 * ketukan lebih jauh membuat verifikasi berubah jadi menekan "Terima" berturut-
 * turut tanpa melihat apa pun.
 */

export default function Persetujuan({
  menunggu,
  realisasi,
  onPutuskan,
}: {
  menunggu: WoItem[];
  realisasi: Realisasi[];
  onPutuskan: (itemId: string, terima: boolean, catatan: string) => Promise<boolean>;
}) {
  if (menunggu.length === 0) {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <BadgeCheck size={28} className="mx-auto text-ink-muted opacity-40" />
        <p className="text-sm text-ink-soft mt-2">Tidak ada yang menunggu keputusan.</p>
        <p className="text-xs text-ink-muted mt-1">
          Segmen muncul di sini begitu regu menekan “Selesaikan perabasan segmen ini”.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-soft">
        <b className="text-ink">{menunggu.length} segmen</b> menunggu diperiksa. Yang diterima
        langsung menambah capaian km WO-nya; yang dikembalikan tetap jadi kewajiban regu di WO yang
        sama.
      </p>
      {menunggu.map((i) => (
        <KartuSegmen
          key={i.id}
          i={i}
          pohon={realisasi.filter((r) => r.item_id === i.id)}
          onPutuskan={onPutuskan}
        />
      ))}
    </div>
  );
}

function KartuSegmen({
  i,
  pohon,
  onPutuskan,
}: {
  i: WoItem;
  pohon: Realisasi[];
  onPutuskan: (itemId: string, terima: boolean, catatan: string) => Promise<boolean>;
}) {
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState<"terima" | "tolak" | null>(null);

  const luar = useMemo(() => pohon.filter((p) => !p.tiang_id).length, [pohon]);

  const putuskan = async (terima: boolean) => {
    setSibuk(terima ? "terima" : "tolak");
    await onPutuskan(i.id, terima, catatan.trim());
    setSibuk(null);
  };

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[220px]">
          <p className={EYEBROW}>{i.penyulang}</p>
          <p className="font-semibold text-ink mt-0.5">{i.segmen_nama}</p>
          <p className="text-xs text-ink-muted mt-1">
            {i.panjang_km !== null ? `${Number(i.panjang_km).toFixed(2)} km` : "panjang belum ada"}
            {i.panjang_dari === "ketikan" && <span className="text-amber-700"> ✎ angka ketikan</span>}
            {" · "}
            {i.petugas_nama ?? "petugas tidak tercatat"}
            {i.tgl_selesai && ` · selesai ${i.tgl_selesai}`}
          </p>
        </div>
        <p className="text-xs text-ink-soft">
          <b className="text-ink tabular-nums text-base">{pohon.length}</b> pohon dilaporkan
          {luar > 0 && <span className="text-violet-700"> · {luar} di luar daftar inspeksi</span>}
        </p>
      </div>

      {/* Ruas yang disisir dan ternyata bersih adalah hasil kerja yang sah —
          database memang mewajibkan catatan saat nol pohon. Ditampilkan di sini
          supaya admin memutuskan berdasarkan keterangannya, bukan mengira
          regunya tidak bekerja. */}
      {pohon.length === 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs text-amber-900">
            <b>Tidak ada pohon dilaporkan.</b> Keterangan regu:{" "}
            {i.catatan ? <i>“{i.catatan}”</i> : <span className="text-amber-700">— tidak ada —</span>}
          </p>
        </div>
      )}

      {pohon.length > 0 && (
        <div className="mt-4 space-y-3">
          {pohon.map((p) => (
            <div key={p.id} className="flex flex-wrap items-start gap-3 pb-3 border-b border-line last:border-0">
              <div className="flex gap-2">
                <Bukti url={p.foto_sebelum_url} label="Sebelum" />
                <Bukti url={p.foto_sesudah_url} label="Sesudah" />
              </div>
              <div className="flex-1 min-w-[160px] text-xs">
                <p className="font-medium text-ink">{p.jenis_pohon || "Jenis tidak dicatat"}</p>
                <p className="text-ink-muted mt-0.5">
                  {p.tiang_id ? "dari inspeksi JTM" : "temuan lapangan"}
                  {p.petugas_nama && ` · ${p.petugas_nama}`}
                </p>
                {p.catatan && <p className="text-ink-soft mt-0.5">{p.catatan}</p>}
                {p.lat !== null && p.lng !== null && (
                  <a
                    href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-navy-600 hover:underline mt-0.5"
                  >
                    <MapPin size={11} /> {Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Catatan — wajib kalau dikembalikan"
          className={`${FIELD} flex-1 min-w-[220px]`}
        />
        <button
          onClick={() => void putuskan(false)}
          disabled={sibuk !== null || !catatan.trim()}
          title={catatan.trim() ? "Kembalikan ke regu" : "Tulis alasannya dulu"}
          className={`${BTN_GHOST} border-red-200 text-red-700 hover:bg-red-50`}
        >
          {sibuk === "tolak" ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}
          Kembalikan
        </button>
        <button
          onClick={() => void putuskan(true)}
          disabled={sibuk !== null}
          className={BTN_PRIMARY}
        >
          {sibuk === "terima" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <BadgeCheck size={15} />
          )}
          Terima
        </button>
      </div>
    </div>
  );
}

function Bukti({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* next/image tidak dipakai di sini: sumbernya bucket Supabase yang
          host-nya bisa berbeda per lingkungan, dan sebagian foto lama masih
          URL Firebase warisan migrasi. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        className="w-24 h-24 object-cover rounded-lg border border-line bg-surface"
      />
      <span className="block text-[10px] text-ink-muted text-center mt-0.5">{label}</span>
    </a>
  );
}
