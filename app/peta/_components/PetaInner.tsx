"use client";

import { memo, useEffect, useMemo } from "react";
import {
  MapContainer, TileLayer, LayersControl, CircleMarker, Marker, Polyline, Tooltip,
  useMap, useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Kotak, GarduPeta, RuteBaris, TiangPeta } from "../_hooks/usePetaIsi";
import { WARNA } from "../_ui";
import { htmlPenandaJtm } from "@/lib/penandaJtm";
import type { Penanda } from "../_hooks/usePenandaJtm";

/**
 * Peta jaringan.
 *
 * `preferCanvas` bukan setelan kosmetik. Leaflet menggambar tiap penanda sebagai
 * elemen DOM secara bawaan, dan peramban mulai tersendat di seribuan elemen.
 * Digambar ke kanvas, puluhan ribu titik masih lancar — dan itu selisih antara
 * peta yang bisa dipakai dan peta yang ditutup orang.
 *
 * Kecualinya gardu: ia berbentuk rumah, dan Leaflet hanya bisa menggambar
 * lingkaran, garis, dan poligon ke kanvas. Jadi gardu tetap elemen DOM — pilihan
 * sadar, bukan kelalaian. Jumlahnya berbatas (2.092 bertitik dari 2.536, dan
 * tidak bertambah cepat), lapisannya padam saat halaman dibuka, dan yang di luar
 * layar tidak pernah diminta. Yang tidak berbatas itu tiang, dan tiang tetap
 * lingkaran di kanvas.
 */

interface Props {
  rute: RuteBaris[];
  tiang: TiangPeta[];
  gardu: GarduPeta[];
  fokus: [[number, number], [number, number]] | null;
  onKotak: (k: Kotak) => void;
  /** Kode penanda → bentuk & warnanya, dari tab Pengaturan JTM. */
  penanda: Map<string, Penanda>;
}

// Warnanya datang dari `../_ui` supaya kotak centang di panel kiri dan benda
// yang digambar di sini TIDAK BISA berbeda — di situlah panel berhenti jadi
// daftar dan mulai jadi legenda.
const { rute: WARNA_RUTE, jtm: WARNA_JTM, jtr: WARNA_JTR, gardu: WARNA_GARDU } = WARNA;

/**
 * Ikon rumah untuk gardu — bentuk yang sama dengan `/admin/peta-gardu`, supaya
 * benda yang sama tidak tampil sebagai dua hal berbeda di dua peta.
 *
 * DIBUAT SEKALI, dipakai ulang oleh semua penanda. Leaflet membolehkan satu
 * objek ikon dipakai banyak penanda, dan itu bukan penghematan kecil: membuat
 * divIcon per gardu berarti menyusun dua ribu potong HTML tiap kali peta
 * digambar ulang. Tambatannya di bawah-tengah, jadi kaki rumahnya yang duduk
 * di koordinat, bukan titik tengahnya.
 */
const SISI_PENANDA = 16;
const UKURAN_GARDU = 16;
const IKON_GARDU = L.divIcon({
  className: "",
  iconSize: [UKURAN_GARDU, UKURAN_GARDU],
  iconAnchor: [UKURAN_GARDU / 2, UKURAN_GARDU],
  html: `<svg viewBox="0 0 16 16" width="${UKURAN_GARDU}" height="${UKURAN_GARDU}" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.75));">
    <polygon points="8,1 15,7 1,7" fill="${WARNA_GARDU}" stroke="rgba(255,255,255,0.6)" stroke-width="0.7"/>
    <rect x="3" y="7" width="10" height="8" fill="${WARNA_GARDU}" stroke="rgba(255,255,255,0.6)" stroke-width="0.7"/>
    <rect x="6" y="10" width="4" height="5" fill="rgba(0,0,0,0.35)"/>
  </svg>`,
});

