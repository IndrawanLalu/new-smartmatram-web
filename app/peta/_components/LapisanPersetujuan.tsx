"use client";

import { CircleMarker, Tooltip } from "react-leaflet";
import type { TiangBanding } from "@/app/admin/jtr/_hooks/useApprovalJtr";
import type { AntreanJtr } from "../_hooks/useAntreanJtr";
import type { KeadaanTiangJtm, SorotJtm } from "./PersetujuanJtmPeta";

/**
 * Lapisan persetujuan inspeksi JTR:
 *   • gardu dalam antrean — cincin kuning, klik untuk membuka persetujuannya;
 *   • tiang yang BARU / DIKOREKSI / DINONAKTIFKAN dalam inspeksi yang sedang
 *     dibuka — supaya perbandingan sebelum–sesudah tidak luput di peta utama.
 * Persetujuan JTM: tiang segmen yang sedang dibuka — dinilai normal, ada
 * temuan, atau belum dinilai.
 */

const WARNA_UBAH = { baru: "#22C55E", berubah: "#F59E0B", hilang: "#EF4444" } as const;
const WARNA_JTM: Record<KeadaanTiangJtm, string> = { normal: "#22C55E", temuan: "#F97316", belum: "#EF4444" };

export default function LapisanPersetujuan({
  antrean,
  onPilih,
  sorot,
  sorotJtm,
}: {
  antrean: AntreanJtr[] | null;
  onPilih: (d: AntreanJtr) => void;
  sorot: TiangBanding[] | null;
  sorotJtm: SorotJtm[] | null;
}) {
  return (
    <>
      {(antrean ?? []).map((d) =>
        d.lat === null || d.lng === null ? null : (
          <CircleMarker
            key={`antre-${d.id}`}
            center={[d.lat, d.lng]}
            radius={15}
            eventHandlers={{ click: () => onPilih(d) }}
            pathOptions={{ color: "#FACC15", weight: 3, fillColor: "#FACC15", fillOpacity: 0.15 }}
          >
            <Tooltip direction="top" offset={[0, -14]}>
              <span className="text-[11px] font-semibold">{d.gardu_kode} — menunggu persetujuan JTR</span>
              <span className="block text-[10px]">{[d.inspektor_nama, d.tgl_selesai].filter(Boolean).join(" · ")}</span>
            </Tooltip>
          </CircleMarker>
        ),
      )}

      {(sorot ?? []).map((t) =>
        t.perubahan === "lama" || t.lat === null || t.lng === null ? null : (
          <CircleMarker
            key={`ubah-${t.id}`}
            center={[t.lat, t.lng]}
            radius={10}
            interactive={false}
            pathOptions={{
              color: WARNA_UBAH[t.perubahan],
              weight: 2.5,
              fillOpacity: 0,
              dashArray: t.perubahan === "hilang" ? "3 3" : undefined,
            }}
          />
          // Tidak bisa diklik (dan karena itu tanpa tooltip): cincinnya
          // menutupi tiang di bawahnya, dan tiang itulah yang mau diklik.
        ),
      )}

      {(sorotJtm ?? []).map((t) => (
        <CircleMarker
          key={`jtm-${t.id}`}
          center={[t.lat, t.lng]}
          radius={10}
          interactive={false}
          pathOptions={{
            color: WARNA_JTM[t.keadaan],
            weight: 2.5,
            fillOpacity: 0,
            dashArray: t.keadaan === "belum" ? "3 3" : undefined,
          }}
        />
      ))}
    </>
  );
}
