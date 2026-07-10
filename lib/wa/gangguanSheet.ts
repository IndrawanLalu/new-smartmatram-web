/**
 * Tulis 1 baris ke Google Sheets lewat Apps Script Web App (doPost).
 * API key Sheets biasa hanya bisa BACA — menulis butuh proxy ini.
 * Kode Apps Script-nya: scripts/apps-script-gangguan.gs
 * Best-effort: kalau URL belum diset atau gagal, log saja — jangan gagalkan simpan DB.
 */

const URL = process.env.GANGGUAN_SHEET_WEBHOOK_URL;
const SECRET = process.env.GANGGUAN_SHEET_SECRET || "";
const SHEET = process.env.GANGGUAN_SHEET_NAME || "GangguanRealtime";

/** fields: keyed by nama header di baris 1 sheet (Apps Script memetakan ke kolom). */
export async function appendGangguanSheet(
  fields: Record<string, string | number | null>,
): Promise<{ ok: boolean; error?: string }> {
  if (!URL) return { ok: false, error: "GANGGUAN_SHEET_WEBHOOK_URL belum diset" };
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: SECRET, sheet: SHEET, fields }),
      redirect: "follow", // Apps Script Web App membalas via 302
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false, error: data.error || `sheet ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
