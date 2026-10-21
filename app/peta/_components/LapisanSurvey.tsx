"use client";

import { useEffect } from "react";
import { CircleMarker, Marker, Polyline, Tooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { bentukGardu, setengahTiang } from "@/lib/gambarSurvey/simbolGardu";
import { posisiInduk, type TitikSurvey } from "@/lib/surveyJaringan";
import type { SurveyPetaState } from "../_hooks/useSurveyPeta";

/**
 * Survey Jaringan Baru di peta: gawang rencana putus-putus jingga, tiang baru
 * bisa diseret (selama Draf), gardu baru segitiga, peralatan belah ketupat.
 * Titik sambung (tiang JTM yang ada) bercincin ungu. Mode "tambah": klik peta
 * = tiang baru. Dirender HANYA saat survey terbuka (useMapEvents tanpa syarat).
 */

export const WARNA_SURVEY = "#F97316";
const UNGU = "#7C3AED";
const HIJAU = "#16A34A";

const ikon = new Map<string, L.DivIcon>();
/** Ukuran ikon gardu (px) — memuat tiang & trafo di arah mana pun. */
const GARDU_PX = 56;
const R_TIANG = 5;

/** Gardu baru: tiang ◐ + segitiga trafo di sampingnya, diputar sesuai arah (contohGardu.png). */
function svgGardu(t: TitikSurvey, cincin: string | null) {
  const c = GARDU_PX / 2;
  const b = bentukGardu(t.gardu_jenis, t.gardu_arah, R_TIANG);
  const seg = b.segitiga.map((p) => `${c + p.x},${c + p.y}`).join(" ");
  const tiang = b.tiang
    .map((p) => `<circle cx="${c + p.x}" cy="${c + p.y}" r="${R_TIANG}" fill="#fff" stroke="#111" stroke-width="1.2"/><path d="${setengahTiang(c + p.x, c + p.y, R_TIANG)}" fill="#111"/>`)
    .join("");
  const lingkar = cincin ? `<circle cx="${c}" cy="${c}" r="${c - 2}" fill="none" stroke="${cincin}" stroke-width="2.5" stroke-dasharray="4 3"/>` : "";
  return `<svg width="${GARDU_PX}" height="${GARDU_PX}" viewBox="0 0 ${GARDU_PX} ${GARDU_PX}">${lingkar}<polygon points="${seg}" fill="#6B7280" stroke="#fff" stroke-width="1"/>${tiang}</svg>`;
}

function ikonTitik(t: TitikSurvey, terpilih: boolean, aktif: boolean) {
  const bentuk = t.penanda === "gardu" ? "gardu" : t.penanda ? "alat" : "tiang";
  const k = `${bentuk}|${terpilih}|${aktif}|${t.gardu_jenis}|${t.gardu_arah}`;
  if (!ikon.has(k)) {
    const cincin = terpilih ? `0 0 0 3px #fff, 0 0 0 6px ${UNGU}` : aktif ? `0 0 0 3px #fff, 0 0 0 6px ${HIJAU}` : "0 1px 3px rgba(0,0,0,.6)";
    const isi =
      bentuk === "gardu"
        ? svgGardu(t, terpilih ? UNGU : aktif ? HIJAU : null)
        : bentuk === "alat"
          ? `<div style="width:13px;height:13px;transform:rotate(45deg);background:${WARNA_SURVEY};border:2px solid #fff;box-shadow:${cincin}"></div>`
          : `<div style="width:13px;height:13px;border-radius:999px;background:${WARNA_SURVEY};border:2px solid #fff;box-shadow:${cincin}"></div>`;
    const ukuran = bentuk === "gardu" ? GARDU_PX : 14;
    ikon.set(k, L.divIcon({ className: "", iconSize: [ukuran, ukuran], iconAnchor: [ukuran / 2, ukuran / 2], html: `<div style="cursor:pointer">${isi}</div>` }));
  }
  return ikon.get(k)!;
}

export default function LapisanSurvey({ s, labelPenanda }: { s: SurveyPetaState; labelPenanda: (kode: string) => string }) {
  const peta = useMapEvents({ click: (e) => s.tambahDi(e.latlng.lat, e.latlng.lng) });
  useEffect(() => {
    const c = peta.getContainer();
    c.style.cursor = s.mode === "tambah" ? "crosshair" : "";
    return () => { c.style.cursor = ""; };
  }, [peta, s.mode]);

  const aktifId = s.aktif && "titik" in s.aktif ? s.aktif.titik : null;
  const aktifTiang = s.aktif && "tiang" in s.aktif ? s.aktif.tiang : null;

  return (
    <>
      {s.titik.map((t) => {
        const i = posisiInduk(t, s.perId, s.sambung);
        if (!i) return null;
        const m = s.panjang.get(t.id) ?? 0;
        return (
          <Polyline
            key={`g-${t.id}-${i.lat}-${i.lng}-${t.lat}-${t.lng}`}
            positions={[[i.lat, i.lng], [t.lat, t.lng]]}
            pathOptions={{ color: WARNA_SURVEY, weight: 3.5, dashArray: "8 6", opacity: 0.95 }}
          >
            <Tooltip sticky>
              <span className="text-[11px]">
                {Math.round(m)} m{t.konduktor_jenis ? ` · ${t.konduktor_jenis} ${t.konduktor_ukuran ?? ""}` : ""}
              </span>
            </Tooltip>
          </Polyline>
        );
      })}

      {[...s.sambung.values()].map((t) => (
        <CircleMarker
          key={`s-${t.id}`}
          center={[t.lat, t.lng]}
          radius={11}
          interactive={false}
          pathOptions={{ color: t.id === aktifTiang ? HIJAU : UNGU, weight: 3, fillOpacity: 0 }}
        >
          <Tooltip permanent direction="top" offset={[0, -10]}>
            <span className="text-[10px] font-semibold">Sambung {t.kode ?? ""}</span>
          </Tooltip>
        </CircleMarker>
      ))}

      {s.titik.map((t, n) => (
        <Marker
          key={`t-${t.id}`}
          position={[t.lat, t.lng]}
          icon={ikonTitik(t, s.terpilih === t.id, aktifId === t.id)}
          draggable={s.draf}
          zIndexOffset={800}
          eventHandlers={{
            click: () => s.pilih(t.id),
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              s.geser(t.id, p.lat, p.lng);
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            <span className="text-[11px] font-semibold">Tiang baru {n + 1}</span>
            <span className="block text-[10px]">
              {[t.jenis_tiang, t.konstruksi, t.penanda && (t.penanda === "gardu" ? `Gardu ${t.gardu_jenis ?? ""} ${t.gardu_kva ?? "?"} kVA` : labelPenanda(t.penanda))]
                .filter(Boolean)
                .join(" · ") || "isian belum lengkap"}
            </span>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
