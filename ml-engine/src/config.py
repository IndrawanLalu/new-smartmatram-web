"""Konfigurasi terpusat ML engine.

Urutan baca environment: os.environ → ml-engine/.env → ../.env.local (env Next.js).
Dengan begitu di VPS cukup andalkan .env.local yang sudah ada (Supabase service key).
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# ── Path ──────────────────────────────────────────────────────────────────────
ML_ENGINE_DIR = Path(__file__).resolve().parent.parent       # ml-engine/
REPO_ROOT = ML_ENGINE_DIR.parent                             # project root

# os.environ menang; load_dotenv tidak menimpa yang sudah ada (override=False).
load_dotenv(ML_ENGINE_DIR / ".env", override=False)
load_dotenv(REPO_ROOT / ".env.local", override=False)

# ── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# ── Google Sheets (default publik sama dengan lib/sheets.ts) ───────────────────
SHEETS_SPREADSHEET_ID = os.environ.get(
    "SHEETS_SPREADSHEET_ID", "153-gxDh8XrlT1AbNWb5jws0MVc-qD9IQNxxJLRqlKJg"
)
SHEETS_API_KEY = os.environ.get(
    "SHEETS_API_KEY", "AIzaSyAZ1aJVdOVCv4Of60ZwPRsabQsgLaBxzQU"
)
GANGGUAN_SHEET = "gangguanPenyulang"
GANGGUAN_RANGE = "A:S"

# ── Domain ────────────────────────────────────────────────────────────────────
# Cakupan V1: 4 ULP (nama ter-normalisasi, tanpa prefix "ULP ").
# Sheet gangguanPenyulang mencakup seluruh NTB → sync difilter ke scope ini.
ULP_LIST = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"]
ULP_SCOPE = set(ULP_LIST)


def require_supabase() -> tuple[str, str]:
    """Pastikan kredensial Supabase ada; beri error jelas bila tidak."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "Kredensial Supabase tidak ditemukan. Set NEXT_PUBLIC_SUPABASE_URL & "
            "SUPABASE_SERVICE_ROLE_KEY di ml-engine/.env atau ../.env.local "
            "(lihat ml-engine/.env.example)."
        )
    return SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
