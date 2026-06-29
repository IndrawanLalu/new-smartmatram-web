"""Ingest PDF pembelajaran (buku/SPLN) → embedding → Supabase `dokumen_chunks`.

Jalankan dari folder ml-engine (venv aktif):
    python -m src.ingest_dokumen                 # semua PDF di ./docs
    python -m src.ingest_dokumen --dir ./docs --buku "Buku 2" --page-offset 4

Re-run aman: tiap buku dihapus dulu sebelum di-insert ulang (idempoten per buku).
Prasyarat: jalankan scripts/rag-dokumen-schema.sql di Supabase + GEMINI_API_KEY di env.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import time
from pathlib import Path

import requests
from pypdf import PdfReader

# Console Windows (cp1252) gagal encode karakter seperti "→". Paksa stdout UTF-8.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

from . import config  # noqa: F401 — memuat .env.local (GEMINI_API_KEY, Supabase)
from .supabase_client import get_client

EMBED_MODEL = "gemini-embedding-001"
EMBED_DIM = 1536
EMBED_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:batchEmbedContents"
CHUNK_CHARS = 1200          # ~300-400 token per potongan
CHUNK_OVERLAP = 200
EMBED_BATCH = 50
DOCS_DIR_DEFAULT = Path(__file__).resolve().parent.parent / "docs"


def _api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY tidak ditemukan (set di ../.env.local atau ml-engine/.env).")
    return key


def clean_text(t: str) -> str:
    t = t.replace("\x00", " ")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def chunk_page(text: str) -> list[str]:
    """Pecah teks 1 halaman jadi potongan ~CHUNK_CHARS dgn overlap, pecah di spasi."""
    text = clean_text(text)
    if len(text) <= CHUNK_CHARS:
        return [text] if text else []
    out: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_CHARS, len(text))
        if end < len(text):
            sp = text.rfind(" ", start + CHUNK_CHARS - 300, end)
            if sp > start:
                end = sp
        piece = text[start:end].strip()
        if piece:
            out.append(piece)
        if end >= len(text):
            break
        start = max(end - CHUNK_OVERLAP, start + 1)
    return out


def embed_batch(texts: list[str], key: str) -> list[list[float]]:
    """Embed sekumpulan teks (taskType dokumen). Retry sederhana saat 429."""
    body = {
        "requests": [
            {
                "model": f"models/{EMBED_MODEL}",
                "content": {"parts": [{"text": t}]},
                "taskType": "RETRIEVAL_DOCUMENT",
                "outputDimensionality": EMBED_DIM,
            }
            for t in texts
        ]
    }
    for attempt in range(5):
        r = requests.post(f"{EMBED_URL}?key={key}", json=body, timeout=120)
        if r.status_code == 429:
            wait = 20 * (attempt + 1)
            print(f"    [rate-limit] tunggu {wait}s...")
            time.sleep(wait)
            continue
        r.raise_for_status()
        return [e["values"] for e in r.json()["embeddings"]]
    raise RuntimeError("Embedding gagal terus (429). Coba lagi nanti / aktifkan billing.")


def ingest_pdf(path: Path, buku: str, page_offset: int, key: str) -> int:
    client = get_client()
    print(f"\n[BUKU] {buku}  ({path.name})")

    # Hapus data lama buku ini agar idempoten.
    client.table("dokumen_chunks").delete().eq("buku", buku).execute()

    reader = PdfReader(str(path))
    rows: list[dict] = []
    for i, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception as e:  # noqa: BLE001
            print(f"    [warn] gagal baca halaman {i + 1}: {e}")
            continue
        halaman = i + 1 - page_offset  # nomor cetak = halaman PDF - offset
        for bagian, piece in enumerate(chunk_page(text)):
            rows.append({"buku": buku, "halaman": halaman, "bagian": bagian, "konten": piece})

    print(f"    {len(reader.pages)} halaman → {len(rows)} potongan. Meng-embed...")

    inserted = 0
    for i in range(0, len(rows), EMBED_BATCH):
        part = rows[i : i + EMBED_BATCH]
        vectors = embed_batch([r["konten"] for r in part], key)
        for r, v in zip(part, vectors):
            r["embedding"] = v
        client.table("dokumen_chunks").insert(part).execute()
        inserted += len(part)
        print(f"    {inserted}/{len(rows)} tersimpan")
        time.sleep(0.5)
    return inserted


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(DOCS_DIR_DEFAULT), help="Folder berisi PDF (default ml-engine/docs)")
    ap.add_argument("--buku", default=None, help="Override label buku (kalau hanya 1 PDF)")
    ap.add_argument("--only", default=None, help="Hanya proses PDF yg namanya mengandung teks ini (mis. 'buku 5')")
    ap.add_argument("--page-offset", type=int, default=0, help="Halaman cetak = halaman PDF - offset")
    args = ap.parse_args()

    key = _api_key()
    docs = Path(args.dir)
    pdfs = sorted(docs.glob("*.pdf"))
    if args.only:
        pdfs = [p for p in pdfs if args.only.lower() in p.name.lower()]
    if not pdfs:
        print(f"Tidak ada PDF cocok di {docs}")
        return

    total = 0
    for pdf in pdfs:
        buku = args.buku if (args.buku and len(pdfs) == 1) else pdf.stem
        total += ingest_pdf(pdf, buku, args.page_offset, key)
    print(f"\n[SELESAI] {total} potongan dari {len(pdfs)} dokumen masuk ke dokumen_chunks.")


if __name__ == "__main__":
    main()
