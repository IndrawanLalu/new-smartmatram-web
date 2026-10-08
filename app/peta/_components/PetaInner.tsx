"use client";

import { Fragment, memo, useEffect, useMemo } from "react";
import {
  MapContainer, TileLayer, LayersControl, CircleMarker, Marker, Polyline, Tooltip,
  useMap, useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Kotak, GarduPeta, RuteBaris, TiangPeta } from "../_hooks/usePetaIsi";
import { WARNA } from "../_ui";
import { useGayaPeta, type GayaPeta } from "../_hooks/useGayaPeta";
import { htmlPenandaJtm, titikTengahPortal } from "@/lib/penandaJtm";
import type { Penanda } from "../_hooks/usePenandaJtm";
import type { TitikUjungPeta } from "../_hooks/useUjungPeta";
import LapisanUjung from "./LapisanUjung";
import PenggeserTitik from "./PenggeserTitik";
import PenggeserBanyak from "./PenggeserBanyak";
import type { GeserTiang } from "../_hooks/useGeserBanyak";
import LapisanSimulasi from "./LapisanSimulasi";
import LapisanKesehatan from "./LapisanKesehatan";
import LapisanNama from "./LapisanNama";
import LapisanPersetujuan from "./LapisanPersetujuan";
import LapisanPohon from "./LapisanPohon";
import type { PohonDirabas, TemuanPohon } from "../_hooks/usePohonPeta";
import type { AntreanJtr } from "../_hooks/useAntreanJtr";
import type { SorotJtm } from "./PersetujuanJtmPeta";
import type { TiangBanding } from "@/app/admin/jtr/_hooks/useApprovalJtr";
import type { KesehatanGardu } from "../_hooks/useKesehatanPeta";
import type { HasilSimulasi } from "../_hooks/useSimulasiBuka";

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
  /** Klik benda → panel rincian (Tahap 2). Harus stabil (useCallback) supaya
   *  `Isi` yang di-memo tidak menggambar ulang ribuan objek. */
  onPilihTiang: (t: TiangPeta) => void;
  onPilihGardu: (g: GarduPeta) => void;
  /** Benda terpilih disorot; `geser` = posisi baru saat "Geser titik" aktif. */
  sorot: { lat: number; lng: number } | null;
  geser: { lat: number; lng: number } | null;
  onGeser: (lat: number, lng: number) => void;
  /** Mode geser titik: pegangan seret tiap tiang yang sudah diklik. */
  geserBanyak: GeserTiang[];
  onSeretBanyak: (id: string, lat: number, lng: number) => void;
  ujung: TitikUjungPeta[];
  bolehSetujuiUjung: boolean;
  oleh: string;
  onUjungDisetujui: (id: string) => void;
  /** Lapisan pohon (kosong = padam). */
  pohonTemuan: TemuanPohon[];
  pohonDirabas: PohonDirabas[];
  onTugaskanPohon?: (t: TemuanPohon) => void;
  simulasi: HasilSimulasi | null;
  kesehatan: KesehatanGardu[];
  onPilihKesehatan: (g: KesehatanGardu) => void;
  /** Nama tiang / nomor kabel JTR tertulis tetap di peta. */
  namaTiang: boolean;
  nomorKabel: boolean;
  /** Antrean persetujuan JTR (null = lapisannya padam) & tiang yang berubah
   *  dalam inspeksi yang sedang dibuka. */
  antrean: AntreanJtr[] | null;
  onPilihAntrean: (d: AntreanJtr) => void;
  sorotPerubahan: TiangBanding[] | null;
  /** Tiang segmen inspeksi JTM yang sedang dibuka persetujuannya. */
  sorotJtm: SorotJtm[] | null;
}

// Warnanya datang dari `../_ui` supaya kotak centang di panel kiri dan benda
// yang digambar di sini TIDAK BISA berbeda — di situlah panel berhenti jadi
// daftar dan mulai jadi legenda.
const { rute: WARNA_RUTE, gardu: WARNA_GARDU } = WARNA;

type JenisGaris = "jtm" | "jtr" | "ub" | "putus";
const jenisGaris = (t: TiangPeta): JenisGaris =>
  t.jaringan !== "jtr" ? "jtm" : t.kabelPutus ? "putus" : (t.jumlahKabel ?? 0) >= 2 ? "ub" : "jtr";

/** Gaya garis tiang → induknya, dari pengaturan Warna & simbol.
 *  Underbuild JTR: garis tebal bertepi putih (terbaca "dua kabel");
 *  kabel belum jelas: putus-putus + tanda "!" di tengah gawang. */
