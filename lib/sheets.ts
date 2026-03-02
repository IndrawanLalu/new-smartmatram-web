const SPREADSHEET_ID = "153-gxDh8XrlT1AbNWb5jws0MVc-qD9IQNxxJLRqlKJg";
const API_KEY = "AIzaSyAZ1aJVdOVCv4Of60ZwPRsabQsgLaBxzQU";

export async function fetchSheetData(
  sheetName: string,
  range: string
): Promise<Record<string, string>[]> {
  const fullRange = `${sheetName}!${range}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(fullRange)}?key=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheets fetch failed: ${res.status}`);

  const json = await res.json();
  const rows: string[][] = json.values ?? [];
  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
}
