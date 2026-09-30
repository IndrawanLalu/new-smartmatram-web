"use client";

import { memo, useState } from "react";
import { CircleMarker, Polyline, Popup } from "react-leaflet";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { nadaUjung, WARNA_NADA, type TitikUjungPeta } from "../_hooks/useUjungPeta";

/**
 * Lapisan tegangan ujung. Titik diwarnai menurut tegangan TERENDAH ketiga
 * fasanya — merah < 198 V (di bawah standar), kuning < 207 V, hijau selebihnya
 * — dengan garis putus-putus dari gardunya, supaya terlihat jurusan mana yang
 * diukur dan seberapa jauh.
 *
 * Hanya elemen kanvas (lingkaran & garis); popup dibuat saat diklik.
 */
const m = (v: number | null) =>
  v === null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(2).replace(".", ",")} km` : `${Math.round(v)} m`;

function IsiPopup({
  t,
  bolehSetujui,
  oleh,
  onDisetujui,
}: {
  t: TitikUjungPeta;
  bolehSetujui: boolean;
  oleh: string;
  onDisetujui: (id: string) => void;
}) {
  const toast = useToast();
  const [sibuk, setSibuk] = useState(false);

  const setujui = async () => {
    setSibuk(true);
    const { error } = await supabaseBrowser.rpc("setujui_tegangan_ujung", { p_id: t.id, p_nama: oleh });
    setSibuk(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onDisetujui(t.id);
    toast.success(`Tegangan ujung ${t.gardu_kode} jurusan ${t.jurusan} disetujui.`);
  };

  return (
    <div className="text-xs min-w-[210px]">
      <p className="font-semibold text-sm">
        {t.gardu_kode} · jurusan {t.jurusan}
      </p>
      <p className="mt-1 tabular-nums">
        R-N <b>{t.v_rn}</b> · S-N <b>{t.v_sn}</b> · T-N <b>{t.v_tn}</b> V
      </p>
      <p className="text-gray-500 mt-0.5">
        {t.tgl_ukur} · {t.petugas_nama ?? "—"}
      </p>
      <p className="text-gray-500 mt-0.5">
        {t.tiang_rekomendasi_kode
          ? `${m(t.jarak_rekomendasi_m)} dari ujung terjauh (${t.tiang_rekomendasi_kode})`
          : "Tanpa rekomendasi tiang ujung"}
      </p>
      <p className="mt-1">
        Status: <b>{t.status_tampil}</b>
      </p>
      <div className="mt-2 flex items-center gap-3">
        <a href={t.foto_url} target="_blank" rel="noreferrer" className="text-blue-600 font-semibold">
          Foto alat ukur
        </a>
        {bolehSetujui && t.status_tampil === "Menunggu verifikasi" && (
          <button
            onClick={() => void setujui()}
            disabled={sibuk}
            className="text-emerald-700 font-semibold disabled:opacity-40"
          >
            {sibuk ? "Menyetujui…" : "Setujui"}
          </button>
        )}
      </div>
    </div>
  );
}

function LapisanUjung({
  titik,
  bolehSetujui,
  oleh,
  onDisetujui,
}: {
  titik: TitikUjungPeta[];
  bolehSetujui: boolean;
  oleh: string;
  onDisetujui: (id: string) => void;
}) {
  return (
    <>
      {titik.map((t) =>
        t.gardu_lat !== null && t.gardu_lng !== null ? (
          <Polyline
            key={`ug-${t.id}`}
            positions={[
              [t.gardu_lat, t.gardu_lng],
              [t.lat, t.lng],
            ]}
            pathOptions={{ color: WARNA_NADA[nadaUjung(t.v_min)], weight: 1.5, opacity: 0.7, dashArray: "4 5" }}
          />
        ) : null,
      )}
      {titik.map((t) => (
        <CircleMarker
          key={`u-${t.id}`}
          center={[t.lat, t.lng]}
          radius={7}
          pathOptions={{
            color: "#0b1220",
            weight: 2,
            fillColor: WARNA_NADA[nadaUjung(t.v_min)],
            fillOpacity: t.status_tampil === "Disetujui" ? 1 : 0.65,
          }}
        >
          <Popup>
            <IsiPopup t={t} bolehSetujui={bolehSetujui} oleh={oleh} onDisetujui={onDisetujui} />
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

export default memo(LapisanUjung);
