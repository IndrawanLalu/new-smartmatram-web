/**
 * SMART Mataram — WO write-back ke Google Sheet
 * ================================================
 * PASANG SEKALI:
 *  1. Buka https://script.google.com → New project (standalone).
 *  2. Tempel seluruh isi file ini.
 *  3. Ganti SECRET di bawah dengan nilai yang SAMA dengan env `WO_SHEET_SECRET` di SMART.
 *  4. Deploy → New deployment → pilih "Web app".
 *       - Execute as: Me (akun yang punya akses edit ke semua Sheet WO)
 *       - Who has access: Anyone
 *  5. Salin URL Web App → taruh di env `WO_SHEET_WEBHOOK_URL` di SMART.
 *
 * Satu skrip ini bisa menulis ke SEMUA spreadsheet unit (via openById),
 * asalkan akun "Execute as" punya akses edit ke spreadsheet tsb.
 */

const SECRET = "GANTI_DENGAN_SECRET";

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return json_({ ok: false, error: "unauthorized" });

    const ss = SpreadsheetApp.openById(body.spreadsheetId);
    const sh = ss.getSheetByName(body.tab);
    if (!sh) return json_({ ok: false, error: "Tab '" + body.tab + "' tidak ditemukan" });

    const values = sh.getDataRange().getValues();
    if (values.length < 2) return json_({ ok: true, updated: 0 });
    const header = values[0].map(function (h) { return String(h).trim(); });
    const colIndex = function (name) { return header.indexOf(String(name).trim()); };

    // body.rows = [{ key: { NO_WO: "...", NO: "1" }, set: { "TGL REALISASI": "...", "VERIFIKATOR": "..." } }]
    const rows = body.rows || [];
    let updated = 0;

    for (let i = 0; i < rows.length; i++) {
      const key = rows[i].key || {};
      const set = rows[i].set || {};
      const keyCols = Object.keys(key);

      for (let r = 1; r < values.length; r++) {
        let match = keyCols.length > 0;
        for (let k = 0; k < keyCols.length; k++) {
          const ci = colIndex(keyCols[k]);
          if (ci < 0 || String(values[r][ci]).trim() !== String(key[keyCols[k]]).trim()) { match = false; break; }
        }
        if (!match) continue;

        Object.keys(set).forEach(function (col) {
          const ci = colIndex(col);
          if (ci >= 0) sh.getRange(r + 1, ci + 1).setValue(set[col]);
        });
        updated++;
        break; // kunci unik → satu baris
      }
    }
    return json_({ ok: true, updated: updated });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
