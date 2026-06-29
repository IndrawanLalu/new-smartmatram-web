/**
 * Normalisasi nama penyulang/feeder agar bisa di-join lintas sumber
 * (gardu.feeder ↔ daily_feeder_risk.penyulang ↔ Sheets PENYULANG).
 * Buang prefiks "OL.", rapikan spasi, uppercase.
 */
export function normalizeFeeder(name: string | null | undefined): string {
  return (name ?? "")
    .toUpperCase()
    .replace(/^OL\.?\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}
