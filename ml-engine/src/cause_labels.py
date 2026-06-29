"""Normalisasi label penyebab gangguan → 5 kelas bersih (Model B).

Dipakai untuk:
  - Membuat label training dari known events (Sheets → DB).
  - Fallback baseline saat XGBoost tidak tersedia/tidak layak.
"""
from __future__ import annotations

CLASSES = [
    "Cuaca (angin/hujan/petir)",
    "Pohon / ROW",
    "Aset / Peralatan",
    "Binatang / Hewan",
    "Manusia / Eksternal",
    "Lain-lain",
]

# Diperiksa berurutan; kelas pertama yang cocok dipakai.
_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("Cuaca (angin/hujan/petir)", (
        "petir", "lightning", "angin", "hujan", "badai", "cuaca", "kilat",
        "guruh", "sambaran", "korsleting cuaca", "banjir", "thunder",
    )),
    ("Pohon / ROW", (
        "pohon", "dahan", "ranting", "bambu", "kayu", "semak", "vegetasi",
        "tanaman", "tumbang", "rabas", "row",
    )),
    ("Binatang / Hewan", (
        "binatang", "hewan", "monyet", "kera", "tokek", "cicak", "ular",
        "biawak", "kadal", "reptil", "tikus", "burung", "kelelawar", "kalong",
        "kucing", "musang", "tupai", "ayam", "sarang burung", "sarang", "ulat",
    )),
    ("Aset / Peralatan", (
        "fco", "trafo", "transformer", "kabel", "kawat", "konduktor", "jumper",
        "isolator", "arrester", "kubikel", "las", "putus", "rusak", "bocor",
        "tiang roboh", "crossarm", "beban lebih", "overload", "meledak",
        "kebocoran minyak", "hubung singkat", "korsleting",
    )),
    ("Manusia / Eksternal", (
        "kendaraan", "mobil", "truk", "excavator", "alat berat", "pembangunan",
        "galian", "layang", "pencurian", "vandalisme", "bakar", "terbakar",
    )),
]


# KODE penyebab terstruktur dari Sheets (otoritatif). T = temporer/unknown → target Model B.
KODE_CAUSE: dict[str, str] = {
    "I1": "Aset / Peralatan",   # komponen jaringan
    "I2": "Aset / Peralatan",   # peralatan jaringan (FCO, LBS)
    "I3": "Aset / Peralatan",   # (legenda belum pasti — I-series internal)
    "I4": "Aset / Peralatan",   # tiang/trafo
    "E1": "Pohon / ROW",
    "E2": "Cuaca (angin/hujan/petir)",
    "E3": "Binatang / Hewan",   # binatang / kabel wifi nempel
    "E4": "Manusia / Eksternal",  # pekerjaan pihak ketiga (galian, layangan)
}


def cause_from_kode(kode: str | None) -> str | None:
    """KODE → kategori penyebab. 'T' atau kosong → None (unknown, target Model B)."""
    if not kode:
        return None
    k = kode.strip().upper()
    if k == "T":
        return None
    return KODE_CAUSE.get(k, "Lain-lain")


def normalize_cause(raw: str | None) -> str | None:
    """Map raw penyebab → CLASSES.

    Kembalikan None jika is_unknown_cause(raw) → event ini jadi target Model B.
    Kembalikan 'Lain-lain' jika diketahui tapi tidak cocok keyword manapun.
    """
    from .normalize import is_unknown_cause
    if is_unknown_cause(raw):
        return None
    t = (raw or "").lower().strip()
    for cls, needles in _RULES:
        if any(n in t for n in needles):
            return cls
    return "Lain-lain"