export default function PetaInner({ rute, tiang, gardu, fokus, onKotak, penanda }: Props) {
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

      <Isi rute={rute} tiang={tiang} gardu={gardu} penanda={penanda} />
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
const Isi = memo(function Isi({
  rute, tiang, gardu, penanda,
}: {
  rute: RuteBaris[];
  tiang: TiangPeta[];
  gardu: GarduPeta[];
  penanda: Map<string, Penanda>;
}) {
  const garisRute = useMemo(
    () =>
      rute.flatMap((r) =>
        r.bentang.map((b, i) => ({
          kunci: `${r.penyulang}-${i}`,
          nama: r.penyulang,
          titik: [
            [b[0], b[1]],
            [b[2], b[3]],
          ] as [number, number][],
        })),
      ),
    [rute],
  );

  /** Ikon dibuat sekali per (penanda, tiang) dan tidak disusun ulang tiap peta
   *  digeser. Tiang yang penandanya tidak dikenal jatuh ke lingkaran biasa
   *  daripada hilang dari peta. */
  const { biasa, bertanda } = useMemo(() => {
    const b: TiangPeta[] = [];
    const p: { t: TiangPeta; ikon: L.DivIcon; label: string }[] = [];
    for (const t of tiang) {
      const ref = t.penanda ? penanda.get(t.penanda) : undefined;
      if (!ref) { b.push(t); continue; }
      p.push({
        t,
        label: ref.label,
        ikon: L.divIcon({
          className: "",
          html: htmlPenandaJtm(ref.bentuk, ref.warna, SISI_PENANDA),
          iconSize: [SISI_PENANDA + 4, SISI_PENANDA + 4],
          iconAnchor: [(SISI_PENANDA + 4) / 2, (SISI_PENANDA + 4) / 2],
        }),
      });
    }
    return { biasa: b, bertanda: p };
  }, [tiang, penanda]);

  return (
    <>
      {garisRute.map((g) => (
        <Polyline
          key={g.kunci}
          positions={g.titik}
          pathOptions={{ color: WARNA_RUTE, weight: 2.5, opacity: 0.85 }}
        >
          {/* Di zoom jauh garis inilah satu-satunya yang terlihat. Tanpa
              tooltip, menghadap beberapa penyulang sekaligus berarti menebak
              garis mana milik siapa. */}
          <Tooltip sticky>
            <span className="text-[11px] font-semibold">{g.nama}</span>
          </Tooltip>
        </Polyline>
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
          >
            <Tooltip sticky>
              <span className="text-[11px]">{t.kelompok}</span>
            </Tooltip>
          </Polyline>
        ) : null,
      )}

      {/* Tiang bertanda memakai bentuk dari tab Pengaturan — gardu segitiga,
          FCO belah ketupat, dan seterusnya. Sebelumnya semuanya bulat kuning,
          sehingga gardu dan FCO tak terbedakan padahal bentuknya sudah diatur.
          Hanya yang bertanda yang jadi elemen DOM; jumlahnya sedikit, dan
          selebihnya tetap lingkaran di kanvas. */}
      {biasa.map((t) => (
        <CircleMarker
          key={t.id}
          center={[t.lat, t.lng]}
          radius={t.percabangan ? 6 : 5}
          pathOptions={{
            color: "#fff",
            weight: 1,
            fillColor: t.jaringan === "jtr" ? WARNA_JTR : WARNA_JTM,
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]} sticky>
            <span className="text-[11px] font-semibold">{t.kode}</span>
            <span className="block text-[10px]">{t.kelompok}</span>
          </Tooltip>
        </CircleMarker>
      ))}

      {bertanda.map(({ t, ikon, label }) => (
        <Marker key={t.id} position={[t.lat, t.lng]} icon={ikon}>
          <Tooltip direction="top" offset={[0, -10]} sticky>
            <span className="text-[11px] font-semibold">{t.kode}</span>
            <span className="block text-[10px]">
              {label} · {t.kelompok}
            </span>
          </Tooltip>
        </Marker>
      ))}

      {gardu.map((g) => (
        <Marker key={g.kode} position={[g.lat, g.lng]} icon={IKON_GARDU}>
          <Tooltip direction="top" offset={[0, -UKURAN_GARDU]}>
            <span className="text-[11px] font-semibold">{g.kode}</span>
            <span className="block text-[10px]">
              {g.nama}
              {g.jumlahTiang > 0 ? ` · ${g.jumlahTiang} tiang JTR` : ""}
            </span>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
});
