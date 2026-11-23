"use client";

import { Fragment, useEffect } from "react";
import { CircleMarker, Polyline, useMap } from "react-leaflet";
import type { RekonduktorPetaState } from "../_hooks/useRekonduktorPeta";

/**
 * Rekonduktor JTR di peta: ruas yang kabelnya diganti digambar tebal merah
 * putus-putus di atas JTR gardunya, tiang ruas bercincin; tiang awal yang
 * sedang dipilih bercincin hijau. Dirender HANYA saat survey rekonduktor terbuka.
 */

export const WARNA_REKON = "#DC2626";
const HIJAU = "#16A34A";

export default function LapisanRekonduktor({ s }: { s: RekonduktorPetaState }) {
  const peta = useMap();
  useEffect(() => {
    const c = peta.getContainer();
    c.style.cursor = s.menangkapKlik ? "pointer" : "";
    return () => { c.style.cursor = ""; };
  }, [peta, s.menangkapKlik]);

  const gardu = s.jaringan?.gardu;
  const awal = s.tiangAwal?.id ? s.jaringan?.data.get(s.tiangAwal.id) : null;

  return (
    <>
      {s.ruas.map((r) => {
        const garis: [number, number][] = [
          ...(r.dari_gardu && gardu ? [[gardu.lat, gardu.lng] as [number, number]] : []),
          ...r.tiang.map((t): [number, number] => [t.lat, t.lng]),
        ];
        return (
          <Fragment key={r.id}>
            <Polyline positions={garis} pathOptions={{ color: "#fff", weight: 8, opacity: 0.7 }} interactive={false} />
            {/* Tidak menangkap klik: tiang JTR di bawahnya tetap bisa diklik untuk ruas berikutnya. */}
            <Polyline positions={garis} pathOptions={{ color: WARNA_REKON, weight: 5, dashArray: "8 6" }} interactive={false} />
            {r.tiang.map((t) => (
              <CircleMarker
                key={t.tiang_id} center={[t.lat, t.lng]} radius={6} interactive={false}
                pathOptions={{ color: WARNA_REKON, weight: 2, fillColor: "#fff", fillOpacity: 0.9 }}
              />
            ))}
          </Fragment>
        );
      })}
      {awal && <CircleMarker center={[awal.lat, awal.lng]} radius={10} interactive={false} pathOptions={{ color: HIJAU, weight: 3, fill: false }} />}
      {s.tiangAwal && s.tiangAwal.id === null && gardu && (
        <CircleMarker center={[gardu.lat, gardu.lng]} radius={12} interactive={false} pathOptions={{ color: HIJAU, weight: 3, fill: false }} />
      )}
    </>
  );
}
