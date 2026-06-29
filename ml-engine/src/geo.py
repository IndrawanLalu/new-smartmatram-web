"""Geolokasi penyulang & helper lokasi cuaca.

Cuaca di-key per `loc_key` (koordinat dibulatkan 3 desimal ~ 100 m) agar:
  • backfill historis tidak menduplikasi cuaca per penyulang,
  • panггilan Open-Meteo dedup ke titik unik (V1: 4 centroid ULP),
  • bisa di-refine per penyulang tanpa ubah skema (cukup ubah lat/lng).
"""
from __future__ import annotations

# Centroid representatif per ULP (Lombok). Cukup untuk grid Open-Meteo (~11 km).
# Penyulang yang jauh dari pusat ULP dapat di-override di penyulang_ref nanti.
ULP_CENTROID: dict[str, tuple[float, float]] = {
    "AMPENAN": (-8.565, 116.072),
    "CAKRANEGARA": (-8.583, 116.133),
    "GERUNG": (-8.717, 116.130),
    "TANJUNG": (-8.354, 116.143),
}


def loc_key(lat: float, lng: float) -> str:
    return f"{lat:.3f},{lng:.3f}"


def centroid_for(ulp: str | None) -> tuple[float, float] | None:
    return ULP_CENTROID.get((ulp or "").upper())
