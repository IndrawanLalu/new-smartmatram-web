/**
 * SMART → spreadsheet PRO NTB (tahap 2, 8 Nov 2026).
 *
 * PASANG SEBAGAI FILE BARU di proyek Apps Script spreadsheet PRO NTB
 * (Ekstensi → Apps Script → + → Skrip, beri nama "SmartSinkron").
 * Skrip lama (menu MilanissmostudioS, BA PRO NTB) TIDAK diubah.
 *
 *  1. Ganti RAHASIA di bawah dengan kunci dari SMART (tombol "Buat kunci").
 *  2. Terapkan → Deployment baru → jenis "Aplikasi web",
 *     Jalankan sebagai: Saya · Yang memiliki akses: Siapa saja.
 *  3. Salin URL aplikasi web ke SMART.
 *  Mengubah skrip ini = Terapkan → Kelola deployment → Edit → Versi baru.
 *
 * Pengamanan:
 *  - Tanpa RAHASIA yang benar, tidak ada yang dikerjakan.
 *  - Hanya 9 tab WO. Kolom yang baris judulnya berisi RUMUS (ARRAYFORMULA)
 *    tidak pernah ditulis — dibaca dari spreadsheet, bukan dari SMART.
 *  - Baris baru ditulis di bawah baris terakhir yang kolom TANGGAL (B)-nya
 *    terisi. Baris bolong di tengah tidak diisi.
 *  - Penanda baris SMART di KETERANGAN (AB), mis. "SMART-1a2b3c4d": kiriman
 *    ulang menimpa baris yang sama, tidak dobel. Kolom yang tidak dikirim
 *    SMART (STATUS, JAM, …) tetap isian ULP.
 *  - coba = true → hanya melaporkan rencana, TIDAK menulis apa pun.
 *  - Nilai SMART ditulis APA ADANYA (keputusan user 8 Nov: nama segmen SMART
 *    memang baru, beda dari daftar UIW). Sel yang nilainya di luar dropdown:
 *    validasinya dilepas sebentar, nilai ditulis, validasi dipasang lagi —
 *    dropdown tetap ada, sel tampil bertanda "tidak valid". Dilaporkan sebagai
 *    catatan, bukan gagal. Hanya sel kiriman SMART yang NILAINYA BERUBAH yang
 *    ditulis (kolom rumus & isian ULP tidak disentuh).
 *  - Sinkron selalu satu rentang (tanggal 1 bulan itu s.d. hari ini): baris
 *    berkode SMART di rentang itu yang TIDAK ada lagi di kiriman (pekerjaan
 *    dibatalkan/dihapus/dikembalikan di SMART) DIKOSONGKAN — baris lain tidak
 *    disentuh. Yang dikosongkan HANYA kolom tulisan SMART (KOLOM_SMART); isian
 *    ULP (STATUS, JAM, …) dan kode di KETERANGAN tetap (versi 3, 9 Nov 2026):
 *    pekerjaan yang dikembalikan lalu dikirim ulang kembali ke barisnya sendiri,
 *    tidak meninggalkan baris kosong dan tidak ditambah di bawah.
 *  - Versi 4 (9 Nov 2026): baris baru ditulis SEKALIGUS satu blok per tab
 *    (dulu per baris, ±1,2 dtk/baris); baris lama hanya bila ada sel berubah;
 *    berhenti di BATAS_MS dan menjawab `lanjut: true` — SMART memanggil lagi.
 *    WO (M) & REALISASI (N) selalu dikirim; '' = dikosongkan (mis. pekerjaan
 *    dikembalikan → realisasi hilang).
 *  - `tab` (versi 2, 9 Nov 2026): SMART mengirim satu tab per panggilan supaya
 *    tiap panggilan jauh di bawah batas 6 menit Google. Hanya tab itu yang
 *    dibaca, ditulis, dan dikosongkan.
 */

var RAHASIA = 'GANTI-DENGAN-KUNCI-DARI-SMART';

var TAB = ['WO RABAS', 'WO HARJAR', 'WO INS JTM', 'WO INS GARDU', 'WO HARGARDU',
           'WO INS JTR', 'WO IMBANG BEBAN', 'WO MUTASI TRAFO', 'WO UKUR GARDU'];