const gayaGaris = (j: JenisGaris, g: GayaPeta) =>
  j === "jtm" ? { color: g.jtm, weight: 2, opacity: 0.9 }
  : j === "putus" ? { color: g.putus, weight: 3, opacity: 1, dashArray: "6 5" }
  : j === "ub" ? { color: g.jtrUb, weight: 4, opacity: 1 }
  : { color: g.jtr, weight: 2, opacity: 0.9 };

const ikonPutus = (warna: string) =>
  L.divIcon({
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${warna};border:2px solid #fff;color:#fff;font:700 11px/12px sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.6)">!</div>`,
  });

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

export default function PetaInner({
  rute, tiang, gardu, fokus, onKotak, penanda, onPilihTiang, onPilihGardu,
  sorot, geser, onGeser, geserBanyak, onSeretBanyak, ujung, bolehSetujuiUjung, oleh, onUjungDisetujui, pohonTemuan, pohonDirabas, onTugaskanPohon, simulasi,
  kesehatan, onPilihKesehatan, namaTiang, nomorKabel, antrean, onPilihAntrean, sorotPerubahan, sorotJtm,
}: Props) {
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
        {/* Bawaan peta jalan: petaknya jauh lebih ringan dari citra satelit,
            jadi halaman terbuka cepat. Citra tinggal dipilih di pojok kanan bawah. */}
        <LayersControl.BaseLayer name="Citra satelit">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer checked name="Peta jalan">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <Pemantau onKotak={onKotak} />
      <Fokus batas={fokus} />

      <Isi
        rute={rute} tiang={tiang} gardu={gardu} penanda={penanda}
        onPilihTiang={onPilihTiang} onPilihGardu={onPilihGardu}
      />
      <LapisanNama tiang={tiang} nama={namaTiang} nomor={nomorKabel} />
      <LapisanPersetujuan antrean={antrean} onPilih={onPilihAntrean} sorot={sorotPerubahan} sorotJtm={sorotJtm} />
      <LapisanKesehatan gardu={kesehatan} onPilih={onPilihKesehatan} />
      <LapisanSimulasi hasil={simulasi} />
      <LapisanUjung titik={ujung} bolehSetujui={bolehSetujuiUjung} oleh={oleh} onDisetujui={onUjungDisetujui} />
      <LapisanPohon temuan={pohonTemuan} dirabas={pohonDirabas} onTugaskan={onTugaskanPohon} />
      <PenggeserTitik sorot={sorot} geser={geser} onGeser={onGeser} />
      <PenggeserBanyak daftar={geserBanyak} onSeret={onSeretBanyak} />
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
  rute, tiang, gardu, penanda, onPilihTiang, onPilihGardu,
}: {
  rute: RuteBaris[];
  tiang: TiangPeta[];
  gardu: GarduPeta[];
  penanda: Map<string, Penanda>;
  onPilihTiang: (t: TiangPeta) => void;
  onPilihGardu: (g: GarduPeta) => void;
}) {
  const gaya = useGayaPeta();
  const ikonTandaPutus = useMemo(() => ikonPutus(gaya.putus), [gaya.putus]);
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
    const p: { t: TiangPeta; ikon: L.DivIcon; label: string; posisi: [number, number] }[] = [];
    const portal = titikTengahPortal(tiang);
    for (const t of tiang) {
      const ref = t.penanda ? penanda.get(t.penanda) : undefined;
      if (!ref) { b.push(t); continue; }
      // Gardu portal: kedua tiangnya bulatan biasa, gardunya di tengah.
      const tengah = portal.get(t.id);
      if (tengah) b.push(t);
      p.push({
        t,
        posisi: tengah ?? [t.lat, t.lng],
        label: tengah ? `${ref.label} portal` : ref.label,
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

      {tiang.map((t) => {
        if (t.indukLat === null || t.indukLng === null) return null;
        const j = jenisGaris(t);
        const posisi: [number, number][] = [
          [t.indukLat, t.indukLng],
          [t.lat, t.lng],
        ];
        return (
          // Jenis garis ikut di kunci: berubah jenis = garis digambar ulang.
          // Leaflet `setStyle` hanya menimpa opsi yang DISEBUT, jadi garis
          // yang sudah dibetulkan tetap putus-putus kalau cuma gayanya diganti.
          <Fragment key={`b-${t.kelompok}-${t.id}-${j}`}>
            {j === "ub" && (
              <Polyline positions={posisi} interactive={false} pathOptions={{ color: "#ffffff", weight: 8, opacity: 0.85 }} />
            )}
            <Polyline positions={posisi} pathOptions={gayaGaris(j, gaya)}>
              <Tooltip sticky>
                <span className="text-[11px]">{t.kelompok}</span>
                {j === "ub" && <span className="block text-[10px]">underbuild JTR · {t.jumlahKabel} kabel</span>}
                {j === "putus" && (
                  <span className="block text-[10px]">{t.kode}: kabel belum jelas datang dari tiang mana</span>
                )}
              </Tooltip>
            </Polyline>
            {j === "putus" && gaya.tandaPutus && (
              <Marker
                position={[(t.indukLat + t.lat) / 2, (t.indukLng + t.lng) / 2]}
                icon={ikonTandaPutus}
                eventHandlers={{ click: () => onPilihTiang(t) }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  <span className="text-[11px]">{t.kode}: kabel belum jelas datang dari tiang mana — klik untuk membetulkan</span>
                </Tooltip>
              </Marker>
            )}
          </Fragment>
        );
      })}

      {/* Tiang bertanda memakai bentuk dari tab Pengaturan — gardu segitiga,
          FCO belah ketupat, dan seterusnya. Sebelumnya semuanya bulat kuning,
          sehingga gardu dan FCO tak terbedakan padahal bentuknya sudah diatur.
          Hanya yang bertanda yang jadi elemen DOM; jumlahnya sedikit, dan
          selebihnya tetap lingkaran di kanvas. */}
      {/* Satu batang bisa tampil di dua penyulang (underbuild) — kuncinya per
          kelompok. Yang menumpang digambar berongga: batangnya milik orang
          lain, kabelnya milik kelompok ini. */}
      {/* Cincin luar: batang yang dipakai juga JTR gardu lain. Digambar
          sebelum tiangnya, tidak bisa diklik — tiangnya yang diklik. */}
      {tiang.map((t) =>
        t.garduBersama ? (
          <CircleMarker
            key={`bersama-${t.kelompok}-${t.id}`}
            center={[t.lat, t.lng]}
            radius={9}
            interactive={false}
            pathOptions={{ color: gaya.bersama, weight: 2, fill: false }}
          />
        ) : null,
      )}

      {biasa.map((t) => {
        const warna = t.jaringan === "jtr" ? gaya.jtr : gaya.jtm;
        return (
          <CircleMarker
            key={`${t.kelompok}-${t.id}`}
            center={[t.lat, t.lng]}
            radius={t.percabangan ? 6 : 5}
            eventHandlers={{ click: () => onPilihTiang(t) }}
            pathOptions={
              t.diJtm
                ? { color: warna, weight: 2.5, fillColor: gaya.jtrDiJtm, fillOpacity: 1 }
                : t.menumpang
                  ? { color: warna, weight: 2.5, fillColor: gaya.menumpang, fillOpacity: 1 }
                  : { color: "#fff", weight: 1, fillColor: warna, fillOpacity: 1 }
            }
          >
            <Tooltip direction="top" offset={[0, -6]} sticky>
              <span className="text-[11px] font-semibold">{t.kode}</span>
              <span className="block text-[10px]">
                {t.kelompok}
                {t.diJtm ? " · di tiang JTM" : t.menumpang ? " · menumpang" : ""}
              </span>
              {t.garduBersama && (
                <span className="block text-[10px]">
                  {t.garduBersama === "?" ? "ada JTR gardu lain (belum diketahui)" : `dipakai juga JTR ${t.garduBersama}`}
                </span>
              )}
            </Tooltip>
          </CircleMarker>
        );
      })}

      {bertanda.map(({ t, ikon, label, posisi }) => (
        <Marker
          key={`${t.kelompok}-${t.id}`}
          position={posisi}
          icon={ikon}
          eventHandlers={{ click: () => onPilihTiang(t) }}
        >
          <Tooltip direction="top" offset={[0, -10]} sticky>
            <span className="text-[11px] font-semibold">{t.kode}</span>
            <span className="block text-[10px]">
              {label} · {t.kelompok}
              {t.menumpang ? " · menumpang" : ""}
            </span>
          </Tooltip>
        </Marker>
      ))}

      {gardu.map((g) => (
        <Marker
          key={`${g.ulp}-${g.kode}`}
          position={[g.lat, g.lng]}
          icon={IKON_GARDU}
          eventHandlers={{ click: () => onPilihGardu(g) }}
        >
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
