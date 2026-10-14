"use client";

import { Fragment, memo, useState } from "react";
import { CircleMarker, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { GarduInfo, GrafSld, Simpul } from "@/lib/sld";
import { ikonGardu, useIkonPenanda } from "../_lib/ikonPeta";
import { warnaDari } from "../_lib/warnaSld";
import type { Penanda } from "../_hooks/usePenandaJtm";
import LabelTetap from "./LabelTetap";

/**
 * Mode SLD: hanya pangkal, garis ringkas, keypoint, gardu, dan ujung — bukan
 * ribuan tiang (3.943 tiang → 633 simpul untuk 44 penyulang, 13 Okt 2026).
 * Garis berwarna per penyulang; gardu berwarna menurut % beban pengukuran
 * terakhirnya. Percabangan tidak digambar — hanya belokan garis.
 *
 * Label (saklar di bilah atas) = pita kecil di KANAN ikon (pola Nama tiang):
 * keypoint = jenis penanda + nama peralatan ("Recloser MALOMBA", atau "LBS"
 * bila namanya belum diisi), gardu = kode gardu. Kode tiang & rincian tetap
 * di tooltip saat disentuh. Label gardu baru tertulis
 * mulai ZOOM_LABEL_GARDU — 60 gardu satu penyulang di peta jauh pasti
 * bertumpuk, keypoint (4–29 per penyulang) tetap terbaca.
 */

const ZOOM_LABEL_GARDU = 15;

const MERAH = "#DC2626";
const IKON_GARDU = {
  hijau: ikonGardu("#16A34A"),
  kuning: ikonGardu("#F59E0B"),
  merah: ikonGardu(MERAH),
  abu: ikonGardu("#94A3B8"),
};
const IKON_PANGKAL = L.divIcon({
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<div style="width:22px;height:22px;border-radius:4px;background:#0F172A;border:2px solid #fff;color:#fff;font:700 11px/18px sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.5)">P</div>`,
});

/** % beban terakhir → warna rumah gardu. Belum diukur = abu-abu. */
export const nadaGardu = (g: GarduInfo | undefined) =>
  !g || g.persen === null ? "abu" : g.persen >= 80 ? "merah" : g.persen >= 60 ? "kuning" : "hijau";

interface Props {
  graf: GrafSld[];
  warna: Map<string, string>;
  gardu: Map<string, GarduInfo>;
  penanda: Map<string, Penanda>;
  /** Label kode tetap tertulis (bukan hanya saat disentuh). */
  label: boolean;
}

function LapisanSld({ graf, warna, gardu, penanda, label }: Props) {
  const ikonKeypoint = useIkonPenanda(penanda);
  const peta = useMap();
  const [zoom, setZoom] = useState(() => peta.getZoom());
  useMapEvents({ zoomend: () => setZoom(peta.getZoom()) });
  const labelGardu = label && zoom >= ZOOM_LABEL_GARDU;
  const tanda = (s: Simpul) => (s.penanda ? penanda.get(s.penanda)?.label ?? s.penanda : "");
  const labelKeypoint = (s: Simpul, penyulang: string) =>
    s.jenis === "pangkal" ? `Pangkal ${penyulang}` : [tanda(s), s.nama].filter(Boolean).join(" ");

  return (
    <>
      {graf.map((g) => {
        const w = warnaDari(warna, g.penyulang);
        const simpul = [...g.simpul.values()];
        return (
          <Fragment key={g.penyulang}>
            {simpul.map((s) =>
              s.jalur.length > 1 ? (
                <Polyline key={`g-${s.id}`} positions={s.jalur} pathOptions={{ color: w, weight: 3.5, opacity: 0.9 }} interactive={false} />
              ) : null,
            )}

            {simpul.map((s) => {
              if (s.jenis === "pangkal" || s.jenis === "keypoint") {
                const ikon = s.jenis === "pangkal" ? IKON_PANGKAL : ikonKeypoint.get(s.penanda ?? "");
                if (!ikon) return null;
                return (
                  <Fragment key={s.id}>
                    <Marker position={[s.lat, s.lng]} icon={ikon} zIndexOffset={600}>
                      <Tooltip direction="top" offset={[0, -10]}>
                        <span className="text-[11px] font-semibold">{s.kode}</span>
                        <span className="block text-[10px]">{labelKeypoint(s, g.penyulang)}</span>
                      </Tooltip>
                    </Marker>
                    {label && (
                      <LabelTetap posisi={[s.lat, s.lng]} teks={labelKeypoint(s, g.penyulang)} nada={s.jenis === "pangkal" ? "pangkal" : "alat"}
                        geser={[s.jenis === "pangkal" ? 13 : 11, 0]} />
                    )}
                  </Fragment>
                );
              }
              if (s.jenis === "gardu") {
                const info = s.gardu ? gardu.get(s.gardu) : undefined;
                return (
                  <Fragment key={s.id}>
                  <Marker position={[s.lat, s.lng]} icon={IKON_GARDU[nadaGardu(info)]} zIndexOffset={400}>
                    <Tooltip direction="top" offset={[0, -14]}>
                      <span className="text-[11px] font-semibold">{s.gardu ?? `${s.kode} (kode gardu belum diisi)`}</span>
                      {info && (
                        <span className="block text-[10px]">
                          {info.nama ?? ""} · {info.daya ?? "?"} kVA
                          {info.persen !== null ? ` · beban ${info.persen.toFixed(0)}%` : " · belum diukur"}
                        </span>
                      )}
                    </Tooltip>
                  </Marker>
                  {labelGardu && <LabelTetap posisi={[s.lat, s.lng]} teks={s.gardu ?? s.kode} nada="gardu" geser={[9, -8]} />}
                  </Fragment>
                );
              }
              return s.jenis === "ujung" ? (
                <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={3} interactive={false}
                  pathOptions={{ color: w, weight: 1, fillOpacity: 1 }} />
              ) : null;
            })}
          </Fragment>
        );
      })}
    </>
  );
}

export default memo(LapisanSld);
