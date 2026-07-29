// Parser angka toleran format Indonesia/Inggris.
// Aturan: kalau hanya ADA SATU jenis pemisah (koma ATAU titik), ia dianggap
// DESIMAL — mis. "1,345" dan "1.345" sama-sama = 1.345 (satu koma tiga empat lima).
// Kalau ada DUA jenis pemisah, yang paling KANAN = desimal, sisanya ribuan —
// mis. "1.234,5" dan "1,234.5" → 1234.5.
// Karakter non-angka (unit "km", spasi, dll) diabaikan.

export function parseLocaleNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const neg = /-/.test(raw);
  const s = String(raw).replace(/[^\d.,]/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const decPos = Math.max(lastComma, lastDot);

  let normalized: string;
  if (decPos === -1) {
    normalized = s;
  } else {
    const intPart = s.slice(0, decPos).replace(/[.,]/g, "");
    const fracPart = s.slice(decPos + 1).replace(/[.,]/g, "");
    normalized = `${intPart}.${fracPart}`;
  }

  const n = Number(normalized);
  if (Number.isNaN(n)) return null;
  return neg ? -n : n;
}

/** Canonical string desimal (titik) — dipakai untuk menyimpan sel ukuran yang seragam. */
export function normalizeMeasureCell(raw: string): string {
  const n = parseLocaleNumber(raw);
  return n == null ? raw.trim() : String(n);
}
