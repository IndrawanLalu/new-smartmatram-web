"""Pembaca Google Sheets (Sheets API v4), padanan Python dari lib/sheets.ts.

Mengembalikan list[dict] dengan key = header baris pertama.
"""
from __future__ import annotations

from typing import Any
from urllib.parse import quote

import requests

from . import config


def fetch_sheet(sheet_name: str, rng: str, timeout: int = 30) -> list[dict[str, Any]]:
    full_range = f"{sheet_name}!{rng}"
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/"
        f"{config.SHEETS_SPREADSHEET_ID}/values/{quote(full_range)}"
        f"?key={config.SHEETS_API_KEY}"
    )
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    values: list[list[str]] = resp.json().get("values", [])
    if len(values) < 2:
        return []

    headers = values[0]
    out: list[dict[str, Any]] = []
    for row in values[1:]:
        out.append({h: (row[i] if i < len(row) else "") for i, h in enumerate(headers)})
    return out


def fetch_gangguan_penyulang() -> list[dict[str, Any]]:
    return fetch_sheet(config.GANGGUAN_SHEET, config.GANGGUAN_RANGE)
