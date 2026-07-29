// Parser tabel dari clipboard (paste Excel/Sheet → TSV).
// Menghormati sel ber-kutip: Excel membungkus sel yang mengandung tab/newline
// dengan "..."; kutip internal di-escape jadi "". Tanpa ini, sel multi-baris
// memecah baris → kolom bergeser → data rusak.
// Dipakai bersama: import padam-APKT & Manajemen Work Order.

export interface ClipboardTable {
  headers: string[];
  rows: string[][];
}

/** Parse teks berdelimiter jadi matrix string[][], respect sel ber-kutip. */
export function parseDelimited(raw: string, delim = "\t"): string[][] {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // "" → "
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Parse paste dari Excel/Sheet: baris pertama = header, sisanya = data.
 * Baris kosong dibuang. Return { headers, rows } — rows sejajar index headers.
 */
export function parseClipboardTable(raw: string): ClipboardTable {
  const matrix = parseDelimited(raw.trim(), "\t");
  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = matrix[0].map((h) => h.trim());
  const rows = matrix.slice(1).filter((vals) => vals.some((v) => v.trim()));
  return { headers, rows };
}
