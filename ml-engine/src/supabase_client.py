"""Helper Supabase: client tunggal + utilitas fetch/upsert berhalaman."""
from __future__ import annotations

from typing import Any

from supabase import Client, create_client

from . import config

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        url, key = config.require_supabase()
        _client = create_client(url, key)
    return _client


def fetch_all(table: str, columns: str = "*", page_size: int = 1000) -> list[dict[str, Any]]:
    """Ambil semua baris sebuah tabel (PostgREST default limit 1000) via paginasi."""
    client = get_client()
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        resp = client.table(table).select(columns).range(start, start + page_size - 1).execute()
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows


def upsert_chunked(
    table: str, rows: list[dict[str, Any]], on_conflict: str, chunk: int = 500
) -> int:
    """Upsert berkelompok agar payload tidak terlalu besar. Kembalikan jumlah baris."""
    client = get_client()
    total = 0
    for i in range(0, len(rows), chunk):
        part = rows[i : i + chunk]
        client.table(table).upsert(part, on_conflict=on_conflict).execute()
        total += len(part)
    return total


def update_many(table: str, rows: list[dict[str, Any]], id_col: str = "id") -> int:
    """Update banyak baris: satu UPDATE per baris (aman, tidak pakai upsert).

    Lebih lambat dari upsert tapi tidak punya masalah NOT NULL constraint
    karena hanya mengirim kolom yang berubah, bukan full row.
    """
    client = get_client()
    for row in rows:
        pk = row[id_col]
        data = {k: v for k, v in row.items() if k != id_col}
        client.table(table).update(data).eq(id_col, pk).execute()
    return len(rows)


def log_run(job: str, status: str, message: str, rows: int = 0, duration_ms: int = 0) -> None:
    """Tulis audit ke ml_run_log (best-effort; jangan gagalkan job karena logging)."""
    try:
        get_client().table("ml_run_log").insert(
            {
                "job": job,
                "status": status,
                "rows_scored": rows,
                "duration_ms": duration_ms,
                "message": message,
            }
        ).execute()
    except Exception as e:  # noqa: BLE001
        print(f"[warn] gagal menulis ml_run_log: {e}")
