/**
 * Apps Script Web App — proxy TULIS ke Google Sheets untuk log Penormalan Gangguan.
 * Dipanggil dari Next.js: lib/wa/gangguanSheet.ts (POST JSON).
 *
 * CARA PASANG:
 * 1. Buka spreadsheet tujuan → Extensions → Apps Script.
 * 2. Tempel kode ini, ganti SECRET dengan nilai yang sama dgn env GANGGUAN_SHEET_SECRET.
 * 3. Buat sheet "GangguanRealtime" dengan HEADER di baris 1 (urutan bebas, nama harus sama):
 *      Tanggal | Jenis | Judul | Section Padam | Keypoint | Penyulang | UP3 | ULP | Trafo/GI | Waktu Padam | Waktu Nyala |
 *      Durasi (menit) | Relay | Beban (kW) | Arus R | Arus S | Arus T | Arus N |
 *      Total Trip | ENS (kWh) | Penyebab | Eksekusi | Cuaca | Sumber | Pelapor
 * 4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * 5. Salin URL /exec ke env GANGGUAN_SHEET_WEBHOOK_URL.
 */

var SECRET = "GANTI_DENGAN_SECRET_YANG_SAMA";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return json({ ok: false, error: "unauthorized" });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(body.sheet || "GangguanRealtime");
    if (!sh) return json({ ok: false, error: "sheet tidak ditemukan" });

    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var fields = body.fields || {};
    var row = headers.map(function (h) {
      var v = fields[h];
      return v === null || v === undefined ? "" : v;
    });
    sh.appendRow(row);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
