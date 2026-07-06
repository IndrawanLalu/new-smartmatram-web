"""Backtest rule-v1 (Model A): prediksi risiko vs gangguan NYATA.

Replay leak-free: fitur riwayat gangguan + cuaca dihitung point-in-time (hanya
data SEBELUM tanggal evaluasi). Fitur inspeksi dinolkan (status tak bisa
direkonstruksi historis) → menguji inti model (riwayat + cuaca).

Evaluasi rolling mingguan. Untuk tiap (feeder, tanggal): skor → level
(kritis/waspada/aman); label = ADA gangguan feeder itu dalam HORIZON hari ke depan.

Jalankan: python -m src.backtest_risk
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta

from . import geo, score_risk, supabase_client

EVAL_START = date(2025, 1, 1)
EVAL_END = date(2026, 6, 30)
STEP_DAYS = 7      # evaluasi tiap minggu (non-overlap dgn horizon 7)
HORIZONS = [1, 3, 7]  # cek gangguan dalam N hari ke depan
RAIN_MM, RAIN_W = 5.0, 30.0


def _to_date(s):
    try:
        return date.fromisoformat(s[:10])
    except (ValueError, TypeError):
        return None


def _bad(w):
    return (w.get("precip_mm") or 0) >= RAIN_MM or (w.get("wind_max_kmh") or 0) >= RAIN_W


def main():
    # ── muat data ────────────────────────────────────────────────────────────
    feeders = {}
    for r in supabase_client.fetch_all("penyulang_ref", "penyulang,ulp,lat,lng"):
        if r.get("lat") is None or r.get("lng") is None:
            continue
        feeders[r["penyulang"]] = {"ulp": r["ulp"], "loc_key": geo.loc_key(float(r["lat"]), float(r["lng"]))}

    by_feeder = defaultdict(list)
    for r in supabase_client.fetch_all("ml_outage_events", "penyulang,tgl_gangguan"):
        d = _to_date(r.get("tgl_gangguan"))
        if d and r.get("penyulang") in feeders:
            by_feeder[r["penyulang"]].append(d)
    for v in by_feeder.values():
        v.sort()

    weather = {}
    for r in supabase_client.fetch_all("weather_daily", "loc_key,tgl,wind_max_kmh,wind_gust_kmh,precip_mm,thunder"):
        d = _to_date(r.get("tgl"))
        if d:
            weather[(r["loc_key"], d)] = r

    # ── rolling backtest ─────────────────────────────────────────────────────
    lvl_tot = Counter()
    lvl_pos = {h: Counter() for h in HORIZONS}  # per horizon: level -> #diikuti gangguan
    n = 0
    outages_in_window = {h: 0 for h in HORIZONS}
    score_sum_pos = score_sum_neg = 0.0
    npos = nneg = 0  # untuk horizon 7 (rata2 skor saat ada/tidak gangguan)

    target = EVAL_START
    while target <= EVAL_END:
        for pen, meta in feeders.items():
            hist = by_feeder.get(pen, [])
            past = [d for d in hist if d < target]
            lk = meta["loc_key"]
            trip30 = sum(1 for d in past if (target - d).days <= 30)
            trip90 = sum(1 for d in past if (target - d).days <= 90)
            trip365 = sum(1 for d in past if (target - d).days <= 365)
            hari = (target - past[-1]).days if past else None
            b = sum(1 for d in past if (w := weather.get((lk, d))) and _bad(w))
            rate = round(b / len(past), 3) if past else 0.0
            wt = weather.get((lk, target))
            f = {
                "penyulang": pen, "ulp": meta["ulp"], "tgl": target.isoformat(),
                "has_weather": wt is not None,
                "wind_max_kmh": wt.get("wind_max_kmh") if wt else None,
                "wind_gust_kmh": wt.get("wind_gust_kmh") if wt else None,
                "precip_mm": wt.get("precip_mm") if wt else None,
                "thunder": bool(wt["thunder"]) if wt and wt.get("thunder") is not None else False,
                "trip_30d": trip30, "trip_90d": trip90, "trip_365d": trip365,
                "hari_sejak_trip": hari, "rate_hujan": rate,
                "temuan_jaringan_terbuka": 0, "temuan_pohon_terbuka": 0,
                "temuan_kritis_terbuka": 0, "umur_temuan_tertua_hari": None,
            }
            s = score_risk.score(f)
            level = s["risk_level"]
            n += 1
            lvl_tot[level] += 1
            for h in HORIZONS:
                hit = any(target < d <= target + timedelta(days=h) for d in hist)
                if hit:
                    lvl_pos[h][level] += 1
                    outages_in_window[h] += 1
            hit7 = any(target < d <= target + timedelta(days=7) for d in hist)
            if hit7:
                score_sum_pos += s["risk_score"]; npos += 1
            else:
                score_sum_neg += s["risk_score"]; nneg += 1
        target += timedelta(days=STEP_DAYS)

    # ── laporan ──────────────────────────────────────────────────────────────
    print("=" * 64)
    print(f"BACKTEST rule-v1  |  {EVAL_START} s/d {EVAL_END}  |  {len(feeders)} feeder")
    print(f"Sampel (feeder-minggu): {n}")
    print("=" * 64)
    for h in HORIZONS:
        base = 100 * outages_in_window[h] / n if n else 0
        print(f"\n── Horizon {h} hari  (base rate gangguan: {base:.1f}%) ──")
        for lv in ("aman", "waspada", "kritis"):
            t = lvl_tot[lv]
            p = lvl_pos[h][lv]
            rate = 100 * p / t if t else 0
            lift = rate / base if base else 0
            print(f"  {lv:8}: {t:6} sampel | {rate:5.1f}% diikuti gangguan | lift {lift:.1f}x")
        tp = lvl_pos[h]["kritis"] + lvl_pos[h]["waspada"]
        flagged = lvl_tot["kritis"] + lvl_tot["waspada"]
        fn = outages_in_window[h] - tp
        prec = 100 * tp / flagged if flagged else 0
        rec = 100 * tp / outages_in_window[h] if outages_in_window[h] else 0
        print(f"  FLAG (kritis+waspada): precision {prec:.1f}% | recall {rec:.1f}% | {flagged} flag/minggu-total")
    print("\n── Rata-rata skor (horizon 7h) ──")
    print(f"  saat ADA gangguan  : {score_sum_pos / npos if npos else 0:.1f}")
    print(f"  saat TIDAK gangguan: {score_sum_neg / nneg if nneg else 0:.1f}")
    print("  (kalau ADA > TIDAK → skor punya sinyal)")


if __name__ == "__main__":
    main()
