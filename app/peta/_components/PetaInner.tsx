"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer, TileLayer, LayersControl, CircleMarker, Polyline, Tooltip, useMap, useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Kotak, GarduPeta, RuteBaris, TiangPeta } from "../_hooks/usePetaIsi";

/**
 * Peta jaringan.
 *
 * `preferCanvas` bukan setelan kosmetik. Leaflet menggambar tiap penanda sebagai
 * elemen DOM secara bawaan, dan peramban mulai tersendat di seribuan elemen.
 * Digambar ke kanvas, puluhan ribu titik masih lancar — dan itu selisih antara
 * peta yang bisa dipakai dan peta yang ditutup orang.
 */

interface Props {
  rute: RuteBaris[];
  tiang: TiangPeta[];
  gardu: GarduPeta[];
  fokus: [[number, number], [number, number]] | null;
  onKotak: (k: Kotak) => void;
}

const WARNA_RUTE = "#F59E0B";
const WARNA_JTM = "#1D3573";
const WARNA_JTR = "#0F766E";
const WARNA_GARDU = "#B91C1C";

export default function PetaInner({ rute, tiang, gardu, fokus, onKotak }: Props) {
  return (
    <MapContainer
      center={[-8.58, 116.1]}
      zoom={12}
      preferCanvas
      zoomControl={false}
      attributionControl
      className="h-full w-full"
      style={{ background: "#0b1220" }}
    >
      <LayersControl position="bottomright">
        <LayersControl.BaseLayer checked name="Citra satelit">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Peta jalan">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <Pemantau onKotak={onKotak} />
      <Fokus batas={fokus} />

      <Isi rute={rute} tiang={tiang} gardu={gardu} />
    </MapContainer>
  );
}

/** Melaporkan kotak pandang tiap peta berhenti bergerak. Penundaannya ada di
 *  hook pengambil data, bukan di sini — supaya peta tetap terasa ringan digeser
 *  sementara kuerinya yang menunggu. */
function Pemantau({ onKotak }: { onKotak: (k: Kotak) => void }) {
  const peta = useMapEvents({
    moveend: () => lapor(),
    zoomend: () => lapor(),
  });

  const lapor = () => {
    const b = peta.getBounds();
    onKotak({
      latMin: b.getSouth(), latMaks: b.getNorth(),
      lngMin: b.getWest(), lngMaks: b.getEast(),
      zoom: peta.getZoom(),
    });
  };

  useEffect(() => {
    lapor();
    // sekali saat peta siap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function Fokus({ batas }: { batas: [[number, number], [number, number]] | null }) {
  const peta = useMap();
  useEffect(() => {
    if (!batas) return;
    const [[laS, lnB], [laU, lnT]] = batas;
    if (laS === laU && lnB === lnT) peta.setView([laS, lnB], 17);
    else peta.fitBounds(batas, { padding: [60, 60], maxZoom: 17 });
  }, [batas, peta]);
  return null;
}

/** Dipisah dan di-`memo` supaya menggeser peta tanpa perubahan data tidak
 *  menggambar ulang ribuan objek. */
const Isi = function Isi({
  rute, tiang, gardu,
}: {
  rute: RuteBaris[];
  tiang: TiangPeta[];
  gardu: GarduPeta[];
}) {
  const garisRute = useMemo(
    () =>
      rute.flatMap((r) =>
        r.bentang.map((b, i) => ({
          kunci: `${r.penyulang}-${i}`,
          titik: [
            [b[0], b[1]],
            [b[2], b[3]],
          ] as [number, number][],
        })),
      ),
    [rute],
  );

  return (
    <>
      {garisRute.map((g) => (
        <Polyline
          key={g.kunci}
          positions={g.titik}
          pathOptions={{ color: WARNA_RUTE, weight: 2.5, opacity: 0.85 }}
        />
      ))}

      {tiang.map((t) =>
        t.indukLat !== null && t.indukLng !== null ? (
          <Polyline
            key={`b-${t.id}`}
            positions={[
              [t.indukLat, t.indukLng],
              [t.lat, t.lng],
            ]}
            pathOptions={{
              color: t.jaringan === "jtr" ? WARNA_JTR : WARNA_JTM,
              weight: 2,
              opacity: 0.9,
            }}
          />
        ) : null,
      )}

      {tiang.map((t) => (
        <CircleMarker
          key={t.id}
          center={[t.lat, t.lng]}
          radius={t.penanda ? 6 : t.percabangan ? 5 : 3.5}
          pathOptions={{
            color: "#fff",
            weight: 1,
            fillColor: t.penanda
              ? "#F59E0B"
              : t.jaringan === "jtr"
                ? WARNA_JTR
                : WARNA_JTM,
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="right" offset={[8, 0]}>
            <span className="text-[11px] font-semibold">{t.kode}</span>
            <span className="block text-[10px]">{t.kelompok}</span>
          </Tooltip>
        </CircleMarker>
      ))}

      {gardu.map((g) => (
        <CircleMarker
          key={g.kode}
          center={[g.lat, g.lng]}
          radius={6}
          pathOptions={{ color: "#fff", weight: 1.5, fillColor: WARNA_GARDU, fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            <span className="text-[11px] font-semibold">{g.kode}</span>
            <span className="block text-[10px]">
              {g.nama}
              {g.jumlahTiang > 0 ? ` · ${g.jumlahTiang} tiang JTR` : ""}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
};
