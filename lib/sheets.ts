const SPREADSHEET_ID = "153-gxDh8XrlT1AbNWb5jws0MVc-qD9IQNxxJLRqlKJg";
const API_KEY = "AIzaSyAZ1aJVdOVCv4Of60ZwPRsabQsgLaBxzQU";

// Module-level cache — bertahan selama browser session, TTL 5 menit
const _cache = new Map<string, { data: Record<string, string>[]; ts: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function fetchSheetData(
  sheetName: string,
  range: string
): Promise<Record<string, string>[]> {
  const key = `${sheetName}|${range}`;
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.data;

  const fullRange = `${sheetName}!${range}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(fullRange)}?key=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheets fetch failed: ${res.status}`);

  const json = await res.json();
  const rows: string[][] = json.values ?? [];
  if (rows.length < 2) {
    _cache.set(key, { data: [], ts: Date.now() });
    return [];
  }

  const headers = rows[0];
  const data = rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });

  _cache.set(key, { data, ts: Date.now() });
  return data;
}
