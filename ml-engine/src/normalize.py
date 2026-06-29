"""Utilitas normalisasi data gangguan agar konsisten antar sumber.

Sheets memakai format tanggal Indonesia ("11 Juni 2026") atau "DD/MM/YYYY".
padam_apkt memakai ISO ("2026-06-11") + ULP berprefix ("ULP CAKRANEGARA").
Modul ini menyeragamkan semuanya.
"""
from __future__ import annotations

import re
from datetime import date

BULAN_ID = {
    "januari": 1, "februari": 2, "maret": 3, "april": 4, "mei": 5, "juni": 6,
    "juli": 7, "agustus": 8, "september": 9, "oktober": 10, "november": 11, "desember": 12,
}

# Substring penanda penyebab "tidak diketahui/temporer" → target Model B.
# Dibandingkan pada teks ter-normalisasi (lowercase, spasi tunggal).
_UNKNOWN_NEEDLES = (
    "tidak di temukan", "tidak ditemukan", "tidak diketahui", "tidak di ketahui",
    "belum diketahui", "dalam investigasi", "dalam penelusuran", "unknown",
    "temporer", "dicoba sekali normal",
)
# AR (auto-reclose) sukses = gangguan hilang sendiri, penyebab tak ditemukan.
_AR_RECLOSE = re.compile(r"^ar\s*\d*\s*x$")


def parse_date(s: str | None) -> date | None:
    """Parse tanggal dari Sheets (ID/slash) maupun ISO. Kembalikan date atau None."""
    if not s:
        return None
    s = s.strip()
    # ISO: 2026-06-11
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m:
        return _safe_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    # Indonesia: 11 Juni 2026
    m = re.match(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", s)
    if m:
        mon = BULAN_ID.get(m.group(2).lower())
        if mon:
            return _safe_date(int(m.group(3)), mon, int(m.group(1)))
    # Slash: 11/06/2026 (DD/MM/YYYY)
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        return _safe_date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    return None


def _safe_date(y: int, m: int, d: int) -> date | None:
    try:
        return date(y, m, d)
    except ValueError:
        return None


def parse_jam(s: str | None) -> str | None:
    """Normalkan jam ke 'HH:MM:SS' (string utk kolom TIME). None bila tak valid."""
    if not s:
        return None
    m = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?", s.strip())
    if not m:
        return None
    h, mi, se = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    if h > 23 or mi > 59 or se > 59:
        return None
    return f"{h:02d}:{mi:02d}:{se:02d}"


def parse_durasi_jam(s: str | None) -> float | None:
    """Durasi → jam (float). Dukung desimal koma ('6,5706') & format 'HH:MM(:SS)'."""
    if not s:
        return None
    s = s.strip()
    # Format jam: 6:34 atau 6:34:12 → konversi ke jam desimal
    m = re.match(r"^(\d+):(\d{2})(?::(\d{2}))?$", s)
    if m:
        return int(m.group(1)) + int(m.group(2)) / 60 + int(m.group(3) or 0) / 3600
    # Desimal (koma atau titik)
    try:
        return float(s.replace(".", "").replace(",", ".")) if "," in s else float(s)
    except ValueError:
        return None


def norm_ulp(s: str | None) -> str | None:
    """Hilangkan prefix 'ULP ', upper, trim. 'ULP CAKRANEGARA' → 'CAKRANEGARA'."""
    if not s:
        return None
    s = re.sub(r"^\s*ULP\s+", "", s.strip(), flags=re.IGNORECASE)
    return s.upper().strip() or None


def norm_penyulang(s: str | None) -> str | None:
    """Upper, rapikan spasi ganda, trim."""
    if not s:
        return None
    return re.sub(r"\s+", " ", s.strip()).upper() or None


def is_unknown_cause(s: str | None) -> bool:
    t = re.sub(r"\s+", " ", (s or "").strip().lower())
    if t in ("", "-"):
        return True
    if _AR_RECLOSE.match(t):
        return True
    return any(n in t for n in _UNKNOWN_NEEDLES)


def norm_kode(s: str | None) -> str | None:
    """Kode penyebab → upper/trim. 'i1' → 'I1', 't' → 'T'. Kosong → None."""
    if not s:
        return None
    return re.sub(r"\s+", "", s.strip()).upper() or None


def parse_arus(s: str | None) -> float | None:
    """Arus gangguan (IR/IS/IT/IN) → angka. Dukung koma desimal. Kosong → None."""
    if s is None:
        return None
    s = str(s).strip().replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def clean_penyebab(s: str | None) -> str | None:
    """Kosong/'-' → None; selain itu trim. Nilai 'unknown' tetap disimpan apa adanya."""
    if s is None:
        return None
    s = s.strip()
    return s or None


def dedup_key(penyulang: str | None, tgl: date | None, jam: str | None) -> str:
    """Kunci idempotensi sync: '{penyulang}|{tgl}|{jam|''}'."""
    return f"{penyulang or ''}|{tgl.isoformat() if tgl else ''}|{jam or ''}"