var KOLOM_AWAL = 2;      // B
var KOLOM_AKHIR = 26;    // Z
var KOLOM_KET = 28;      // AB KETERANGAN
var AWALAN = 'SMART-';
var VERSI = 4;
// Berhenti sebelum batas 6 menit Google; sisanya dikerjakan panggilan berikutnya.
var BATAS_MS = 270000;
// Kolom yang ditulis SMART: [kolom awal, banyak] — B · F..H · M..N.
var KOLOM_SMART = [[2, 1], [6, 3], [13, 2]];

function jawab(isi) {
  return ContentService.createTextOutput(JSON.stringify(isi)).setMimeType(ContentService.MimeType.JSON);
}

function hurufKeKolom(h) {
  var n = 0;
  for (var i = 0; i < h.length; i++) n = n * 26 + (h.charCodeAt(i) - 64);
  return n;
}

function nilaiSel(kolom, v) {
  if (kolom === 2 && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    var p = v.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  return v;
}

function samaNilai(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return false;
  // Kosong ≠ 0: Number('') = 0 dulu membuat WO 0 tidak tertulis dan
  // realisasi 0 tidak dikosongkan (9 Nov 2026).
  var kosong = function (v) { return v === '' || v === null || v === undefined; };
  if (kosong(a) || kosong(b)) return kosong(a) && kosong(b);
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
}

function tampil(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v;
}

// Persis — Google membandingkan dropdown persis (spasi di belakang ikut dihitung).
var normal = function (v) { return String(v == null ? '' : v); };

/** Daftar pilihan validasi sebuah aturan (null = tidak dibatasi / boleh nilai lain). */
function pilihanValidasi(aturan, tembolok) {
  if (!aturan || aturan.getAllowInvalid()) return null;
  var J = SpreadsheetApp.DataValidationCriteria;
  var jenis = aturan.getCriteriaType();
  var nilai = aturan.getCriteriaValues();
  if (jenis === J.VALUE_IN_LIST) return nilai[0].map(normal);
  if (jenis === J.VALUE_IN_RANGE) {
    var rg = nilai[0];
    var k = rg.getSheet().getName() + '!' + rg.getA1Notation();
    if (!tembolok[k]) {
      var set = {};
      rg.getValues().forEach(function (r) { r.forEach(function (v) { if (v !== '') set[normal(v)] = true; }); });
      tembolok[k] = set;
    }
    return tembolok[k];
  }
  return null;  // tanggal/angka dsb. tidak diperiksa di sini
}

function bolehNilai(pilihan, v) {
  if (!pilihan) return true;
  return Array.isArray(pilihan) ? pilihan.indexOf(normal(v)) >= 0 : !!pilihan[normal(v)];
}

/** Kolom berurutan digabung: {2:a, 6:b, 7:c} → [[2,[a]],[6,[b,c]]]. */
function potongBerurut(tulis) {
  var kol = Object.keys(tulis).map(Number).sort(function (a, b) { return a - b; });
  var hasil = [];
  kol.forEach(function (c) {
    var akhir = hasil[hasil.length - 1];
    if (akhir && akhir[0] + akhir[1].length === c) akhir[1].push(tulis[c]);
    else hasil.push([c, [tulis[c]]]);
  });
  return hasil;
}

/**
 * Tulis satu sel melewati validasi ketat: lepas → tulis → pasang lagi.
 * `aturan` dibaca di depan (bukan di sini) — membaca di sela menulis lambat.
 */
function tulisLewatiValidasi(rg, v, aturan) {
  if (aturan) rg.clearDataValidations();
  rg.setValue(v);
  if (aturan) rg.setDataValidation(aturan);
}

/**
 * Galat Google sering muncul TERLAMBAT (sesudah perintah berikutnya / saat
 * flush) dan menyebut selnya, mis. "… dalam G9351 melanggar …". Baris itu
 * ditandai gagal beserta nilainya; baris sesudahnya di tab yang sama ditandai
 * "belum tentu tertulis" — kirim ulang aman (kode SMART, tidak dobel).
 */
function tandaiGalat(hasilTab, pesan, namaTab, sejakIndeks) {
  var m = String(pesan).match(/\b([A-Z]{1,2})(\d+)\b/);
  var baris = m ? Number(m[2]) : null;
  var lewat = false;
  hasilTab.forEach(function (h, i) {
    if (h.aksi === 'hapus') return;
    if (baris && h.baris === baris) {
      var nilai = h.berubah && h.berubah[m[1]] ? ' — nilai: "' + h.berubah[m[1]][1] + '"' : '';
      h.aksi = 'gagal'; h.pesan = 'Ditolak Google di sel ' + m[1] + m[2] + nilai + '. ' + pesan;
      lewat = true;
      return;
    }
    if ((lewat || !baris || i >= sejakIndeks) && h.aksi !== 'gagal') {
      h.aksi = 'gagal';
      h.pesan = 'Belum tentu tertulis — penulisan tab ' + namaTab + ' terhenti oleh galat' + (baris ? ' di sel ' + m[1] + m[2] : '') +
        '. Perbaiki lalu kirim ulang (tidak dobel).';
    }
  });
}

function keIso(v) {
  return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
}

function doPost(e) {
  var isi;
  try { isi = JSON.parse(e.postData.contents); } catch (x) { return jawab({ ok: false, error: 'Isi kiriman bukan JSON.' }); }
  if (!RAHASIA || RAHASIA.indexOf('GANTI-') === 0 || isi.rahasia !== RAHASIA) {
    return jawab({ ok: false, error: 'Kunci tidak cocok — samakan RAHASIA di skrip dengan kunci di SMART.' });
  }
  var coba = isi.coba !== false;
  var baris = isi.baris || [];
  var rentang = isi.rentang || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rentang.dari || '') || !/^\d{4}-\d{2}-\d{2}$/.test(rentang.sampai || '')) {
    return jawab({ ok: false, error: 'Rentang sinkron tidak disebut.' });
  }
  var daftarTab = TAB;
  if (isi.tab) {
    if (TAB.indexOf(isi.tab) < 0) return jawab({ ok: false, error: 'Tab tidak dikenal: ' + isi.tab });
    if (baris.some(function (b) { return b.tab !== isi.tab; })) return jawab({ ok: false, error: 'Ada baris di luar tab ' + isi.tab + '.' });
    daftarTab = [isi.tab];
  }
  var dikirim = {};
  baris.forEach(function (b) { dikirim[b.kode] = true; });
  var mulai = Date.now();
  var lanjut = false;
  var kunci = LockService.getDocumentLock();
  // tryLock, bukan waitLock: gagal mendapat kunci = jawaban JSON yang jelas,
  // bukan halaman galat Google ("jawaban skrip bukan JSON").
  if (!kunci.tryLock(30000)) {
    return jawab({ ok: false, error: 'Spreadsheet sedang ditulis kiriman lain — tunggu sebentar lalu kirim ulang (tidak dobel).' });
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hasil = [];
    var perTab = {};
    baris.forEach(function (b) { (perTab[b.tab] = perTab[b.tab] || []).push(b); });

    Object.keys(perTab).forEach(function (namaTab) {
      if (TAB.indexOf(namaTab) < 0) {
        perTab[namaTab].forEach(function (b) { hasil.push({ kode: b.kode, tab: namaTab, aksi: 'gagal', pesan: 'Tab tidak dikenal.' }); });
      }
    });

    // Semua tab (atau satu tab yang diminta) diperiksa — juga yang tidak ada
    // kirimannya, supaya yang dihapus di SMART ikut kosong.
    var tugasTulis = [];
    daftarTab.forEach(function (namaTab) {
      var daftar = perTab[namaTab] || [];
      var sh = ss.getSheetByName(namaTab);
      if (!sh) {
        daftar.forEach(function (b) { hasil.push({ kode: b.kode, tab: namaTab, aksi: 'gagal', pesan: 'Tab tidak ada di spreadsheet ini.' }); });
        return;
      }
      // Kolom berumus = sel baris judul yang berisi rumus.
      var judul = sh.getRange(1, KOLOM_AWAL, 1, KOLOM_AKHIR - KOLOM_AWAL + 1).getFormulas()[0];
      var rumus = {};
      judul.forEach(function (f, i) { if (f) rumus[KOLOM_AWAL + i] = true; });

      var maks = sh.getMaxRows();
      var tgl = sh.getRange(2, 2, maks - 1, 1).getValues();
      var ket = sh.getRange(2, KOLOM_KET, maks - 1, 1).getValues();
      var terakhir = 1;
      var milikSmart = {};
      var hapus = [];
      for (var i = 0; i < tgl.length; i++) {
        var k = String(ket[i][0] || '');
        // Baris terakhir = bertanggal ATAU berkode SMART (baris yang dikosongkan
        // tetap milik kodenya — tidak boleh tertimpa baris baru).
        if ((tgl[i][0] !== '' && tgl[i][0] !== null) || k.indexOf(AWALAN) === 0) terakhir = i + 2;
        if (k.indexOf(AWALAN) !== 0) continue;
        milikSmart[k] = i + 2;
        var t = keIso(tgl[i][0]);
        if (!dikirim[k] && t >= rentang.dari && t <= rentang.sampai) hapus.push({ kode: k, baris: i + 2, tgl: t });
      }

      // ── Tahap 1: rencanakan semuanya TANPA menulis (satu blok baca). Baca
      // sesudah tulis memaksa Google menghitung ulang semua rumus spreadsheet —
      // diselang-seling per baris, satu kiriman bisa > 5 menit (8 Nov 2026).
      var rencana = [];
      daftar.forEach(function (b) {
        var r, aksi;
        if (milikSmart[b.kode]) { r = milikSmart[b.kode]; aksi = 'ubah'; }
        else if (b.baris && b.baris > 1 && b.baris <= maks && !String(ket[b.baris - 2][0] || '')
                 && keIso(tgl[b.baris - 2][0]) === String((b.kolom || {}).B || '')) {
          // Baris yang dulu ditempel manual dari SMART: ditandai, bukan ditambah.
          // Hanya bila TANGGAL-nya sama & KETERANGAN kosong — hasil Cek yang basi
          // (baris dihapus/bergeser) tidak boleh menimpa baris lain.
          r = b.baris; aksi = 'tandai';
        } else { terakhir += 1; r = terakhir; aksi = 'tambah'; }
        rencana.push({ b: b, r: r, aksi: aksi });
      });

      // Validasi HANYA untuk jendela baris yang akan ditulis — membaca aturan
      // validasi sepanjang kolom (±10 ribu baris × 6 kolom × 9 tab) sangat lambat.
      var kolomKirim = {};
      daftar.forEach(function (b) { Object.keys(b.kolom || {}).forEach(function (h) { kolomKirim[hurufKeKolom(h)] = true; }); });
      var validasi = {};
      var tembolokDaftar = {};
      // Baris baru (tambah) tidak dibaca: isinya pasti kosong, dropdown-nya
      // diurus sekaligus saat blok ditulis.
      var lamaSaja = rencana.filter(function (x) { return x.aksi !== 'tambah'; });
      var barisTulis = lamaSaja.map(function (x) { return Math.min(x.r, maks); });
      var vAtas = barisTulis.length ? Math.min.apply(null, barisTulis) : 0;
      var vBawah = barisTulis.length ? Math.max.apply(null, barisTulis) : 0;
      if (barisTulis.length) {
        Object.keys(kolomKirim).forEach(function (c) {
          c = Number(c);
          if (c >= KOLOM_AWAL && c <= KOLOM_AKHIR && !rumus[c]) validasi[c] = sh.getRange(vAtas, c, vBawah - vAtas + 1, 1).getDataValidations();
        });
      }
      var aturanSel = function (r, c) {
        var v = validasi[c];
        if (!v) return null;
        // Baris baru di bawah lembar: pakai aturan baris terakhir (biasanya disalin ke bawah).
        var i = Math.min(r, maks) - vAtas;
        return i >= 0 && v[i] ? v[i][0] : null;
      };

      var ada = lamaSaja.filter(function (x) { return x.r <= maks; }).map(function (x) { return x.r; });
      var atas = ada.length ? Math.min.apply(null, ada) : 0;
      var bawah = ada.length ? Math.max.apply(null, ada) : 0;
      var blok = ada.length ? sh.getRange(atas, KOLOM_AWAL, bawah - atas + 1, KOLOM_AKHIR - KOLOM_AWAL + 1).getValues() : [];

      rencana.forEach(function (x) {
        var lama = x.aksi !== 'tambah' && x.r <= maks && blok.length ? blok[x.r - atas] : [];
        x.tulis = {}; x.luar = {}; x.berubah = {}; x.dilewati = []; x.luarDaftar = [];
        var kolom = x.b.kolom || {};
        Object.keys(kolom).forEach(function (h) {
          var c = hurufKeKolom(h);
          if (c < KOLOM_AWAL || c > KOLOM_AKHIR || rumus[c]) { x.dilewati.push(h); return; }
          var v = nilaiSel(c, kolom[h]);
          var l = lama.length ? lama[c - KOLOM_AWAL] : '';
          if (samaNilai(l, v)) return;   // sama → tidak ditulis ulang
          var aturan = aturanSel(x.r, c);
          // Sel bervalidasi ketat SELALU ditulis melewati validasi — pemeriksaan di
          // sini bisa beda dari Google, dan galat validasi Google muncul terlambat
          // (menghentikan seluruh kiriman, G9351 8 Nov 2026).
          if (aturan && !aturan.getAllowInvalid()) x.luar[c] = aturan;
          if (!bolehNilai(pilihanValidasi(aturan, tembolokDaftar), v)) x.luarDaftar.push(h);
          x.tulis[c] = v;
          x.berubah[h] = [tampil(l), tampil(v)];
        });
      });

      // ── Tahap 2: tulis — dijalankan SESUDAH semua tab selesai dibaca.
      // Urutan: kosongkan → perbarui baris lama (per baris, hanya sel yang
      // berubah) → tambah baris baru SEKALIGUS SATU BLOK. Waktu habis
      // (BATAS_MS) → berhenti, sisanya dikerjakan panggilan berikutnya
      // (`lanjut`): semua berkode, jadi yang sudah tertulis terbaca "sama".
      tugasTulis.push(function () {
      var hasilTab = [];
      var habis = function () { return Date.now() - mulai > BATAS_MS; };
      var sisa = function (kode, pesan) { hasilTab.push({ kode: kode, tab: namaTab, aksi: 'sisa', pesan: pesan }); lanjut = true; };

      hapus.forEach(function (h) {
        if (!coba) {
          if (habis()) { sisa(h.kode, 'Waktu habis — dikosongkan pada panggilan berikutnya.'); return; }
          // clearContent, bukan setValue('') — sel kosong lolos validasi dropdown.
          // Kolom rumus ikut kosong = sama dengan sel kosong, ARRAYFORMULA tetap
          // jalan. Kode di KETERANGAN sengaja DITINGGAL.
          KOLOM_SMART.forEach(function (k) { sh.getRange(h.baris, k[0], 1, k[1]).clearContent(); });
        }
        hasilTab.push({ kode: h.kode, tab: namaTab, baris: h.baris, aksi: 'hapus', pesan: 'Tidak ada lagi di SMART (tanggal ' + h.tgl + ') — isian SMART dikosongkan, kode tetap.' });
      });

      var catat = function (x) {
        hasilTab.push({ kode: x.b.kode, tab: namaTab, baris: x.r, aksi: x.aksi, berubah: x.berubah, dilewati: x.dilewati,
          luarDaftar: x.luarDaftar });
      };

      // Baris lama: hanya yang ada selnya berubah.
      rencana.filter(function (x) { return x.aksi !== 'tambah'; }).forEach(function (x) {
        if (!Object.keys(x.tulis).length && x.aksi === 'ubah') { catat(x); return; }   // sama persis
        if (!coba) {
          if (habis()) { sisa(x.b.kode, 'Waktu habis — diperbarui pada panggilan berikutnya.'); return; }
          try {
            var biasa = {};
            Object.keys(x.tulis).forEach(function (c) {
              if (x.luar.hasOwnProperty(c)) tulisLewatiValidasi(sh.getRange(x.r, Number(c)), x.tulis[c], x.luar[c]);
              else biasa[c] = x.tulis[c];
            });
            potongBerurut(biasa).forEach(function (p) {
              try { sh.getRange(x.r, p[0], 1, p[1].length).setValues([p[1]]); }
              catch (e) {
                // Validasi yang tak terbaca di depan: tulis per sel melewati validasi.
                p[1].forEach(function (v, j) {
                  var c = p[0] + j;
                  tulisLewatiValidasi(sh.getRange(x.r, c), v, aturanSel(x.r, c));
                });
              }
            });
            // Kode sudah ada (aksi 'ubah') = tidak ditulis ulang.
            if (x.aksi !== 'ubah') sh.getRange(x.r, KOLOM_KET).setValue(x.b.kode);
          } catch (e) {
            catat(x);
            tandaiGalat(hasilTab, String(e && e.message || e), namaTab, hasilTab.length - 1);
            return;
          }
        }
        catat(x);
      });

      // Baris baru: satu blok berurutan di bawah baris terakhir. Satu setValues
      // per potongan kolom SMART (B · F..H · M..N, tanpa kolom rumus) + satu
      // untuk kode — berapa pun banyaknya baris. Dropdown di blok itu
      // disimpan → dilepas → nilai ditulis → dipasang lagi (sekali per kolom).
      var baru = rencana.filter(function (x) { return x.aksi === 'tambah'; });
      if (baru.length && !coba) {
        if (habis()) {
          baru.forEach(function (x) { sisa(x.b.kode, 'Waktu habis — ditambah pada panggilan berikutnya.'); });
          baru = [];
        } else {
          var atasBaru = baru[0].r, n = baru.length;
          if (atasBaru + n - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), atasBaru + n - 1 - sh.getMaxRows());
          var kolomTulis = [];
          KOLOM_SMART.forEach(function (k) { for (var c = k[0]; c < k[0] + k[1]; c++) if (!rumus[c]) kolomTulis.push(c); });
          try {
            var simpanDv = {};
            kolomTulis.forEach(function (c) {
              var rg = sh.getRange(atasBaru, c, n, 1);
              var dv = rg.getDataValidations();
              if (dv.some(function (r) { return r[0] && !r[0].getAllowInvalid(); })) { simpanDv[c] = dv; rg.clearDataValidations(); }
            });
            potongBerurut(kolomTulis.reduce(function (o, c) { o[c] = c; return o; }, {})).forEach(function (pt) {
              var isiBlok = baru.map(function (x) {
                return pt[1].map(function (c) { return x.tulis.hasOwnProperty(c) ? x.tulis[c] : ''; });
              });
              sh.getRange(atasBaru, pt[0], n, pt[1].length).setValues(isiBlok);
            });
            sh.getRange(atasBaru, KOLOM_KET, n, 1).setValues(baru.map(function (x) { return [x.b.kode]; }));
            Object.keys(simpanDv).forEach(function (c) { sh.getRange(atasBaru, Number(c), n, 1).setDataValidations(simpanDv[c]); });
          } catch (e) {
            baru.forEach(catat);
            tandaiGalat(hasilTab, String(e && e.message || e), namaTab, hasilTab.length - n);
            baru = [];
          }
        }
      }
      baru.forEach(catat);

      // Satu flush per tab: galat yang tertunda ketahuan di tab-nya sendiri.
      if (!coba) {
        try { SpreadsheetApp.flush(); }
        catch (e) { tandaiGalat(hasilTab, String(e && e.message || e), namaTab, hasilTab.length); }
      }
      hasilTab.forEach(function (h) { hasil.push(h); });
      });
    });
    tugasTulis.forEach(function (f) { f(); });
    return jawab({ ok: true, versi: VERSI, coba: coba, lanjut: lanjut, hasil: hasil });
  } catch (x) {
    // Hasil yang sudah terkumpul tetap dikirim balik supaya terlihat sampai mana.
    return jawab({ ok: false, error: String(x && x.message || x), hasil: hasil });
  } finally {
    kunci.releaseLock();
  }
}
