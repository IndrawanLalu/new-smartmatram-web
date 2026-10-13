import { useMemo } from "react";
import L from "leaflet";
import { htmlPenandaJtm } from "@/lib/penandaJtm";
import type { Penanda } from "../_hooks/usePenandaJtm";

/**
 * Ikon peta yang dipakai lebih dari satu lapisan: rumah gardu dan penanda
 * tiang JTM (keypoint). Hanya diimpor komponen peta yang dimuat `ssr: false`
 * — Leaflet menyentuh `window` begitu dimuat.
 *
 * DIBUAT SEKALI, dipakai ulang oleh semua penanda. Leaflet membolehkan satu
 * objek ikon dipakai banyak penanda, dan itu bukan penghematan kecil: membuat
 * divIcon per gardu berarti menyusun dua ribu potong HTML tiap kali peta
 * digambar ulang.
 */

export const UKURAN_GARDU = 16;
const rumah = new Map<string, L.DivIcon>();

/** Rumah gardu berwarna `warna`. Tambatannya di bawah-tengah, jadi kaki
 *  rumahnya yang duduk di koordinat, bukan titik tengahnya. */
export function ikonGardu(warna: string): L.DivIcon {
  let ikon = rumah.get(warna);
  if (!ikon) {
    ikon = L.divIcon({
      className: "",
      iconSize: [UKURAN_GARDU, UKURAN_GARDU],
      iconAnchor: [UKURAN_GARDU / 2, UKURAN_GARDU],
      html: `<svg viewBox="0 0 16 16" width="${UKURAN_GARDU}" height="${UKURAN_GARDU}" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.75));">
    <polygon points="8,1 15,7 1,7" fill="${warna}" stroke="rgba(255,255,255,0.6)" stroke-width="0.7"/>
    <rect x="3" y="7" width="10" height="8" fill="${warna}" stroke="rgba(255,255,255,0.6)" stroke-width="0.7"/>
    <rect x="6" y="10" width="4" height="5" fill="rgba(0,0,0,0.35)"/>
  </svg>`,
    });
    rumah.set(warna, ikon);
  }
  return ikon;
}

/** Penanda JTM (bentuk & warna dari Pengaturan JTM) → ikon, satu per kode
 *  penanda. Kotak ikon 4 px lebih lebar dari gambarnya, ditambat di tengah. */
export function useIkonPenanda(penanda: Map<string, Penanda>, sisi = 16) {
  return useMemo(() => {
    const m = new Map<string, L.DivIcon>();
    for (const [kode, p] of penanda) {
      m.set(kode, L.divIcon({
        className: "",
        html: htmlPenandaJtm(p.bentuk, p.warna, sisi),
        iconSize: [sisi + 4, sisi + 4],
        iconAnchor: [(sisi + 4) / 2, (sisi + 4) / 2],
      }));
    }
    return m;
  }, [penanda, sisi]);
}
