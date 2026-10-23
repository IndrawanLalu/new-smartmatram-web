"use client";

import { memo, useMemo } from "react";
import { CircleMarker, Polyline, Tooltip } from "react-leaflet";
import type { TiangPeta } from "../_hooks/usePetaIsi";
import { kunciSection, type SectionPeta } from "../_hooks/useSectionPeta";

/**
 * Section JTM di peta: gawang tiap tiang JTM berwarna section-nya (digambar di
 * atas garis biasa), nama section di tiang hulunya. Klik gawang / nama =
 * buka panel Section.
 */
export default memo(function LapisanSection({
  tiang,
  anggota,
  perId,
  daftar,
  pilih,
  diam,
  onPilih,
}: {
  tiang: TiangPeta[];
  anggota: Map<string, string>;
  perId: Map<string, SectionPeta>;
  daftar: SectionPeta[];
  pilih: string | null;
  diam: boolean;
  onPilih: (id: string) => void;
}) {
  // Section tiap titik (koordinat + penyulang) — untuk menemukan section INDUK
  // sebuah gawang tanpa id induknya (TiangPeta hanya membawa koordinat induk).
  const diTitik = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tiang) {
      const id = anggota.get(kunciSection(t.id, t.kelompok));
      if (id) m.set(`${t.lat},${t.lng}|${t.kelompok.toUpperCase()}`, id);
    }
    return m;
  }, [tiang, anggota]);

  return (
    <>
      {tiang.map((t) => {
        if (t.jaringan !== "jtm" || t.indukLat === null || t.indukLng === null) return null;
        const id = anggota.get(kunciSection(t.id, t.kelompok));
        const sendiri = id ? perId.get(id) : undefined;
        if (!sendiri) return null;
        // Gawang MASUK ke keypoint masih di sisi hulu peralatannya — milik
        // section sebelumnya (sama dengan panjang di susun_section_penyulang).
        const masukKeypoint = sendiri.tiang_hulu_id === t.id && sendiri.jenis_hulu !== "pangkal";
        const idInduk = masukKeypoint ? diTitik.get(`${t.indukLat},${t.indukLng}|${t.kelompok.toUpperCase()}`) : undefined;
        const s = (idInduk && perId.get(idInduk)) || sendiri;
        const tebal = pilih === s.id;
        return (
          <Polyline
            key={`sc-${t.id}-${t.kelompok}`}
            positions={[[t.indukLat, t.indukLng], [t.lat, t.lng]]}
            interactive={!diam}
            pathOptions={{ color: s.warna, weight: tebal ? 7 : 4, opacity: pilih && !tebal ? 0.35 : 0.9 }}
            eventHandlers={{ click: () => onPilih(s.id) }}
          />
        );
      })}
      {daftar.map((s) =>
        s.hulu ? (
          <CircleMarker
            key={`sch-${s.id}`}
            center={[s.hulu.lat, s.hulu.lng]}
            radius={8}
            interactive={!diam}
            pathOptions={{ color: "#fff", weight: 2, fillColor: s.warna, fillOpacity: 1 }}
            eventHandlers={{ click: () => onPilih(s.id) }}
          >
            <Tooltip permanent direction="right" offset={[10, 0]} className="!bg-[#0d1b2a] !text-[#e2e8f0] !border-0">
              <span className="text-[11px] font-semibold" style={{ color: s.warna }}>{s.nama}</span>
            </Tooltip>
          </CircleMarker>
        ) : null,
      )}
    </>
  );
});
