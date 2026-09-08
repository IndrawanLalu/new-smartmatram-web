"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  MapPin, CheckCircle2, XCircle, Loader2, Inbox, Ruler, Crosshair, User, Clock,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser } from "@/lib/roles";
import { CARD, BTN_PRIMARY, BTN_GHOST, EYEBROW } from "@/app/admin/_ui";
import { useUsulanKoreksi, type Usulan } from "../_hooks/useUsulanKoreksi";
import type { TitikTiang } from "./PetaUsulan";

// Leaflet menyentuh `window` saat dimuat, jadi wajib di luar render server.
const PetaUsulan = dynamic(() => import("./PetaUsulan"), {
  ssr: false,
  loading: () => (
    <div className="h-[340px] rounded-xl border border-line bg-surface animate-pulse" />
  ),
});

const angka = (v: unknown) => (typeof v === "number" ? v : Number(v));
const titik = (v: Usulan["nilai_lama"]) =>
  v && typeof v.lat === "number" && typeof v.lng === "number"
    ? { lat: v.lat, lng: v.lng }
    : null;

const waktu = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

export default function UsulanKoreksi({ user }: { user: CurrentUser }) {
  const { usulan, loading, error, memproses, putuskan } = useUsulanKoreksi(user);
  const [dipilih, setDipilih] = useState<string | null>(null);
  const [tiang, setTiang] = useState<TitikTiang[]>([]);
  const [alasan, setAlasan] = useState("");

  const aktif = useMemo(
    () => usulan.find((u) => u.id === dipilih) ?? usulan[0] ?? null,
    [usulan, dipilih],
  );

  // Tiang gardu yang bersangkutan — bukti terkuat untuk menilai titiknya.
  useEffect(() => {
    if (!aktif) {
      setTiang([]);
      return;
    }
    let hidup = true;
    void (async () => {
      const { data } = await supabaseBrowser
        .from("tiang")
        .select("id,kode,lat,lng,induk_id")
        .eq("gardu_kode", aktif.entitas_kode)
        .eq("ulp", aktif.ulp)
        .eq("status_hidup", "aktif");
      if (!hidup) return;

      const baris = data ?? [];
      const peta = new Map(baris.map((t) => [t.id, t]));
      setTiang(
        baris
          .filter((t) => t.lat !== null && t.lng !== null)
          .map((t) => {
            const induk = t.induk_id ? peta.get(t.induk_id) : null;
            return {
              kode: t.kode,
              lat: angka(t.lat),
              lng: angka(t.lng),
              indukLat: induk?.lat != null ? angka(induk.lat) : null,
              indukLng: induk?.lng != null ? angka(induk.lng) : null,
            };
          }),
      );
    })();
    return () => {
      hidup = false;
    };
  }, [aktif]);

  useEffect(() => setAlasan(""), [aktif?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat usulan…
      </div>
    );
  }

  if (usulan.length === 0) {
    return (
      <div className={`${CARD} flex flex-col items-center gap-2 py-20 text-center`}>
        <Inbox size={34} className="text-ink-muted" />
        <p className="font-semibold text-ink">Tidak ada usulan menunggu</p>
        <p className="text-sm text-ink-soft max-w-sm">
          Koreksi dari lapangan akan muncul di sini untuk diperiksa sebelum jadi data tetap.
        </p>
      </div>
    );
  }

  const lama = aktif ? titik(aktif.nilai_lama) : null;
  const baru = aktif ? titik(aktif.nilai_baru) : null;

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4">
      {/* Daftar */}
      <div className="space-y-2">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
        {usulan.map((u) => {
          const ini = aktif?.id === u.id;
          return (
            <button
              key={u.id}
              onClick={() => setDipilih(u.id)}
              className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors ${
                ini
                  ? "bg-navy-600 border-navy-600 text-white"
                  : "bg-white border-line hover:border-navy-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{u.entitas_kode}</span>
                <span className={`text-xs ${ini ? "text-navy-100" : "text-ink-muted"}`}>
                  {u.ulp}
                </span>
              </div>
              <p className={`text-xs mt-1 ${ini ? "text-navy-100" : "text-ink-soft"}`}>
                {u.field === "koordinat" ? "Koreksi titik" : `Koreksi ${u.field}`}
                {u.bukti_selisih != null && ` · ${Math.round(u.bukti_selisih)} m`}
              </p>
              <p className={`text-[11px] mt-1 ${ini ? "text-navy-200" : "text-ink-muted"}`}>
                {u.pengusul_nama ?? "—"} · {waktu(u.diusulkan_at)}
              </p>
            </button>
          );
        })}
      </div>

      {/* Rincian */}
      {aktif && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="bg-navy-600 px-4 py-3 flex items-center gap-2">
            <MapPin size={18} className="text-white" />
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold leading-tight">
                {aktif.entitas_kode}
                {aktif.gardu_nama ? ` — ${aktif.gardu_nama}` : ""}
              </p>
              <p className="text-navy-100 text-xs truncate">
                {aktif.gardu_alamat || aktif.penyulang || aktif.ulp}
              </p>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {aktif.diterapkan_langsung && (
              <p className="text-xs bg-attention-tint text-attention rounded-lg px-3 py-2 font-medium">
                Titik ini <b>sudah dipakai</b> sejak dikoreksi petugas, supaya pekerjaan
                menitik tidak tersendat. Menolak akan mengembalikannya ke titik lama.
              </p>
            )}

            {baru && (
              <PetaUsulan
                lama={lama}
                baru={baru}
                akurasi={aktif.bukti_akurasi != null ? Number(aktif.bukti_akurasi) : null}
                tiang={tiang}
              />
            )}

            <div className="grid sm:grid-cols-4 gap-3">
              <Fakta
                ikon={<Ruler size={14} />}
                label="Selisih"
                nilai={aktif.bukti_selisih != null ? `${Math.round(aktif.bukti_selisih)} m` : "—"}
              />
              <Fakta
                ikon={<Crosshair size={14} />}
                label="Ketelitian GPS"
                nilai={aktif.bukti_akurasi != null ? `±${Math.round(Number(aktif.bukti_akurasi))} m` : "—"}
              />
              <Fakta ikon={<User size={14} />} label="Pengusul" nilai={aktif.pengusul_nama ?? "—"} />
              <Fakta ikon={<Clock size={14} />} label="Waktu" nilai={waktu(aktif.diusulkan_at)} />
            </div>

            {tiang.length > 0 && (
              <p className="text-xs text-ink-soft">
                Gardu ini punya <b>{tiang.length} tiang</b> tercatat. Titik yang benar
                seharusnya berada di pangkal rangkaian itu — kalau titik baru justru menjauh,
                kemungkinan petugas berada di gardu lain.
              </p>
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
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                placeholder="Alasan (wajib kalau menolak)"
                className="w-full h-9 rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15"
              />
              <div className="flex gap-2">
                <button
                  className={BTN_PRIMARY}
                  disabled={memproses === aktif.id}
                  onClick={() => void putuskan(aktif.id, true, alasan || undefined)}
                >
                  {memproses === aktif.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  Setujui
                </button>
                <button
                  className={`${BTN_GHOST} text-red-600 border-red-200 hover:bg-red-50`}
                  disabled={memproses === aktif.id || !alasan.trim()}
                  title={!alasan.trim() ? "Isi alasan dulu" : undefined}
                  onClick={() => void putuskan(aktif.id, false, alasan)}
                >
                  <XCircle size={16} />
                  Tolak &amp; kembalikan
                </button>
              </div>
              <p className="text-[11px] text-ink-muted">
                Menolak tanpa alasan membuat petugas tidak tahu apa yang harus diperbaiki,
                jadi alasannya diminta lebih dulu.
              </p>
            </div>
          </div>
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
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {ikon}
        {label}
      </p>
      <p className="text-sm font-semibold text-ink mt-1 truncate">{nilai}</p>
    </div>
  );
}
