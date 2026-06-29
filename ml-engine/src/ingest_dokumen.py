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

# Embedding provider: "ollama" (gratis, lokal) default; "gemini" (butuh billing/kuota).
# HARUS sama dgn yg dipakai chatbot saat query (app/api/chat/route.ts) & dimensi DB.
EMBED_PROVIDER = os.environ.get("EMBED_PROVIDER", "ollama").lower()
EMBED_BASE = os.environ.get("EMBED_BASE_URL", "http://127.0.0.1:11434")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text")
EMBED_DIM = int(os.environ.get("EMBED_DIM", "768"))
CHUNK_CHARS = 1200          # ~300-400 token per potongan
CHUNK_OVERLAP = 200
EMBED_BATCH = 50
DOCS_DIR_DEFAULT = Path(__file__).resolve().parent.parent / "docs"


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


def _embed_ollama(texts: list[str]) -> list[list[float]]:
    # Prefix Nomic untuk dokumen → kualitas retrieval lebih baik.
    inputs = [f"search_document: {t}" for t in texts]
    for attempt in range(5):
        r = requests.post(f"{EMBED_BASE}/api/embed",
                          json={"model": EMBED_MODEL, "input": inputs}, timeout=300)
        if r.status_code >= 500:
            time.sleep(3 * (attempt + 1)); continue
        r.raise_for_status()
        return r.json()["embeddings"]
    raise RuntimeError("Embedding Ollama gagal. Pastikan Ollama jalan & model ter-pull.")


def _embed_gemini(texts: list[str]) -> list[list[float]]:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("EMBED_PROVIDER=gemini tapi GEMINI_API_KEY tak ada.")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:batchEmbedContents?key={key}"
    body = {"requests": [
        {"model": f"models/{EMBED_MODEL}", "content": {"parts": [{"text": t}]},
         "taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": EMBED_DIM}
        for t in texts]}
    for attempt in range(5):
        r = requests.post(url, json=body, timeout=120)
        if r.status_code == 429:
            wait = 20 * (attempt + 1)
            print(f"    [rate-limit] tunggu {wait}s...")
            time.sleep(wait); continue
        r.raise_for_status()
        return [e["values"] for e in r.json()["embeddings"]]
    raise RuntimeError("Embedding Gemini gagal terus (429).")


def embed_batch(texts: list[str]) -> list[list[float]]:
    return _embed_ollama(texts) if EMBED_PROVIDER == "ollama" else _embed_gemini(texts)


def ingest_pdf(path: Path, buku: str, page_offset: int) -> int:
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
        vectors = embed_batch([r["konten"] for r in part])
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

    print(f"Embedding: provider={EMBED_PROVIDER} model={EMBED_MODEL} dim={EMBED_DIM}")
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
        total += ingest_pdf(pdf, buku, args.page_offset)
    print(f"\n[SELESAI] {total} potongan dari {len(pdfs)} dokumen masuk ke dokumen_chunks.")


if __name__ == "__main__":
    main()
