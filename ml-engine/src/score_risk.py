"""REQ-1.4a — Skor risiko gangguan per penyulang (rule-v1) → daily_feeder_risk.

Skor 0-100 = 100 * sigmoid(bias + Σ bobot·komponen_ternormalisasi).
Tiap komponen transparan → langsung jadi breakdown alasan (REQ-2.2).
Bobot/ambang di bawah = "config" yang bisa dikalibrasi (eksternalisasi ke YAML nanti).

model_version = 'rule-v1'. Saat data cukup, Model A (XGBoost) menggantikan fungsi
score() tanpa mengubah kontrak daily_feeder_risk. predicted_cause di sini = faktor
risiko dominan (rule-based), digantikan Model B (predict_cause.py) di Sprint 4.

Jalankan: python -m src.score_risk            (target = besok / H+1)
          python -m src.score_risk 2026-06-22
"""
from __future__ import annotations

import math
import sys
import time
from datetime import date

from . import build_features, supabase_client

# ── Config rule-v1 ────────────────────────────────────────────────────────────
BIAS = -2.2
WEIGHTS = {
    "Cuaca: angin kencang": 1.4,
    "Cuaca: curah hujan": 1.6,
    "Cuaca: petir": 0.8,
    "Riwayat trip 90 hari": 1.2,
    "Pola rawan saat hujan": 1.5,
    "Temuan pohon terbuka": 1.3,
    "Temuan kritis terbuka": 1.2,
    "Umur temuan tertua": 0.5,
}
CAPS = {"wind": 40.0, "precip": 30.0, "trip90": 8.0, "pohon": 10.0, "kritis": 5.0, "umur": 180.0}
LEVEL_KRITIS, LEVEL_WASPADA = 75.0, 40.0

# Pemetaan faktor → kategori penyebab (untuk predicted_cause rule-based)
CAUSE_OF = {
    "Cuaca: angin kencang": "Cuaca (angin/hujan/petir)",
    "Cuaca: curah hujan": "Cuaca (angin/hujan/petir)",
    "Cuaca: petir": "Cuaca (angin/hujan/petir)",
    "Pola rawan saat hujan": "Cuaca (angin/hujan/petir)",
    "Temuan pohon terbuka": "Pohon / ROW",
    "Riwayat trip 90 hari": "Berulang (historis)",
    "Temuan kritis terbuka": "Aset / temuan",
    "Umur temuan tertua": "Aset / temuan",
}


def _n(v, cap: float) -> float:
    return min(max((v or 0) / cap, 0.0), 1.0)


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def score(f: dict) -> dict:
    sev = min(_n(f["precip_mm"], 20) * 0.6 + _n(f["wind_max_kmh"], 35) * 0.4 + (0.3 if f["thunder"] else 0.0), 1.0)
    comps = {
        "Cuaca: angin kencang": _n(f["wind_max_kmh"], CAPS["wind"]),
        "Cuaca: curah hujan": _n(f["precip_mm"], CAPS["precip"]),
        "Cuaca: petir": 1.0 if f["thunder"] else 0.0,
        "Riwayat trip 90 hari": _n(f["trip_90d"], CAPS["trip90"]),
        "Pola rawan saat hujan": (f["rate_hujan"] or 0.0) * sev,
        "Temuan pohon terbuka": _n(f["temuan_pohon_terbuka"], CAPS["pohon"]),
        "Temuan kritis terbuka": _n(f["temuan_kritis_terbuka"], CAPS["kritis"]),
        "Umur temuan tertua": _n(f["umur_temuan_tertua_hari"], CAPS["umur"]),
    }
    weighted = {k: WEIGHTS[k] * v for k, v in comps.items()}
    z = BIAS + sum(weighted.values())
    risk = round(100 * _sigmoid(z), 2)
    level = "kritis" if risk > LEVEL_KRITIS else "waspada" if risk >= LEVEL_WASPADA else "aman"

    total = sum(v for v in weighted.values() if v > 0) or 1.0
    drivers = sorted(
        ({"faktor": k, "kontribusi": round(100 * v / total)} for k, v in weighted.items() if v > 0),
        key=lambda d: d["kontribusi"],
        reverse=True,
    )[:4]

    predicted_cause, cause_conf = None, None
    if drivers:
        predicted_cause = CAUSE_OF.get(drivers[0]["faktor"])
        cause_conf = float(drivers[0]["kontribusi"])

    breakdown = {
        "fitur": {
            "wind_max_kmh": f["wind_max_kmh"], "precip_mm": f["precip_mm"], "thunder": f["thunder"],
            "trip_30d": f["trip_30d"], "trip_90d": f["trip_90d"], "trip_365d": f["trip_365d"],
            "hari_sejak_trip": f["hari_sejak_trip"], "rate_hujan": f["rate_hujan"],
            "temuan_jaringan_terbuka": f["temuan_jaringan_terbuka"],
            "temuan_pohon_terbuka": f["temuan_pohon_terbuka"],
            "temuan_kritis_terbuka": f["temuan_kritis_terbuka"],
            "umur_temuan_tertua_hari": f["umur_temuan_tertua_hari"],
        },
        "drivers": drivers,
        "catatan": None if f["has_weather"] else "tanpa data cuaca (fallback)",
    }
    return {
        "tgl": f["tgl"], "ulp": f["ulp"], "penyulang": f["penyulang"],
        "risk_score": risk, "risk_level": level,
        "predicted_cause": predicted_cause, "cause_confidence": cause_conf,
        "breakdown": breakdown, "model_version": "rule-v1",
    }


def run(target: date) -> dict:
    feats = build_features.build(target)
    scored = [score(f) for f in feats]
    upserted = supabase_client.upsert_chunked("daily_feeder_risk", scored, on_conflict="tgl,penyulang")
    levels = {"kritis": 0, "waspada": 0, "aman": 0}
    for s in scored:
        levels[s["risk_level"]] += 1
    return {"tgl": target.isoformat(), "scored": upserted, **levels}


def main() -> None:
    target = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else build_features.default_target()
    t0 = time.time()
    try:
        stats = run(target)
        dur = int((time.time() - t0) * 1000)
        print(f"[ok] score_risk selesai dalam {dur} ms")
        for k, v in stats.items():
            print(f"   {k:10}: {v}")
        supabase_client.log_run("score_risk", "ok", str(stats), rows=stats.get("scored", 0), duration_ms=dur)
    except Exception as e:  # noqa: BLE001
        print(f"[error] score_risk gagal: {e}")
        supabase_client.log_run("score_risk", "error", str(e))
        raise


if __name__ == "__main__":
    main()
